const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
const sessions = new Map();
const authDirectory = process.env.BAILEYS_AUTH_DIR || '/app/auth_info';
const gatewayToken = process.env.GATEWAY_TOKEN;
const statusWebhookUrl = process.env.BACKEND_STATUS_WEBHOOK_URL;
const port = Number(process.env.BAILEYS_PORT || 4000);

if (!gatewayToken || gatewayToken.length < 32 || !statusWebhookUrl || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('GATEWAY_TOKEN, BACKEND_STATUS_WEBHOOK_URL, and a valid BAILEYS_PORT must be configured');
}

app.use(express.json({ limit: '64kb' }));

function unauthorized(req, res, next) {
    const value = req.get('authorization') || '';
    const provided = Buffer.from(value.startsWith('Bearer ') ? value.slice(7) : '');
    const expected = Buffer.from(gatewayToken);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
}

function validDeviceId(id) {
    return /^[0-9a-f-]{36}$/i.test(id);
}

// ---------------------------------------------------------------------------------
// Operasional: level log, filter derau libsignal, dan pelacakan state per perangkat
// ---------------------------------------------------------------------------------
// `libsignal` (dipakai Baileys) menulis langsung ke console: stack `Bad MAC`,
// `SessionError: No matching sessions found`, plus dump objek session. Akibatnya
// `docker compose logs baileys` tenggelam di ribuan baris dan sinyal penting
// (koneksi terputus / QR perlu dipindai ulang) tidak terlihat. Derau dikenali,
// dihitung, lalu ditulis sebagai satu baris ringkasan per menit.
const LOG_LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: 99 };
const LOG_LEVEL = (process.env.BAILEYS_LOG_LEVEL || 'warn').toLowerCase();
const LOG_THRESHOLD = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.warn;
const NOISE_LOG_INTERVAL_MS = 60_000;
const RECONNECT_MAX = Number(process.env.BAILEYS_RECONNECT_MAX || 8);
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const MAINTENANCE_RETRY_MS = 300_000;
const QR_CYCLE_LIMIT = Number(process.env.BAILEYS_QR_CYCLE_LIMIT || 3);
const SELF_DECRYPT_WINDOW_MS = 300_000;
const SELF_DECRYPT_WARN_THRESHOLD = Number(process.env.BAILEYS_SELF_DECRYPT_WARN_THRESHOLD || 3);
// Ambang auto-penautan-ulang saat pesan sendiri (fromMe) gagal didekripsi.
// 0 = nonaktif (hanya memperingatkan) karena menautkan ulang memaksa pindai QR baru.
const SELF_DECRYPT_REPAIR_THRESHOLD = Number(process.env.BAILEYS_SELF_DECRYPT_REPAIR_THRESHOLD || 0);

// Salinan asli console: dipakai agar log kita sendiri tidak ikut tersaring.
const output = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

const NOISE_RULES = [
    { kind: 'bad_mac', match: /Bad MAC/i },
    { kind: 'no_matching_session', match: /No matching sessions found/i },
    { kind: 'message_counter', match: /MessageCounterError|Key used already or never filled/i },
    { kind: 'decrypt_unknown_session', match: /Failed to decrypt message with any known session/i },
    { kind: 'session_error', match: /Session error:/ },
    {
        kind: 'session_dump',
        match:
            /Closing session:|Opening session:|Closing open session|Removing old closed session|Session already (closed|open)|Decrypted message with closed session/i,
    },
    { kind: 'prekey_bundle', match: /in favor of incoming prekey bundle/i },
    { kind: 'signal_assertion', match: /Unhandled bucket type|Expected pubkey of length 33/i },
    // Transien khas sesaat setelah reconnect: init queries ke server WA timeout,
    // socket tetap hidup dan terhubung. Cukup dihitung, tidak perlu dibanjirkan.
    { kind: 'init_queries_timeout', match: /init queries/i },
];

const noiseStats = new Map();

function asText(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '[objek tidak dapat diserialisasi]';
        }
    }
    return String(value);
}

function noiseTotals() {
    const kinds = {};
    let suppressed = 0;
    for (const [kind, entry] of noiseStats) {
        kinds[kind] = entry.total;
        suppressed += entry.total;
    }
    return { suppressed, kinds };
}

function recordNoise(kind, sample) {
    const entry = noiseStats.get(kind) ?? { pending: 0, total: 0, lastLoggedAt: 0 };
    entry.pending += 1;
    entry.total += 1;
    noiseStats.set(kind, entry);
    const now = Date.now();
    if (now - entry.lastLoggedAt < NOISE_LOG_INTERVAL_MS) return;
    const pending = entry.pending;
    entry.pending = 0;
    entry.lastLoggedAt = now;
    output.warn(`[noise] ${kind}: ${pending} entri dalam ${NOISE_LOG_INTERVAL_MS / 1000}s disembunyikan (total ${entry.total}) — ${sample}`);
}

function installNoiseFilter() {
    for (const method of ['log', 'info', 'warn', 'error']) {
        console[method] = (...args) => {
            const joined = args.map(asText).join(' ').replace(/\s+/g, ' ');
            const rule = NOISE_RULES.find((candidate) => candidate.match.test(joined));
            if (rule) {
                recordNoise(rule.kind, joined.slice(0, 140));
                return;
            }
            output[method](...args);
        };
    }
}

// Kegagalan dekripsi (libsignal maupun logger Baileys) dilacak per perangkat.
const decryptFailures = new Map();

function noteDecryptFailure(deviceId, message, context) {
    const key = deviceId ?? 'unbound';
    const entry = decryptFailures.get(key) ?? { total: 0, fromMe: 0, window: [] };
    entry.total += 1;
    const fromMe = context?.key?.fromMe === true;
    if (fromMe) {
        entry.fromMe += 1;
        const now = Date.now();
        entry.window = entry.window.filter((stamp) => now - stamp < SELF_DECRYPT_WINDOW_MS);
        entry.window.push(now);
    }
    decryptFailures.set(key, entry);

    const jid = context?.key?.remoteJid ? ` jid=${context.key.remoteJid}` : '';
    recordNoise('decrypt_failure', `${message || 'failed to decrypt message'}${fromMe ? ' fromMe=true' : ''}${jid}`);

    if (entry.window.length === SELF_DECRYPT_WARN_THRESHOLD) {
        output.warn(
            `[baileys/${String(key).slice(0, 8)}] ${entry.window.length} pesan sendiri gagal didekripsi dalam ${SELF_DECRYPT_WINDOW_MS / 60000} menit — bila penerima melihat "Menunggu pesan ini", tautkan ulang perangkat lewat tombol QR.`,
        );
    }
    if (deviceId && SELF_DECRYPT_REPAIR_THRESHOLD > 0 && entry.window.length >= SELF_DECRYPT_REPAIR_THRESHOLD) {
        entry.window = [];
        output.warn(`[baileys/${deviceId.slice(0, 8)}] ambang kegagalan dekripsi tercapai — menautkan ulang otomatis (QR baru menyusul).`);
        void resetAuthState(deviceId, 'self_decrypt_failures');
    }
}

function isDecryptFailure(message, context) {
    if (/failed to decrypt message|no matching sessions found|bad mac|session error/i.test(message)) return true;
    const type = context?.err?.type ?? context?.err?.name;
    return typeof type === 'string' && /SessionError/i.test(type);
}

// Logger pengganti pino: satu baris per kejadian, tanpa stack trace, dan
// `failed to decrypt message` masuk ke penghitung alih-alih membanjiri log.
function createLogger(bindings = {}) {
    const logger = { level: LOG_LEVEL };
    const prefix = `[baileys${bindings.device ? `/${bindings.device.slice(0, 8)}` : ''}]`;
    const write = (weight, args) => {
        if (weight < LOG_THRESHOLD) return;
        const first = args[0];
        const context = first && typeof first === 'object' && !(first instanceof Error) ? first : null;
        const message = typeof first === 'string' ? first : typeof args[1] === 'string' ? args[1] : '';
        if (isDecryptFailure(message, context) || isDecryptFailure(asText(first), null)) {
            noteDecryptFailure(bindings.device ?? null, message || asText(first), context);
            return;
        }
        const error = context?.err ?? (first instanceof Error ? first : null);
        const detail = error?.message ? `${error.type || error.name || 'Error'}: ${error.message}` : '';
        const line = `${prefix} ${message || asText(first)}${detail ? ` → ${detail}` : ''}`.slice(0, 600);
        // Aturan derau juga harus berlaku di jalur logger Baileys sendiri: `output`
        // memegang console.* asli yang di-bind sebelum installNoiseFilter(), jadi
        // tanpa pemeriksaan ini transien seperti 'init queries' Timeout tetap lolos.
        const noise = NOISE_RULES.find((candidate) => candidate.match.test(line));
        if (noise) {
            recordNoise(noise.kind, line.slice(0, 140));
            return;
        }
        if (weight >= LOG_LEVELS.error) output.error(line);
        else if (weight >= LOG_LEVELS.warn) output.warn(line);
        else output.info(line);
        if (LOG_THRESHOLD <= LOG_LEVELS.debug && context) output.info(`${prefix} konteks ${asText(context)}`.slice(0, 600));
    };
    for (const [level, weight] of Object.entries(LOG_LEVELS)) {
        if (level === 'silent') continue;
        logger[level] = (...args) => write(weight, args);
    }
    logger.child = (extra) => createLogger({ ...bindings, ...(extra || {}) });
    logger.isLevelEnabled = (level) => (LOG_LEVELS[level] ?? 0) >= LOG_THRESHOLD;
    return logger;
}

installNoiseFilter();

// State per perangkat bertahan lintas siklus socket (agregat tetap terbaca walau
// socket diganti oleh percobaan reconnect).
const deviceState = new Map();

function stateFor(deviceId) {
    let entry = deviceState.get(deviceId);
    if (!entry) {
        entry = {
            paired: false,
            reconnect_attempts: 0,
            qr_cycles: 0,
            auto_repairs: 0,
            last_close_code: null,
            last_close_reason: null,
            last_error: null,
            qr_generated_at: null,
            paired_at: null,
            getmessage_misses: 0,
        };
        deviceState.set(deviceId, entry);
    }
    return entry;
}

// Putus permanen dari sisi WhatsApp: kredensial tidak dapat dipakai lagi → QR baru.
const AUTH_RESET_CODES = new Set(
    ['loggedOut', 'forbidden', 'multideviceMismatch', 'badSession'].map((name) => DisconnectReason[name]).filter((value) => typeof value === 'number'),
);
const RESTART_REQUIRED_CODE = DisconnectReason.restartRequired;

function disconnectReasonName(code) {
    if (typeof code !== 'number') return null;
    const found = Object.entries(DisconnectReason).find(([, value]) => value === code);
    return found ? found[0] : `code_${code}`;
}

const pendingStarts = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sessionDirectory(deviceId) {
    return path.join(authDirectory, deviceId);
}

function stopSocket(session) {
    session.superseded = true;
    try {
        session.socket.ev.removeAllListeners('connection.update');
        session.socket.ev.removeAllListeners('creds.update');
    } catch {
        /* socket sudah mati */
    }
    try {
        session.socket.ws?.close();
    } catch {
        /* socket sudah mati */
    }
}

function scheduleStart(deviceId, delayMs) {
    const previous = pendingStarts.get(deviceId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
        pendingStarts.delete(deviceId);
        startSession(deviceId).catch((error) => {
            output.error(`[baileys/${deviceId.slice(0, 8)}] gagal memulai sesi: ${error.message}`);
            scheduleStart(deviceId, MAINTENANCE_RETRY_MS);
        });
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
    pendingStarts.set(deviceId, timer);
    return timer;
}

// Hapus kredensial lokal lalu mulai sesi baru agar WhatsApp mengirim QR baru.
async function resetAuthState(deviceId, reason) {
    const state = stateFor(deviceId);
    state.auto_repairs += 1;
    state.paired = false;
    state.last_error = `auth_reset:${reason}`;

    const session = sessions.get(deviceId);
    if (session) {
        stopSocket(session);
        if (sessions.get(deviceId) === session) sessions.delete(deviceId);
    }
    const pending = pendingStarts.get(deviceId);
    if (pending) {
        clearTimeout(pending);
        pendingStarts.delete(deviceId);
    }

    // Hanya penautan ulang manual yang mengembalikan anggaran QR. Siklus otomatis
    // (qr_expired, self_decrypt_failures) tetap dihitung supaya tidak berputar
    // tanpa batas lalu parkir di status 'error'.
    if (reason === 'manual_reset') {
        state.qr_cycles = 0;
        state.reconnect_attempts = 0;
    }

    output.warn(`[baileys/${deviceId.slice(0, 8)}] menautkan ulang (${reason}) — kredensial lama dihapus, QR baru menyusul`);
    await sleep(300);
    await fs.rm(sessionDirectory(deviceId), { recursive: true, force: true });
    return scheduleStart(deviceId, 500);
}

// Baileys/whatsmeow keep a rolling cache of the last sent messages so the socket can
// answer WhatsApp "retry receipt" requests. Without getMessage() the recipient phone
// cannot decrypt the envelope and keeps showing "Waiting for this message. This may take a while."
const MESSAGE_CACHE_LIMIT = 256;

function createMessageCache() {
    const cache = new Map();
    return {
        get(id) {
            return id ? cache.get(id) : undefined;
        },
        remember(message) {
            const id = message?.key?.id;
            const content = message?.message;
            if (!id || !content) return;
            if (cache.has(id)) cache.delete(id);
            cache.set(id, content);
            while (cache.size > MESSAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
        },
        size() {
            return cache.size;
        },
    };
}

async function startSession(deviceId, options = {}) {
    const manual = options.manual === true;
    const current = sessions.get(deviceId);
    if (current && ['connecting', 'connected'].includes(current.status)) return current;
    if (current) {
        stopSocket(current);
        if (sessions.get(deviceId) === current) sessions.delete(deviceId);
    }

    const state = stateFor(deviceId);
    if (manual) {
        // Percobaan eksplisit dari pengguna (tombol QR / API): penghitung dinolkan.
        state.qr_cycles = 0;
        state.reconnect_attempts = 0;
        state.last_error = null;
    }

    const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDirectory(deviceId));
    const registered = authState.creds?.registered === true;
    if (registered) {
        state.paired = true;
    } else if (!state.paired) {
        // Siklus QR baru: satu sampul QR hanya berlaku ~20 detik, tanpa penautan
        // ulang otomatis perangkat akan berhenti di QR kedaluwarsa.
        state.qr_cycles += 1;
    }

    const messageCache = createMessageCache();
    const socket = makeWASocket({
        auth: authState,
        logger: createLogger({ device: deviceId }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
            const cached = messageCache.get(key?.id);
            if (cached) {
                output.info(`[baileys/${deviceId.slice(0, 8)}] getMessage hit ${key?.id} — mengirim ulang untuk permintaan retry`);
                return cached;
            }
            state.getmessage_misses += 1;
            if (state.getmessage_misses % 25 === 1) {
                output.warn(
                    `[baileys/${deviceId.slice(0, 8)}] getMessage tanpa cache (miss=${state.getmessage_misses}) — pesan lama bisa tampil "Menunggu pesan ini" di penerima`,
                );
            }
            return undefined;
        },
    });
    const session = {
        socket,
        status: 'connecting',
        qr_code: null,
        superseded: false,
        paired: registered,
        qr_logged: false,
        messageCache,
        state,
    };
    sessions.set(deviceId, session);

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', ({ messages }) => {
        for (const inbound of messages) messageCache.remember(inbound);
    });
    socket.ev.on('connection.update', async (update) => {
        if (session.superseded) return;
        if (update.qr) {
            try {
                session.qr_code = await QRCode.toDataURL(update.qr);
                session.status = 'qr_ready';
                state.qr_generated_at = new Date().toISOString();
                if (!session.qr_logged) {
                    session.qr_logged = true;
                    output.warn(
                        `[baileys/${deviceId.slice(0, 8)}] QR baru siap dipindai (siklus ${state.qr_cycles}/${QR_CYCLE_LIMIT}) — buka halaman Perangkat lalu pindai ulang.`,
                    );
                }
            } catch (error) {
                session.status = 'error';
                state.last_error = `qr_render_failed: ${error.message}`;
                output.error(`[baileys/${deviceId.slice(0, 8)}] gagal merender QR: ${error.message}`);
            }
        }
        if (update.connection === 'open') {
            session.status = 'connected';
            session.qr_code = null;
            session.paired = true;
            state.paired = true;
            state.paired_at = new Date().toISOString();
            state.reconnect_attempts = 0;
            state.qr_cycles = 0;
            state.last_error = null;
            output.info(`[baileys/${deviceId.slice(0, 8)}] terhubung sebagai ${authState.creds?.me?.id ?? 'tidak diketahui'}`);
        }
        if (update.connection === 'close') {
            await handleClose(deviceId, session, update.lastDisconnect);
        }
    });
    socket.ev.on('messages.update', (updates) => {
        for (const item of updates) {
            const providerId = item.key?.id;
            const status = item.update?.status;
            if (!item.key?.fromMe || !providerId || typeof status !== 'number') continue;
            const normalized = status >= 4 ? 'read' : status === 3 ? 'delivered' : status === 2 ? 'sent' : status === 0 ? 'failed' : 'pending';
            fetch(statusWebhookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: providerId, status: normalized, state: 'baileys' }),
            }).catch((error) => output.error(`[baileys/${deviceId.slice(0, 8)}] callback status gagal: ${error.message}`));
        }
    });
    return session;
}

// Satu tempat untuk semua transisi 'close': putus permanen → QR baru, restart cepat,
// QR kedaluwarsa → siklus QR berikutnya, putus sementara → reconnect bertingkat.
function parkSession(deviceId, session, status, lastError) {
    session.status = status;
    session.qr_code = null;
    if (lastError) session.state.last_error = lastError;
    sessions.set(deviceId, session);
}

async function handleClose(deviceId, session, lastDisconnect) {
    const tag = `[baileys/${deviceId.slice(0, 8)}]`;
    const state = session.state;
    const code = lastDisconnect?.error?.output?.statusCode ?? null;
    const reason = disconnectReasonName(code);

    session.status = 'disconnected';
    session.qr_code = null;
    state.last_close_code = code;
    state.last_close_reason = reason;
    if (sessions.get(deviceId) === session) sessions.delete(deviceId);

    if (session.superseded) return undefined;

    // 401 loggedOut / 403 forbidden / 411 multideviceMismatch / 500 badSession:
    // WhatsApp menolak kredensial, satu-satunya jalan adalah penautan ulang (QR).
    if (AUTH_RESET_CODES.has(code)) {
        output.warn(`${tag} koneksi perangkat terputus permanen (code=${code} ${reason}) — kredensial tidak berlaku lagi, meminta QR baru`);
        return resetAuthState(deviceId, `disconnect_${reason}`);
    }
    if (code === RESTART_REQUIRED_CODE) {
        output.info(`${tag} WhatsApp meminta sesi dimulai ulang (code=${code} restartRequired) — menyambung ulang`);
        state.reconnect_attempts = 0;
        return scheduleStart(deviceId, 250);
    }
    if (!session.paired) {
        if (state.qr_cycles < QR_CYCLE_LIMIT) {
            output.warn(
                `${tag} QR belum dipindai atau kedaluwarsa (code=${code} ${reason}) — menyiapkan QR baru (siklus ${state.qr_cycles + 1}/${QR_CYCLE_LIMIT})`,
            );
            return resetAuthState(deviceId, 'qr_expired');
        }
        output.error(`${tag} penautan gagal setelah ${state.qr_cycles} siklus QR — tekan tombol QR pada halaman Perangkat untuk memulai ulang`);
        return parkSession(deviceId, session, 'error', 'pairing_expired');
    }

    const attempt = state.reconnect_attempts + 1;
    if (attempt > RECONNECT_MAX) {
        state.reconnect_attempts = 0;
        output.error(
            `${tag} gagal menyambung ulang ${RECONNECT_MAX}x (terakhir code=${code} ${reason}) — percobaan berikutnya dalam ${MAINTENANCE_RETRY_MS / 60000} menit; pindai QR baru bila perangkat benar-benar telah diputus`,
        );
        parkSession(deviceId, session, 'error', `reconnect_exhausted:${reason}`);
        return scheduleStart(deviceId, MAINTENANCE_RETRY_MS);
    }
    state.reconnect_attempts = attempt;
    state.last_error = `reconnect_${attempt}:${reason}`;
    const waitMs = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (attempt - 1));
    output.warn(
        `${tag} koneksi terputus (code=${code} ${reason}) — menyambung ulang dalam ${Math.round(waitMs / 1000)}s (percobaan ${attempt}/${RECONNECT_MAX})`,
    );
    return scheduleStart(deviceId, waitMs);
}

// Tunggu sampai socket benar-benar menghasilkan QR baru (atau terhubung/gagal).
// Sesi sengaja TIDAK dijadikan syarat berhenti: setelah reset, entri sesi sempat
// hilang dari map di antara dua percobaan start sehingga pengecekan naif akan
// mengembalikan status 'disconnected' padahal QR sedang disiapkan.
async function waitForPairing(deviceId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const session = sessions.get(deviceId);
        if (session?.status === 'qr_ready' && session.qr_code) return session;
        if (session && (session.status === 'connected' || session.status === 'error')) return session;
        if (Date.now() >= deadline) return session ?? null;
        await sleep(250);
    }
}

function sessionView(deviceId) {
    const session = sessions.get(deviceId);
    const state = deviceState.get(deviceId);
    const failures = decryptFailures.get(deviceId);
    return {
        status: session?.status ?? 'disconnected',
        qr_code: session?.qr_code ?? null,
        cached_messages: session?.messageCache.size() ?? 0,
        paired: Boolean(state?.paired),
        auto_repairs: state?.auto_repairs ?? 0,
        reconnect_attempts: state?.reconnect_attempts ?? 0,
        last_close_code: state?.last_close_code ?? null,
        last_close_reason: state?.last_close_reason ?? null,
        last_error: state?.last_error ?? null,
        qr_generated_at: state?.qr_generated_at ?? null,
        paired_at: state?.paired_at ?? null,
        getmessage_misses: state?.getmessage_misses ?? 0,
        decrypt_failures: failures?.total ?? 0,
        decrypt_failures_from_me: failures?.fromMe ?? 0,
        noise_suppressed: noiseTotals(),
        log_level: LOG_LEVEL,
    };
}

app.get('/status', (_req, res) => res.json({ status: 'ok' }));

app.post('/sessions/:deviceId', unauthorized, async (req, res) => {
    const { deviceId } = req.params;
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    try {
        await startSession(deviceId, { manual: true });
        return res.status(202).json(sessionView(deviceId));
    } catch (error) {
        output.error(`[baileys/${deviceId.slice(0, 8)}] gagal memulai sesi: ${error.message}`);
        return res.status(502).json({ error: 'session_start_failed' });
    }
});

app.get('/sessions/:deviceId', unauthorized, (req, res) => {
    if (!validDeviceId(req.params.deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    return res.json(sessionView(req.params.deviceId));
});

// Paksa penautan ulang: kredensial lokal dihapus, tunggu QR baru, kembalikan QR-nya.
app.post('/sessions/:deviceId/reset', unauthorized, async (req, res) => {
    const { deviceId } = req.params;
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    try {
        await resetAuthState(deviceId, 'manual_reset');
        // QR biasanya siap 1–3 detik setelah kredensial dihapus; tunggu sampai ada
        // (12s < timeout klien backend 20s) agar respons berisi QR, bukan status kosong.
        await waitForPairing(deviceId, 12_000);
        return res.status(202).json(sessionView(deviceId));
    } catch (error) {
        output.error(`[baileys/${deviceId.slice(0, 8)}] gagal menautkan ulang: ${error.message}`);
        return res.status(502).json({ error: 'session_reset_failed' });
    }
});

app.post('/sessions/:deviceId/messages', unauthorized, async (req, res) => {
    const { deviceId } = req.params;
    const { target, message } = req.body || {};
    if (!validDeviceId(deviceId) || typeof target !== 'string' || typeof message !== 'string') {
        return res.status(400).json({ error: 'invalid_request' });
    }
    const phone = target.replace(/^\+/, '');
    if (!/^[1-9][0-9]{7,15}$/.test(phone) || !message.trim() || Buffer.byteLength(message, 'utf8') > 4096) {
        return res.status(400).json({ error: 'invalid_request' });
    }
    const session = sessions.get(deviceId);
    if (!session || session.status !== 'connected') {
        return res.status(409).json({ error: 'device_not_connected' });
    }
    try {
        const result = await session.socket.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
        if (!result?.key?.id) return res.status(502).json({ error: 'message_not_accepted' });
        session.messageCache.remember(result);
        return res.json({ message_id: result.key.id, status: 'accepted', cached: session.messageCache.size() });
    } catch (error) {
        const state = stateFor(deviceId);
        state.last_error = `send_failed: ${error.message}`;
        output.error(`[baileys/${deviceId.slice(0, 8)}] gagal mengirim pesan ke ${phone}: ${error.message}`);
        return res.status(502).json({ error: 'message_send_failed' });
    }
});

app.delete('/sessions/:deviceId', unauthorized, async (req, res) => {
    const { deviceId } = req.params;
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    const session = sessions.get(deviceId);
    if (session) {
        stopSocket(session);
        if (sessions.get(deviceId) === session) sessions.delete(deviceId);
    }
    const pending = pendingStarts.get(deviceId);
    if (pending) {
        clearTimeout(pending);
        pendingStarts.delete(deviceId);
    }
    deviceState.delete(deviceId);
    decryptFailures.delete(deviceId);
    await fs.rm(sessionDirectory(deviceId), { recursive: true, force: true });
    output.warn(`[baileys/${deviceId.slice(0, 8)}] perangkat dihapus — kredensial lokal dibersihkan`);
    return res.status(204).end();
});

// Setelah gateway hidup kembali, sesi tersimpan yang masih memiliki kredensial
// disambungkan sendiri; bila kredensialnya sudah ditolak WhatsApp, handleClose
// yang akan meminta QR baru.
async function resumeKnownDevices() {
    let entries = [];
    try {
        entries = await fs.readdir(authDirectory, { withFileTypes: true });
    } catch {
        return;
    }
    const deviceIds = entries.filter((entry) => entry.isDirectory() && validDeviceId(entry.name)).map((entry) => entry.name);
    for (const deviceId of deviceIds) {
        const hasCreds = await fs
            .access(path.join(sessionDirectory(deviceId), 'creds.json'))
            .then(() => true)
            .catch(() => false);
        if (!hasCreds) continue;
        output.info(`[baileys/${deviceId.slice(0, 8)}] memulihkan sesi tersimpan setelah gateway dimulai ulang`);
        startSession(deviceId).catch((error) => output.error(`[baileys/${deviceId.slice(0, 8)}] gagal memulihkan sesi: ${error.message}`));
    }
    if (deviceIds.length) output.info(`[baileys] ${deviceIds.length} perangkat tersimpan diperiksa setelah mulai ulang`);
}

app.listen(port, '0.0.0.0', () => {
    output.log(
        `Baileys gateway listening on port ${port} (log_level=${LOG_LEVEL}, reconnect_max=${RECONNECT_MAX}, qr_cycle_limit=${QR_CYCLE_LIMIT})`,
    );
    resumeKnownDevices().catch((error) => output.error(`[baileys] gagal memeriksa sesi tersimpan: ${error.message}`));
});
