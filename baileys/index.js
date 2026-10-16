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

async function startSession(deviceId) {
    const current = sessions.get(deviceId);
    if (current && ['connecting', 'connected'].includes(current.status)) return current;

    const stateDirectory = path.join(authDirectory, deviceId);
    const { state, saveCreds } = await useMultiFileAuthState(stateDirectory);
    const messageCache = createMessageCache();
    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
            const cached = messageCache.get(key?.id);
            if (!cached) {
                console.warn(`getMessage miss for ${key?.id} (cache=${messageCache.size()})`);
                return undefined;
            }
            console.log(`getMessage hit for ${key?.id} — resending for retry request`);
            return cached;
        },
    });
    const session = { socket, status: 'connecting', qr_code: null, deleted: false, messageCache };
    sessions.set(deviceId, session);
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', ({ messages }) => {
        for (const inbound of messages) messageCache.remember(inbound);
    });
    socket.ev.on('connection.update', async (update) => {
        if (update.qr) {
            try {
                session.qr_code = await QRCode.toDataURL(update.qr);
                session.status = 'qr_ready';
            } catch (error) {
                console.error('Failed to render pairing QR:', error.message);
                session.status = 'error';
            }
        }
        if (update.connection === 'open') {
            session.status = 'connected';
            session.qr_code = null;
        }
        if (update.connection === 'close') {
            session.status = 'disconnected';
            session.qr_code = null;
            const code = update.lastDisconnect?.error?.output?.statusCode;
            sessions.delete(deviceId);
            if (!session.deleted && code !== DisconnectReason.loggedOut) {
                setTimeout(() => {
                    startSession(deviceId).catch((error) => {
                        console.error('Failed to reconnect Baileys session:', error.message);
                    });
                }, 2000);
            }
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
            }).catch((error) => console.error('Baileys status callback failed:', error.message));
        }
    });
    return session;
}

app.get('/status', (_req, res) => res.json({ status: 'ok' }));

app.post('/sessions/:deviceId', unauthorized, async (req, res) => {
    const { deviceId } = req.params;
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    try {
        const session = await startSession(deviceId);
        return res
            .status(202)
            .json({ status: session.status, qr_code: session.qr_code, cached_messages: session.messageCache.size() });
    } catch (error) {
        console.error('Failed to start Baileys session:', error.message);
        return res.status(502).json({ error: 'session_start_failed' });
    }
});

app.get('/sessions/:deviceId', unauthorized, (req, res) => {
    if (!validDeviceId(req.params.deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    const session = sessions.get(req.params.deviceId);
    if (!session) return res.json({ status: 'disconnected', qr_code: null, cached_messages: 0 });
    return res.json({ status: session.status, qr_code: session.qr_code, cached_messages: session.messageCache.size() });
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
        console.error('Baileys message send failed:', error.message);
        return res.status(502).json({ error: 'message_send_failed' });
    }
});

app.delete('/sessions/:deviceId', unauthorized, async (req, res) => {
    if (!validDeviceId(req.params.deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
    const session = sessions.get(req.params.deviceId);
    if (session) {
        session.deleted = true;
        session.socket.end(undefined);
        sessions.delete(req.params.deviceId);
    }
    await fs.rm(path.join(authDirectory, req.params.deviceId), { recursive: true, force: true });
    return res.status(204).end();
});

app.listen(port, '0.0.0.0', () => console.log(`Baileys gateway listening on port ${port}`));
