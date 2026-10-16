const JAKARTA = "Asia/Jakarta";

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: JAKARTA,
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: JAKARTA,
});

const dayFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: JAKARTA,
});

const numberFormatter = new Intl.NumberFormat("id-ID");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "16 Okt 2026, 18.02.37" (WIB) */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

/** "18.02.37" (WIB) */
export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "—";
}

/** "Jumat, 16 Oktober 2026" (WIB) */
export function formatDay(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dayFormatter.format(date) : "—";
}

/** "2 menit lalu" / "dalam 3 jam" */
export function formatRelative(value: string | number | Date | null | undefined, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return "—";
  const diff = now - date.getTime();
  const isPast = diff >= 0;
  const absolute = Math.abs(diff);

  if (absolute < 30_000) return isPast ? "baru saja" : "sebentar lagi";

  const units: Array<[number, string]> = [
    [DAY, "hari"],
    [HOUR, "jam"],
    [MINUTE, "menit"],
  ];

  for (const [unit, name] of units) {
    if (absolute >= unit) {
      const amount = Math.floor(absolute / unit);
      return isPast ? `${amount} ${name} lalu` : `dalam ${amount} ${name}`;
    }
  }

  return isPast ? "baru saja" : "sebentar lagi";
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Menyamakan input nomor dengan aturan backend (`normalize_target`/`normalize_phone`):
 * hanya digit, tanpa tanda `+`, tanpa `0` di depan, kode negara wajib ikut.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("620")) return `62${digits.slice(3)}`;
  if (digits.startsWith("0")) return `62${digits.replace(/^0+/, "")}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function isValidPhone(value: string): boolean {
  return /^[1-9]\d{7,15}$/.test(value);
}

/** Pisahkan daftar nomor: koma, titik koma, spasi, atau baris baru. */
export function splitTargets(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeTargets(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of splitTargets(raw)) {
    const normalized = normalizePhone(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function truncateMiddle(value: string, head = 8, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function initials(value: string): string {
  const source = value.trim();
  if (!source) return "?";
  const at = source.indexOf("@");
  const name = at > 0 ? source.slice(0, at) : source;
  const parts = name.split(/[._\-+]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
