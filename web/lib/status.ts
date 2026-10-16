export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

export type StatusMeta = {
  /** Nilai mentah yang dikenali (huruf kecil). */
  key: string;
  /** Label bahasa Indonesia yang ditampilkan ke pengguna. */
  label: string;
  tone: Tone;
  /** Penjelasan singkat untuk tooltip / baris detail. */
  hint: string;
  /** Posisi pada pipeline pengiriman: 1 dikirim ke gateway, 4 dibaca, -1 gagal/tidak diketahui. */
  step: number;
};

const UNKNOWN_STATUS: StatusMeta = {
  key: "unknown",
  label: "Status tidak diketahui",
  tone: "neutral",
  hint: "Status ini belum dikenali dashboard. Hubungi admin bila terjadi terus-menerus.",
  step: -1,
};

const MESSAGE_STATUS_MAP: Record<string, StatusMeta> = {
  processing: {
    key: "processing",
    label: "Diproses",
    tone: "progress",
    hint: "Gateway sudah menerima permintaan dan sedang mengirimkannya ke provider WhatsApp.",
    step: 1,
  },
  pending: {
    key: "processing",
    label: "Diproses",
    tone: "progress",
    hint: "Gateway sudah menerima permintaan dan sedang mengirimkannya ke provider WhatsApp.",
    step: 1,
  },
  waiting: {
    key: "processing",
    label: "Diproses",
    tone: "progress",
    hint: "Gateway sudah menerima permintaan dan sedang mengirimkannya ke provider WhatsApp.",
    step: 1,
  },
  accepted: {
    key: "accepted",
    label: "Diterima gateway",
    tone: "progress",
    hint: "Provider WhatsApp sudah mengakui permintaan, menunggu status berikutnya.",
    step: 1,
  },
  sent: {
    key: "sent",
    label: "Terkirim",
    tone: "info",
    hint: "Pesan sudah sampai server WhatsApp (centang satu). Perangkat penerima belum tentu sudah menerimanya.",
    step: 2,
  },
  delivered: {
    key: "delivered",
    label: "Diterima",
    tone: "success",
    hint: "Perangkat penerima sudah mengonfirmasi pesan masuk (centang dua).",
    step: 3,
  },
  read: {
    key: "read",
    label: "Dibaca",
    tone: "success",
    hint: "Penerima sudah membuka pesan (centang biru).",
    step: 4,
  },
  failed: {
    key: "failed",
    label: "Gagal",
    tone: "danger",
    hint: "Provider menolak atau gagal mengirim pesan ini. Coba kirim ulang.",
    step: -1,
  },
  invalid: {
    key: "invalid",
    label: "Nomor tidak valid",
    tone: "danger",
    hint: "Nomor tujuan tidak dikenali WhatsApp sebagai nomor yang valid.",
    step: -1,
  },
  expired: {
    key: "expired",
    label: "Kedaluwarsa",
    tone: "danger",
    hint: "Batas waktu pengiriman habis sebelum pesan terkirim.",
    step: -1,
  },
};

export function messageStatus(raw: string | null | undefined): StatusMeta {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return UNKNOWN_STATUS;
  const known = MESSAGE_STATUS_MAP[key];
  if (known) return { ...known, key: known.key };
  return { ...UNKNOWN_STATUS, key, label: raw?.trim() || UNKNOWN_STATUS.label };
}

export function isFailedStatus(raw: string | null | undefined): boolean {
  return messageStatus(raw).tone === "danger";
}

export function isDeliveredStatus(raw: string | null | undefined): boolean {
  return ["delivered", "read"].includes(messageStatus(raw).key);
}

export function isSentStatus(raw: string | null | undefined): boolean {
  const meta = messageStatus(raw);
  return meta.key === "sent" || meta.tone === "success";
}

export function isProcessingStatus(raw: string | null | undefined): boolean {
  return messageStatus(raw).tone === "progress";
}

/** Tahapan pengiriman WhatsApp — dipakai di legend "Arti status". */
export const DELIVERY_STAGES: Array<{ key: string; label: string; description: string }> = [
  {
    key: "processing",
    label: "Diproses",
    description: "Gateway menerima permintaan, pesan sedang dikirim ke operator WhatsApp.",
  },
  {
    key: "sent",
    label: "Terkirim",
    description: "Pesan sudah sampai server WhatsApp — belum berarti masuk ke HP penerima.",
  },
  {
    key: "delivered",
    label: "Diterima",
    description: "HP penerima sudah mengonfirmasi pesan masuk (centang dua).",
  },
  {
    key: "read",
    label: "Dibaca",
    description: "Penerima membuka pesan (centang biru). Ditentukan oleh WhatsApp penerima.",
  },
];

export type ConnectionMeta = { label: string; tone: Tone; hint: string };

const CONNECTION_MAP: Record<string, ConnectionMeta> = {
  connected: {
    label: "Terhubung",
    tone: "success",
    hint: "Perangkat aktif dan siap mengirim pesan.",
  },
  connecting: {
    label: "Menyambungkan",
    tone: "progress",
    hint: "Sedang menyambungkan ke WhatsApp. Tunggu beberapa detik lalu perbarui status.",
  },
  qr_ready: {
    label: "Menunggu QR dipindai",
    tone: "warning",
    hint: "Buka WhatsApp di HP → Perangkat tertaut → Tautkan perangkat, lalu pindai QR.",
  },
  qr_expired: {
    label: "QR kedaluwarsa",
    tone: "warning",
    hint: "QR sudah kedaluwarsa. Minta QR baru lalu pindai ulang.",
  },
  disconnected: {
    label: "Terputus",
    tone: "danger",
    hint: "Sambungan ke WhatsApp terputus. Klik Hubungkan untuk memulai ulang.",
  },
  logged_out: {
    label: "Keluar dari WhatsApp",
    tone: "danger",
    hint: "Sesi dicabut dari HP. Hubungkan ulang dan pindai QR baru.",
  },
  error: {
    label: "Bermasalah",
    tone: "danger",
    hint: "Gateway WhatsApp melaporkan kesalahan. Coba hubungkan ulang.",
  },
  unknown: {
    label: "Belum diketahui",
    tone: "neutral",
    hint: "Status belum tersedia. Perbarui status untuk memeriksa.",
  },
};

export function connectionStatus(raw: string | null | undefined): ConnectionMeta {
  const key = (raw ?? "").trim().toLowerCase();
  const known = CONNECTION_MAP[key];
  if (known) return known;
  if (!key) return CONNECTION_MAP.unknown;
  return { ...CONNECTION_MAP.unknown, label: raw?.trim() ?? CONNECTION_MAP.unknown.label };
}

export type ProviderMeta = { key: string; label: string; badge: string; description: string };

export const PROVIDERS: ProviderMeta[] = [
  {
    key: "baileys",
    label: "Baileys (QR)",
    badge: "Gratis",
    description:
      "Terhubung dengan memindai QR seperti WhatsApp Web. Tidak butuh verifikasi bisnis, cocok untuk pengiriman internal.",
  },
  {
    key: "meta_cloud",
    label: "Meta Cloud API",
    badge: "Resmi",
    description:
      "Jalur resmi WhatsApp Business Platform. Butuh Phone Number ID dan access token dari Meta Business.",
  },
];

export function providerMeta(provider: string | null | undefined): ProviderMeta {
  const key = (provider ?? "").trim().toLowerCase();
  return PROVIDERS.find((item) => item.key === key) ?? {
    key,
    label: provider?.trim() || "Tidak diketahui",
    badge: "—",
    description: "Provider belum dikenali dashboard.",
  };
}

export const DAILY_QUOTA = 50;
