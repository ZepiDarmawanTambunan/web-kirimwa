"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Phone, Plus, Smartphone, ShieldCheck } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DevicesPage() {
  const router = useRouter();
  const [deviceName, setDeviceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/devices", {
        method: "POST",
        body: JSON.stringify({ device_name: deviceName, phone_number: phoneNumber }),
      });
      setDeviceName("");
      setPhoneNumber("");
      router.push("/dashboard");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal menambah device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-6 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-700 text-white"><Smartphone size={20} /></div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Tambah Device</h1>
            <p className="text-xs text-slate-500">Seperti Fonnte: tambah device, scan QR, dapat token.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white border border-slate-200/80 p-6 shadow-sm">
          <label htmlFor="device_name" className="block space-y-2 text-sm font-medium text-slate-700">Nama Device
            <Input id="device_name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Contoh: Device Toko Online" required maxLength={255} />
          </label>
          <label htmlFor="phone_number" className="block space-y-2 text-sm font-medium text-slate-700">Nomor WhatsApp
            <Input id="phone_number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="628123456789" required maxLength={32} />
          </label>
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700"><p className="font-medium">Terjadi kesalahan</p><p className="text-xs mt-0.5 opacity-90">{error}</p></div>}
          <Button type="submit" className="w-full" disabled={busy}><Plus size={15} /> {busy ? "Memproses..." : "Tambahkan Device"}</Button>
          <div className="rounded-xl bg-[#f5f9f7] p-3.5 text-xs leading-5 text-slate-600 border border-emerald-100">
            <div className="flex items-center gap-2 mb-1"><ShieldCheck size={14} className="text-emerald-600 shrink-0" /><span className="font-semibold text-slate-800">Cara kerja</span></div>
            <p>1. Masukkan nama device dan nomor WA.</p>
            <p>2. Scan QR Baileys (<code>localhost:4000</code>) untuk menyambungkan sesi.</p>
            <p>3. Gunakan API key (<code>Bearer</code>) untuk kirim WA lewat API.</p>
            <p>4. Setiap device punya limit 50 pesan/24 jam.</p>
          </div>
        </form>
      </div>
    </main>
  );
}
