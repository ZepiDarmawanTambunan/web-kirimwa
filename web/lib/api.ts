const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const API_PREFIX = `${API_URL}/api/v1`;

export type Account = { id: string; email: string; role: "admin" | "user" | string };
export type Message = {
  id: string;
  device_id: string | null;
  target: string;
  body: string;
  provider_id: string | null;
  status: string;
  state: string | null;
  created_at: string;
};
export type Device = {
  id: string;
  device_name: string;
  phone_number: string;
  provider: "meta_cloud" | "baileys" | string;
  is_active: boolean;
  connection_status: string;
  created_at?: string;
};
export type AdminUser = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  api_key_prefix: string | null;
  created_at?: string;
};

export type SessionStatus = {
  status: string;
  qr_code: string | null;
  /** Jumlah pesan terkirim yang disimpan gateway untuk menjawab retry receipt WhatsApp. */
  cached_messages?: number;
};
export type QueuedMessage = { id: string; device_id: string; target: string; status: string };
export type MessageList = { messages: Message[] };
export type SendMessageResponse = { messages: QueuedMessage[] };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = "error",
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** Sesi habis / belum masuk — UI perlu mengarahkan pengguna ke halaman masuk. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.code === "unauthorized";
  }
}

/** Pesan backend yang sudah punya padanan bahasa Indonesia. */
const TRANSLATIONS: Array<[RegExp, string]> = [
  [
    /^Baileys device is not connected/i,
    "Perangkat WhatsApp belum terhubung. Buka halaman Koneksi WhatsApp untuk memindai QR.",
  ],
  [
    /^target must contain full international/i,
    "Nomor tujuan tidak valid. Gunakan kode negara tanpa tanda +, misalnya 6281234567890.",
  ],
  [/^target must contain 1 to 100/i, "Jumlah nomor tujuan harus antara 1 sampai 100."],
  [/^message must contain 1 to 4096/i, "Isi pesan wajib diisi, maksimal 4096 karakter."],
  [/^Limit harian tercapai/i, "Kuota kirim 24 jam terakhir sudah habis (maksimal 50 pesan per 24 jam)."],
  [
    /^phone_number must be an international/i,
    "Nomor perangkat tidak valid. Gunakan format internasional, misalnya 6281234567890.",
  ],
  [/^device_name must contain/i, "Nama perangkat wajib diisi, maksimal 255 karakter."],
  [/^provider must be/i, "Provider harus Baileys atau Meta Cloud."],
  [/^only Baileys devices use QR/i, "Hanya perangkat Baileys yang memakai pemindaian QR."],
  [/^a valid Meta Phone Number ID/i, "Phone Number ID dari Meta wajib diisi."],
  [/^a valid Meta access token/i, "Access token dari Meta wajib diisi."],
  [/^Meta credentials must not be provided/i, "Perangkat Baileys tidak boleh memakai kredensial Meta."],
  [/^a valid email address/i, "Format email tidak valid."],
  [/^password must contain 12/i, "Kata sandi harus 12–128 karakter."],
  [
    /^administrators cannot deactivate their own account/i,
    "Admin tidak bisa menonaktifkan akunnya sendiri. Minta admin lain untuk melakukannya.",
  ],
];

const CODE_FALLBACKS: Record<string, string> = {
  unauthorized: "Email atau kata sandi tidak cocok. Periksa lalu coba lagi.",
  forbidden: "Akun Anda tidak memiliki izin untuk tindakan ini.",
  not_found: "Data yang diminta tidak ditemukan.",
  conflict: "Data sudah dipakai. Gunakan nilai lain.",
  upstream_error: "Gateway WhatsApp tidak merespons. Periksa koneksi perangkat lalu coba lagi.",
  internal_error: "Terjadi kesalahan di server. Tunggu sebentar lalu coba lagi.",
  network_error: "Tidak dapat menghubungi server. Periksa koneksi jaringan Anda.",
};

function translate(code: string, raw: string): string {
  const message = raw.trim();
  for (const [pattern, replacement] of TRANSLATIONS) {
    if (pattern.test(message)) return replacement;
  }
  const fallback = CODE_FALLBACKS[code];
  if (!fallback) return message || "Permintaan gagal diproses.";
  // Pesan backend hanya dipakai bila sudah ramah pengguna (mis. pesan limit harian).
  const humanReadable = /[a-z]/.test(message) && /[ .!]/.test(message) && !/^[A-Z]/.test(message);
  return humanReadable ? message : fallback;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(CODE_FALLBACKS.network_error, 0, "network_error");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = (payload ?? {}) as { error?: { code?: string; message?: string } };
    const code = envelope.error?.code ?? "error";
    const message = envelope.error?.message ?? "";
    throw new ApiRequestError(translate(code, message), response.status, code);
  }

  return payload as T;
}

export function apiBaseUrl(): string {
  return API_PREFIX;
}
