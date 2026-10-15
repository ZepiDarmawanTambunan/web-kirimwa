"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle, ShieldCheck, Zap } from "lucide-react";
import { api, type Account } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api<Account>(registering ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/dashboard");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#082f26] px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-28 -top-20 h-[480px] w-[480px] rounded-full border border-white/10" />
        <div className="absolute -right-4 top-8 h-[330px] w-[330px] rounded-full border border-white/10" />
        <div className="absolute bottom-[-230px] left-[-150px] h-[480px] w-[480px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500"><MessageCircle size={21} /></div>
          <span className="text-lg font-bold tracking-tight">kirimwa<span className="text-emerald-400">.</span></span>
        </div>
        <div className="relative max-w-xl pb-10">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-medium text-emerald-200"><Zap size={13} /> WhatsApp API, tanpa ribet</span>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight">Percakapan yang baik dimulai dari pesan yang tepat.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-emerald-100/70">Kelola pengiriman WhatsApp bisnis lewat satu dashboard yang sederhana, aman, dan siap diintegrasikan.</p>
          <div className="mt-10 flex items-center gap-2 text-sm text-emerald-100/60"><ShieldCheck size={17} /> Kredensial provider tetap aman di server</div>
        </div>
        <p className="relative text-xs text-emerald-100/40">API gateway untuk tim yang bergerak cepat.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-700 text-white"><MessageCircle size={20} /></div>
            <span className="text-lg font-bold tracking-tight">kirimwa.</span>
          </div>
          <p className="text-sm font-semibold text-emerald-700">SELAMAT DATANG</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{registering ? "Buat akun baru" : "Masuk ke akun Anda"}</h2>
          <p className="mt-2 text-sm text-slate-500">{registering ? "Mulai kelola komunikasi WhatsApp bisnis." : "Lanjutkan ke workspace pengiriman Anda."}</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label htmlFor="email" className="block space-y-2 text-sm font-medium text-slate-700">Email kerja
              <Input id="email" type="email" autoComplete="email" placeholder="nama@perusahaan.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
            </label>
            <label htmlFor="password" className="block space-y-2 text-sm font-medium text-slate-700">Password
              <Input id="password" type="password" autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "Minimal 12 karakter" : "Masukkan password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={registering ? 12 : undefined} maxLength={128} />
            </label>
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700"><p className="font-medium">Terjadi kesalahan</p><p className="text-xs mt-1 opacity-90">{error}</p></div>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Memproses..." : registering ? "Buat akun" : "Masuk"} <ArrowRight size={16} /></Button>
          </form>
          <p className="mt-7 text-center text-sm text-slate-500">
            {registering ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
            <button type="button" className="font-semibold text-emerald-700 hover:text-emerald-900" onClick={() => { setRegistering(!registering); setError(""); }}>
              {registering ? "Masuk" : "Daftar sekarang"}
            </button>
          </p>
          <div className="mt-10 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">Dengan melanjutkan, Anda menyetujui ketentuan layanan dan kebijakan privasi.</div>
        </div>
      </section>
    </main>
  );
}
