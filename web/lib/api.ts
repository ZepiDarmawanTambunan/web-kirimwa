const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type Account = { id: string; email: string; role: "admin" | "user" };
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
  provider: "meta_cloud" | "baileys";
  is_active: boolean;
  connection_status: string;
};
export type AdminUser = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  api_key_prefix: string | null;
  created_at: string;
};

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(payload?.error?.message ?? (response.status === 400 ? "Data tidak valid. Periksa input Anda." : response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : response.status === 404 ? "Data tidak ditemukan." : response.status === 500 ? "Terjadi kesalahan server." : "Permintaan gagal. Coba lagi."), response.status);
  }
  return payload as T;
}
