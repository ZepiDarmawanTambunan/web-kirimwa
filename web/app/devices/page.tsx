"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, Plus, Smartphone, Trash2 } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Provider = "meta_cloud" | "baileys";
type Device = {
  id: string;
  device_name: string;
  phone_number: string;
  provider: Provider;
  is_active: boolean;
  connection_status: string;
};
type PairingStatus = { status: string; qr_code: string | null };

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState<Provider>("meta_cloud");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [pairing, setPairing] = useState<Record<string, PairingStatus>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    const result = await api<Device[]>("/devices");
    setDevices(result);
  }, []);

  useEffect(() => {
    void loadDevices().catch((failure: unknown) => {
      if (failure instanceof ApiRequestError && failure.status === 401) router.replace("/login");
      else setError(failure instanceof Error ? failure.message : "Daftar device gagal dimuat.");
    });
  }, [loadDevices, router]);

  useEffect(() => {
    const polling = devices.filter((device) => device.provider === "baileys");
    if (!polling.length) return;
    const timer = window.setInterval(() => {
      for (const device of polling) {
        void api<PairingStatus>(`/devices/${device.id}/status`)
          .then((status) => setPairing((current) => ({ ...current, [device.id]: status })))
          .catch((failure: unknown) => {
            setError(failure instanceof Error ? failure.message : "Status koneksi gagal diperbarui.");
          });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [devices]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const device = await api<Device>("/devices", {
        method: "POST",
        body: JSON.stringify({
          device_name: deviceName,
          phone_number: phoneNumber,
          provider,
          ...(provider === "meta_cloud"
            ? { meta_phone_number_id: phoneNumberId, meta_access_token: accessToken }
            : {}),
        }),
      });
      setDeviceName("");
      setPhoneNumber("");
      setPhoneNumberId("");
      setAccessToken("");
      await loadDevices();
      if (provider === "baileys") {
        const status = await api<PairingStatus>(`/devices/${device.id}/status`);
        setPairing((current) => ({ ...current, [device.id]: status }));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal menambahkan koneksi.");
    } finally {
      setBusy(false);
    }
  }

  async function reconnect(device: Device) {
    setError("");
    try {
      const status = await api<PairingStatus>(`/devices/${device.id}/connect`, { method: "POST" });
      setPairing((current) => ({ ...current, [device.id]: status }));
      await loadDevices();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Koneksi Baileys gagal dimulai.");
    }
  }

  async function remove(device: Device) {
    if (!window.confirm(`Hapus koneksi "${device.device_name}"?`)) return;
    setError("");
    try {
      await api<void>(`/devices/${device.id}`, { method: "DELETE" });
      setDevices((current) => current.filter((entry) => entry.id !== device.id));
      setPairing((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Koneksi gagal dihapus.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Kembali ke dashboard" onClick={() => router.push("/dashboard")}><ArrowLeft size={18} /></Button>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-700 text-white"><Smartphone size={20} /></div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Koneksi WhatsApp</h1>
            <p className="text-xs text-slate-500">Pilih provider untuk setiap device. Koneksi provider tidak dicampur.</p>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:grid-cols-2">
          <label htmlFor="device_name" className="block space-y-2 text-sm font-medium text-slate-700">Nama koneksi
            <Input id="device_name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Contoh: WhatsApp Toko" required maxLength={255} />
          </label>
          <label htmlFor="phone_number" className="block space-y-2 text-sm font-medium text-slate-700">Nomor WhatsApp bisnis
            <Input id="phone_number" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="628123456789" required maxLength={32} />
          </label>
          <label htmlFor="provider" className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Provider
            <select id="provider" value={provider} onChange={(event) => setProvider(event.target.value as Provider)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10">
              <option value="meta_cloud">Meta WhatsApp Cloud API (resmi)</option>
              <option value="baileys">Baileys QR (eksperimental, nonresmi)</option>
            </select>
          </label>
          {provider === "meta_cloud" ? (
            <>
              <label htmlFor="meta_phone_number_id" className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Meta Phone Number ID
                <Input id="meta_phone_number_id" value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} placeholder="ID nomor dari WhatsApp Manager" required inputMode="numeric" />
              </label>
              <label htmlFor="meta_access_token" className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Meta access token
                <Input id="meta_access_token" type="password" autoComplete="new-password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="Token akses WhatsApp Business Platform" required minLength={20} maxLength={4096} />
                <span className="block text-xs font-normal text-slate-500">Dikirim langsung ke backend dan dienkripsi saat disimpan. Tidak ditampilkan kembali.</span>
              </label>
            </>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 md:col-span-2">
              Baileys berkomunikasi memakai protokol WhatsApp Web nonresmi. Ini terpisah dari Meta Cloud API dan dapat berisiko bagi stabilitas/kepatuhan akun. Gunakan hanya untuk eksperimen, bukan nomor Meta yang sama.
            </p>
          )}
          <Button type="submit" className="md:col-span-2" disabled={busy}><Plus size={15} />{busy ? "Menyimpan..." : "Tambah koneksi"}</Button>
        </form>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Koneksi Anda</h2>
          {devices.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Belum ada koneksi WhatsApp.</p> : devices.map((device) => {
            const liveStatus = pairing[device.id];
            return (
              <article key={device.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{device.device_name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{device.provider === "meta_cloud" ? "Meta Cloud API" : "Baileys · eksperimental"}</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{liveStatus?.status ?? device.connection_status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{device.phone_number}</p>
                  {device.provider === "baileys" && liveStatus?.qr_code && <div className="mt-4 w-fit rounded-xl border border-slate-200 bg-white p-3"><Image src={liveStatus.qr_code} alt={`QR pairing ${device.device_name}`} width={220} height={220} unoptimized /></div>}
                  {device.provider === "meta_cloud" && <p className="mt-2 text-xs text-slate-500">Kredensial tersimpan. Pengiriman aktual tetap bergantung pada validitas token dan konfigurasi Meta.</p>}
                </div>
                <div className="flex items-start gap-2">
                  {device.provider === "baileys" && <Button variant="secondary" size="sm" onClick={() => void reconnect(device)}><Link2 size={14} /> QR</Button>}
                  <Button variant="danger" size="icon" aria-label={`Hapus ${device.device_name}`} onClick={() => void remove(device)}><Trash2 size={15} /></Button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
