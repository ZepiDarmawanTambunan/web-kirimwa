"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowDownToLine, ArrowUpRight, CircleHelp, Clock3,
  Code2, Copy, KeyRound, LogOut, Menu, MessageCircle, Plus, RefreshCw, Send,
  Settings2, ShieldCheck, Users, X,
} from "lucide-react";
import { api, ApiRequestError, type Account, type AdminUser, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const color = normalized === "sent" ? "bg-emerald-50 text-emerald-700" :
    ["failed", "invalid", "expired", "url unreachable"].includes(normalized) ? "bg-rose-50 text-rose-700" :
    normalized === "pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  const label = normalized === "submissionunknown" ? "Status tidak diketahui" : value;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>;
}

export default function Dashboard() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "users">("overview");
  const [mobileMenu, setMobileMenu] = useState(false);

  const loadMessages = useCallback(async () => {
    const result = await api<{ messages: Message[] }>("/messages?limit=50");
    setMessages(result.messages);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const me = await api<Account>("/auth/me");
        if (!mounted) return;
        setAccount(me);
        const result = await api<{ messages: Message[] }>("/messages?limit=50");
        if (mounted) setMessages(result.messages);
        if (me.role === "admin") {
          const adminUsers = await api<AdminUser[]>("/admin/users");
          if (mounted) setUsers(adminUsers);
        }
      } catch (failure) {
        if (!mounted) return;
        if (failure instanceof ApiRequestError && failure.status === 401) {
          router.replace("/login");
        } else {
          setError(failure instanceof Error ? failure.message : "Workspace gagal dimuat.");
        }
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (!account) return;
    const timer = window.setInterval(() => {
      void loadMessages().catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : "Riwayat pesan gagal diperbarui.");
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [account, loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await api<{ messages: Message[] }>("/messages", {
        method: "POST",
        body: JSON.stringify({ target, message }),
      });
      setNotice(`${result.messages.length} pesan masuk antrean pengiriman.`);
      setMessage("");
      await loadMessages();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Pesan gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  async function createApiKey() {
    setError("");
    try {
      const result = await api<{ api_key: string }>("/auth/api-key", { method: "POST" });
      setApiKey(result.api_key);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "API key gagal dibuat.");
    }
  }

  async function logout() {
    try {
      await api<void>("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal keluar dari akun.");
    }
  }

  async function toggleUser(user: AdminUser) {
    setError("");
    try {
      await api(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ active: !user.is_active }) });
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, is_active: !entry.is_active } : entry));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Status akun gagal diperbarui.");
    }
  }

  if (!account) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-sm text-slate-500">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-5 py-4 text-rose-700">{error}</p> : "Memuat workspace…"}
      </main>
    );
  }

  const sentCount = messages.filter((item) => item.status.toLowerCase() === "sent").length;
  const pendingCount = messages.filter((item) => ["processing", "pending", "waiting", "submissionunknown"].includes(item.status.toLowerCase())).length;
  const failedCount = messages.filter((item) => ["failed", "invalid", "expired", "url unreachable"].includes(item.status.toLowerCase())).length;

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Buka menu"><Menu size={19} /></button>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white"><MessageCircle size={19} /></div>
            <div><p className="text-sm font-bold tracking-tight text-slate-900">kirimwa<span className="text-emerald-600">.</span></p><p className="text-[10px] uppercase tracking-[.15em] text-slate-400">WhatsApp gateway</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-medium text-slate-800">{account.email}</p><p className="text-xs capitalize text-slate-400">{account.role}</p></div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">{account.email.slice(0, 1).toUpperCase()}</div>
            <Button variant="ghost" size="icon" aria-label="Keluar" onClick={logout}><LogOut size={17} /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[230px_1fr]">
        <aside className={`${mobileMenu ? "block" : "hidden"} border-r border-slate-200/80 bg-white px-4 py-6 lg:block`}>
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
          <button type="button" onClick={() => { setTab("overview"); setMobileMenu(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${tab === "overview" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Activity size={17} /> Overview</button>
          <button type="button" onClick={() => { setTab("overview"); document.getElementById("history")?.scrollIntoView({ behavior: "smooth" }); }} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><Clock3 size={17} /> Riwayat pesan</button>
          {account.role === "admin" && <button type="button" onClick={() => { setTab("users"); setMobileMenu(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${tab === "users" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Users size={17} /> Pengguna</button>}
          <p className="mb-3 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Developer</p>
          <button type="button" onClick={() => document.getElementById("api-access")?.scrollIntoView({ behavior: "smooth" })} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><Code2 size={17} /> API & integrasi</button>
          <button type="button" disabled className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 disabled:cursor-not-allowed"><Settings2 size={17} /> Pengaturan</button>
          <div className="mt-10 rounded-2xl bg-[#f5f9f7] p-4">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm"><CircleHelp size={16} /></div>
            <p className="text-xs font-semibold text-slate-800">Butuh bantuan?</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Lihat panduan integrasi API untuk memulai.</p>
            <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" href="#" target="_blank" rel="noreferrer">Dokumentasi <ArrowUpRight size={13} /></a>
          </div>
        </aside>

        <main className="min-w-0 px-5 py-7 lg:px-9 lg:py-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-medium text-slate-400">Workspace / <span className="text-slate-600">{tab === "users" ? "Pengguna" : "Overview"}</span></p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{tab === "users" ? "Manajemen pengguna" : "Selamat datang kembali"}<span className="text-emerald-700">.</span></h1><p className="mt-1 text-sm text-slate-500">{tab === "users" ? "Kelola akses akun yang terdaftar di platform." : "Pantau dan kelola komunikasi WhatsApp Anda."}</p></div>
            <Button variant="secondary" size="sm" onClick={() => void loadMessages()}><RefreshCw size={14} /> Refresh data</Button>
          </div>

          {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3.5 text-sm text-rose-700 shadow-sm"><div className="mt-0.5 shrink-0 rounded-full bg-rose-200/50 p-1"><X size={14} /></div><div className="flex-1"><p className="font-medium">Terjadi kesalahan</p><p className="text-xs opacity-90 mt-0.5">{error}</p></div><button type="button" aria-label="Tutup" onClick={() => setError("")} className="shrink-0 rounded-lg hover:bg-rose-200/30 p-1"><X size={16} /></button></div>}
          {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

          {tab === "users" && account.role === "admin" ? (
            <Card>
              <CardHeader><CardTitle>Akun terdaftar</CardTitle><CardDescription>Nonaktifkan akun untuk mencabut akses sesi dan API key-nya.</CardDescription></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-400"><th className="pb-3 font-medium">Email</th><th className="pb-3 font-medium">Role</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">API key</th><th className="pb-3 text-right font-medium">Aksi</th></tr></thead>
                <tbody>{users.map((user) => <tr key={user.id} className="border-b border-slate-100 last:border-0"><td className="py-4 font-medium text-slate-800">{user.email}</td><td className="py-4 capitalize text-slate-500">{user.role}</td><td className="py-4"><Status value={user.is_active ? "Aktif" : "Nonaktif"} /></td><td className="py-4 font-mono text-xs text-slate-500">{user.api_key_prefix ?? "Belum dibuat"}</td><td className="py-4 text-right"><Button size="sm" variant={user.is_active ? "danger" : "secondary"} onClick={() => void toggleUser(user)}>{user.is_active ? "Nonaktifkan" : "Aktifkan"}</Button></td></tr>)}</tbody>
              </table></div></CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Metric label="Pesan terkirim" value={String(sentCount)} detail="Dari 50 pesan terakhir" icon={<ArrowUpRight size={17} />} color="text-emerald-700 bg-emerald-50" />
                <Metric label="Dalam proses" value={String(pendingCount)} detail="Menunggu update status" icon={<Clock3 size={17} />} color="text-amber-700 bg-amber-50" />
                <Metric label="Perlu perhatian" value={String(failedCount)} detail="Gagal / nomor tidak valid" icon={<Activity size={17} />} color="text-rose-700 bg-rose-50" />
              </div>

              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
                <Card>
                  <CardHeader className="border-b border-slate-100 pb-5"><div className="flex items-center justify-between"><div><CardTitle>Kirim pesan WhatsApp</CardTitle><CardDescription className="mt-1">Kirim pesan langsung ke satu atau beberapa nomor.</CardDescription></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Send size={17} /></div></div></CardHeader>
                  <CardContent className="pt-5">
                    <form onSubmit={sendMessage} className="space-y-4">
                      <label htmlFor="target" className="block space-y-2 text-sm font-medium text-slate-700">Nomor tujuan <span className="font-normal text-slate-400">Pisahkan dengan koma</span>
                        <Input id="target" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="628123456789, 628987654321" required />
                      </label>
                      <label htmlFor="message" className="block space-y-2 text-sm font-medium text-slate-700">Isi pesan
                        <textarea id="message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tulis pesan WhatsApp Anda..." rows={5} maxLength={4096} required className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
                      </label>
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1"><span className="text-xs text-slate-400">{message.length} / 4096 karakter</span><Button type="submit" disabled={busy || !message.trim()}><Send size={15} /> {busy ? "Mengirim..." : "Kirim pesan"}</Button></div>
                    </form>
                  </CardContent>
                </Card>

                <Card id="api-access">
                  <CardHeader className="border-b border-slate-100 pb-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><KeyRound size={17} /></div><div><CardTitle>API access</CardTitle><CardDescription className="mt-1">Hubungkan aplikasi Anda dengan API.</CardDescription></div></div></CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/70 p-3.5 text-xs leading-5 text-amber-900"><ShieldCheck size={16} className="mt-0.5 shrink-0" /><span>API key hanya ditampilkan satu kali. Simpan dengan aman dan jangan bagikan ke siapa pun.</span></div>
                    {apiKey ? <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">API key baru Anda</p><div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-slate-950 p-3 text-xs leading-5 text-emerald-200">{apiKey}</code><Button variant="secondary" size="icon" aria-label="Salin API key" onClick={() => void navigator.clipboard.writeText(apiKey)}><Copy size={15} /></Button></div></div> : <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 p-3.5"><span className="font-mono text-xs text-slate-400">wag_••••••••••••</span><span className="text-xs text-slate-400">Tidak ditampilkan</span></div>}
                    <Button variant="secondary" className="w-full" onClick={() => void createApiKey()}><Plus size={15} /> {apiKey ? "Rotasi API key" : "Buat API key"}</Button>
                    <div className="rounded-xl bg-slate-950 p-4"><div className="mb-3 flex items-center justify-between text-[11px] font-medium text-slate-400"><span>Contoh request</span><span className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-300">cURL</span></div><pre className="overflow-x-auto text-[11px] leading-5 text-slate-200"><code>{`curl -X POST \\\n  ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/v1/messages \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"target":"628123456789","message":"Halo!"}'`}</code></pre></div>
                  </CardContent>
                </Card>
              </div>

              <Card id="history" className="mt-6">
                <CardHeader className="flex-row items-center justify-between border-b border-slate-100 pb-5"><div><CardTitle>Riwayat pengiriman</CardTitle><CardDescription className="mt-1">Status terbaru dari pesan yang dikirim.</CardDescription></div><Button variant="ghost" size="sm" onClick={() => void loadMessages()}><RefreshCw size={14} /> Perbarui</Button></CardHeader>
                <CardContent className="pt-2"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-[11px] uppercase tracking-wide text-slate-400"><th className="py-3 font-medium">Penerima</th><th className="py-3 font-medium">Pesan</th><th className="py-3 font-medium">Status</th><th className="py-3 font-medium">Waktu</th></tr></thead><tbody>
                  {messages.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-4 font-medium text-slate-800">{item.target}</td><td className="max-w-[300px] truncate py-4 text-slate-500">{item.body}</td><td className="py-4"><Status value={item.status} />{item.state && <span className="ml-2 text-xs text-slate-400">{item.state}</span>}</td><td className="py-4 text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${item.created_at}${item.created_at.endsWith("Z") ? "" : "Z"}`))}</td></tr>)}
                  {!messages.length && <tr><td colSpan={4} className="py-12 text-center"><div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-slate-50 text-slate-400"><ArrowDownToLine size={18} /></div><p className="text-sm font-medium text-slate-700">Belum ada pesan</p><p className="mt-1 text-xs text-slate-400">Pesan yang dikirim akan tampil di sini.</p></td></tr>}
                </tbody></table></div></CardContent>
              </Card>
            </>
          )}
          <footer className="flex items-center justify-between py-7 text-xs text-slate-400"><span>© 2026 KirimWA</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> API berjalan</span></footer>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, detail, icon, color }: { label: string; value: string; detail: string; icon: React.ReactNode; color: string }) {
  return <Card><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div><div className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}>{icon}</div></CardContent></Card>;
}
