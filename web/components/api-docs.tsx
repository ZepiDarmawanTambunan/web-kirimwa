"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  LifeBuoy,
  ListChecks,
  Loader2,
  Send,
  ShieldCheck,
  Smartphone,
  Terminal,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api, ApiRequestError, type Account } from "@/lib/api";
import { copyText } from "@/lib/format";
import { DAILY_QUOTA, connectionStatus, messageStatus } from "@/lib/status";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

const SECTIONS = [
  { id: "mulai", label: "Mulai cepat" },
  { id: "autentikasi", label: "Autentikasi" },
  { id: "perangkat", label: "Perangkat" },
  { id: "kirim", label: "Kirim pesan" },
  { id: "riwayat", label: "Riwayat & status" },
  { id: "admin", label: "Akun & admin" },
  { id: "batas", label: "Batas & kuota" },
  { id: "error", label: "Kode error" },
  { id: "operasional", label: "Catatan operasional" },
  { id: "bantuan", label: "Pemecahan masalah" },
];

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const METHOD_TONES: Record<Method, BadgeTone> = {
  GET: "info",
  POST: "success",
  PATCH: "warning",
  DELETE: "danger",
};

type Endpoint = {
  method: Method;
  path: string;
  auth: string;
  summary: string;
  body?: string;
  response: string;
};

const MESSAGE_STATUS_KEYS = [
  "processing",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "invalid",
  "expired",
];

const CONNECTION_KEYS = [
  "connected",
  "connecting",
  "qr_ready",
  "qr_expired",
  "disconnected",
  "logged_out",
  "error",
];

const ERROR_CODES: Array<{ status: string; code: string; meaning: string }> = [
  { status: "400", code: "invalid_request", meaning: "Isi permintaan tidak lolos validasi (nomor, pesan, atau nama perangkat)." },
  { status: "401", code: "unauthorized", meaning: "Sesi berakhir atau API key/email-kata sandi salah." },
  { status: "403", code: "forbidden", meaning: "Akun tidak memiliki izin (mis. endpoint admin untuk pengguna biasa)." },
  { status: "404", code: "not_found", meaning: "Data tidak ada, atau bukan milik akun yang sedang masuk." },
  { status: "409", code: "conflict", meaning: "Data bertabrakan, misalnya nomor perangkat sudah terdaftar." },
  { status: "500", code: "internal_error", meaning: "Kesalahan di sisi server. Ulangi beberapa saat lagi." },
  { status: "502", code: "upstream_error", meaning: "Gateway WhatsApp internal tidak merespons atau provider menolak permintaan." },
];

function Section({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">{icon}</span>
            {title}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </section>
  );
}

function CodeBlock({ label, code, onCopy }: { label: string; code: string; onCopy: (value: string, label: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3.5 py-2">
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          <Terminal className="size-3.5" />
          {label}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
          onClick={() => onCopy(code, label)}
        >
          <Copy className="size-3.5" />
          Salin
        </Button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[12px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3">
        <Badge tone={METHOD_TONES[endpoint.method]} className="font-mono uppercase">
          {endpoint.method}
        </Badge>
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-slate-800">{endpoint.path}</code>
        <Badge tone="neutral" className="hidden sm:inline-flex">
          {endpoint.auth}
        </Badge>
        <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-3.5 py-3.5 text-sm">
        <p className="text-slate-600">{endpoint.summary}</p>
        {endpoint.body ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Isi permintaan</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-800">
              <code>{endpoint.body}</code>
            </pre>
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Contoh respons</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-800">
            <code>{endpoint.response}</code>
          </pre>
        </div>
      </div>
    </details>
  );
}

export default function ApiDocs() {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    const result = await api<Account>("/auth/me");
    setAccount(result);
  }, []);

  useEffect(() => {
    void loadAccount().catch((failure: unknown) => {
      if (failure instanceof ApiRequestError && failure.status === 401) router.replace("/login");
      else setError(failure instanceof Error ? failure.message : "Profil gagal dimuat.");
    });
  }, [loadAccount, router]);

  async function copy(value: string, label: string) {
    const ok = await copyText(value);
    if (ok) toast.success(`${label} disalin`);
    else toast.error("Gagal menyalin", "Salin manual dari blok kode.");
  }

  const registerSnippet = `curl -X POST "${API_BASE}/auth/register" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"operator@contoh.id","password":"rahasia-minimal-12"}'`;

  const loginSnippet = `curl -X POST "${API_BASE}/auth/login" \\
  -H "Content-Type: application/json" \\
  -c cookie.txt \\
  -d '{"email":"operator@contoh.id","password":"rahasia-minimal-12"}'`;

  const apiKeySnippet = `curl -X POST "${API_BASE}/auth/api-key" -b cookie.txt
# respons: {"api_key":"kirimwa_xxx.yyy","prefix":"kirimwa_xxx"}
# API key hanya ditampilkan sekali — simpan di secret manager Anda.`;

  const sendSnippet = `curl -X POST "${API_BASE}/messages" \\
  -H "Authorization: Bearer $KIRIMWA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"device_id":"<device-id>","target":"628123456789,628987654321","message":"Halo dari KirimWA"}'`;

  const sendJsSnippet = `const response = await fetch("${API_BASE}/messages", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.KIRIMWA_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    device_id: "<device-id>",
    target: "628123456789",
    message: "Halo dari KirimWA",
  }),
});

const { messages } = await response.json();
console.log(messages.map((item) => \`\${item.target}: \${item.status}\`));`;

  const deviceStatusSnippet = `curl -b cookie.txt "${API_BASE}/devices/<device-id>/status"
# {"status":"connected","qr_code":null,"cached_messages":12}

curl -X POST -b cookie.txt "${API_BASE}/devices/<device-id>/connect"
# {"status":"connecting","qr_code":null,"cached_messages":12}`;

  const historySnippet = `curl -H "Authorization: Bearer $KIRIMWA_API_KEY" \\
  "${API_BASE}/messages?limit=50"
# {"messages":[{"id":"...","device_id":"...","target":"628123456789","body":"Halo",
#   "provider_id":"3EB0...","status":"Delivered","state":"delivered","created_at":"..."}]}`;

  const healthSnippet = `curl "${API_BASE.replace("/api/v1", "")}/healthz"
# ok`;

  const authEndpoints: Endpoint[] = [
    {
      method: "POST",
      path: "/auth/register",
      auth: "Publik",
      summary: "Membuat akun baru. Kata sandi 12–128 karakter dan disimpan sebagai Argon2.",
      body: `{ "email": "operator@contoh.id", "password": "rahasia-minimal-12" }`,
      response: `{ "id": "uuid", "email": "operator@contoh.id", "role": "user" }
// disertai cookie sesi HttpOnly "session"`,
    },
    {
      method: "POST",
      path: "/auth/login",
      auth: "Publik",
      summary: "Masuk untuk memakai dashboard. Cookie sesi dipakai oleh semua halaman web.",
      body: `{ "email": "operator@contoh.id", "password": "rahasia-minimal-12" }`,
      response: `{ "id": "uuid", "email": "operator@contoh.id", "role": "user" }`,
    },
    {
      method: "GET",
      path: "/auth/me",
      auth: "Sesi",
      summary: "Profil akun yang sedang masuk.",
      response: `{ "id": "uuid", "email": "operator@contoh.id", "role": "user" }`,
    },
    {
      method: "POST",
      path: "/auth/logout",
      auth: "Sesi",
      summary: "Menghapus cookie sesi. Respons tanpa isi.",
      response: `(204 / tanpa isi)`,
    },
    {
      method: "POST",
      path: "/auth/api-key",
      auth: "Sesi",
      summary: "Menerbitkan atau memutar API key akun. Nilai penuh hanya dikembalikan sekali.",
      response: `{ "api_key": "kirimwa_xxx.yyy", "prefix": "kirimwa_xxx" }`,
    },
  ];

  const deviceEndpoints: Endpoint[] = [
    {
      method: "GET",
      path: "/devices",
      auth: "Sesi",
      summary: "Daftar perangkat milik akun, termasuk status sambungan terakhirnya.",
      response: `[ { "id": "uuid", "device_name": "Kasir 1", "phone_number": "628123456789",
    "provider": "baileys", "is_active": true, "connection_status": "connected",
    "created_at": "2026-10-17T04:12:00Z" } ]`,
    },
    {
      method: "POST",
      path: "/devices",
      auth: "Sesi",
      summary: "Menambah perangkat. Provider Baileys memakai QR; Meta wajib menyertakan Phone Number ID dan access token.",
      body: `{ "device_name": "Kasir 1", "phone_number": "628123456789", "provider": "baileys" }

// Meta Cloud API
{ "device_name": "Notifikasi", "phone_number": "628123456789", "provider": "meta_cloud",
  "meta_phone_number_id": "1234567890", "meta_access_token": "EAAG..." }`,
      response: `{ "id": "uuid", "device_name": "Kasir 1", "phone_number": "628123456789",
  "provider": "baileys", "is_active": true, "connection_status": "disconnected" }`,
    },
    {
      method: "GET",
      path: "/devices/{id}/status",
      auth: "Sesi",
      summary: "Status sambungan perangkat. Untuk Baileys, qr_code berisi gambar QR selama proses penautan.",
      response: `{ "status": "connected", "qr_code": null, "cached_messages": 12 }`,
    },
    {
      method: "POST",
      path: "/devices/{id}/connect",
      auth: "Sesi",
      summary: "Memulai sesi perangkat Baileys dan mengembalikan QR bila belum tertaut. Panggil ulang setelah gateway dimulai kembali.",
      response: `{ "status": "qr_ready", "qr_code": "data:image/png;base64,...", "cached_messages": 0 }`,
    },
    {
      method: "DELETE",
      path: "/devices/{id}",
      auth: "Sesi",
      summary: "Menghapus perangkat beserta sesi Baileys-nya (perlu penautan QR ulang bila ditambah lagi).",
      response: `(204 / tanpa isi)`,
    },
  ];

  const messageEndpoints: Endpoint[] = [
    {
      method: "POST",
      path: "/messages",
      auth: "Sesi / API key",
      summary: "Mengirim pesan lewat perangkat terpilih. Menerima beberapa nomor sekaligus (pisahkan dengan koma).",
      body: `{ "device_id": "uuid", "target": "628123456789,628987654321", "message": "Halo dari KirimWA" }`,
      response: `{ "messages": [ { "id": "uuid", "device_id": "uuid",
    "target": "628123456789", "status": "Sent" } ] }`,
    },
    {
      method: "GET",
      path: "/messages?limit=50",
      auth: "Sesi / API key",
      summary: "Riwayat pesan akun, terbaru lebih dahulu. limit 1–100 (bawaan 50).",
      response: `{ "messages": [ { "id": "uuid", "device_id": "uuid", "target": "628123456789",
    "body": "Halo", "provider_id": "3EB0...", "status": "Delivered",
    "state": "delivered", "created_at": "2026-10-17T04:12:00Z" } ] }`,
    },
    {
      method: "GET",
      path: "/messages/{id}",
      auth: "Sesi / API key",
      summary: "Detail satu pesan beserta status terakhir yang diketahui.",
      response: `{ "id": "uuid", "device_id": "uuid", "target": "628123456789", "body": "Halo",
  "provider_id": "3EB0...", "status": "Read", "state": "read",
  "created_at": "2026-10-17T04:12:00Z" }`,
    },
  ];

  const adminEndpoints: Endpoint[] = [
    {
      method: "GET",
      path: "/admin/users",
      auth: "Admin",
      summary: "Daftar seluruh akun. Hanya untuk pengguna dengan peran admin.",
      response: `[ { "id": "uuid", "email": "operator@contoh.id", "role": "user",
    "is_active": true, "api_key_prefix": "kirimwa_xxx" } ]`,
    },
    {
      method: "PATCH",
      path: "/admin/users/{id}",
      auth: "Admin",
      summary: "Mengaktifkan atau menonaktifkan akun. Admin tidak dapat menonaktifkan akunnya sendiri.",
      body: `{ "active": false }`,
      response: `(204 / tanpa isi)`,
    },
  ];

  const internalEndpoints: Endpoint[] = [
    {
      method: "POST",
      path: "/webhooks/gateway/{secret}",
      auth: "Internal",
      summary:
        "Callback status dari service Baileys ke API. Dipakai di jaringan internal Docker dengan secret dari env, bukan untuk integrasi publik.",
      body: `{ "id": "3EB0...", "stateid": "uuid", "status": "delivered", "state": "delivered" }`,
      response: `(204 / tanpa isi)`,
    },
    {
      method: "GET",
      path: "/healthz",
      auth: "Publik",
      summary: "Pemeriksaan kesehatan API (di luar prefiks /api/v1).",
      response: `ok`,
    },
  ];

  return (
    <AppShell email={account?.email ?? "memuat…"} role={account?.role ?? "user"}>
      <div className="space-y-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <BookOpen className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dokumentasi</h1>
              <p className="text-sm text-slate-500">
                Panduan pemakaian dashboard dan referensi REST API KirimWA.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" className="font-mono">
              {API_BASE}
            </Badge>
            <Badge tone="info">Kuota {DAILY_QUOTA} pesan / 24 jam</Badge>
            <Badge tone="success">Baileys &amp; Meta Cloud API</Badge>
          </div>
        </header>

        {error ? (
          <Alert tone="danger" title="Dokumentasi tidak dapat memuat profil akun" icon={<TriangleAlert className="size-4" />}>
            {error}
          </Alert>
        ) : null}

        <nav aria-label="Daftar isi" className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <Section
          id="mulai"
          title="Mulai cepat"
          description="Empat langkah dari akun baru sampai pesan terkirim."
          icon={<ListChecks className="size-4" />}
        >
          <ol className="space-y-3 text-sm text-slate-600">
            {[
              {
                title: "Buat akun dan masuk",
                body: "Daftar melalui halaman Masuk atau endpoint /auth/register. Cookie sesi dipakai otomatis oleh dashboard.",
              },
              {
                title: "Tambahkan perangkat",
                body: "Buka Koneksi WhatsApp → Tambah perangkat. Pilih Baileys (pindai QR, gratis) atau Meta Cloud API (butuh Phone Number ID dan access token).",
              },
              {
                title: "Hubungkan perangkat",
                body: "Untuk Baileys klik Hubungkan, lalu pindai QR dari WhatsApp di HP → Perangkat tertaut → Tautkan perangkat. Status berubah menjadi Terhubung.",
              },
              {
                title: "Kirim pesan",
                body: "Di Beranda, tulis nomor tujuan format internasional (mis. 628123456789) lalu klik Kirim. Untuk integrasi server-ke-server, pakai API key dan endpoint /messages.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="space-y-0.5">
                  <span className="block font-medium text-slate-800">{step.title}</span>
                  <span className="block leading-relaxed">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <Alert tone="info" title="URL dasar" icon={<Terminal className="size-4" />}>
            Semua endpoint dashboard berada di bawah <code className="break-all font-mono text-xs">{API_BASE}</code>. Permintaan
            dari dashboard mengirim cookie sesi (<code className="break-all font-mono text-xs">credentials: include</code>);
            integrasi server memakai header <code className="break-all font-mono text-xs">Authorization: Bearer &lt;api_key&gt;</code>.
          </Alert>
        </Section>

        <Section
          id="autentikasi"
          title="Autentikasi"
          description="Dua cara masuk: cookie sesi untuk dashboard, API key untuk integrasi."
          icon={<KeyRound className="size-4" />}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
              <p className="font-medium text-slate-800">Cookie sesi</p>
              <p className="mt-1 leading-relaxed text-slate-600">
                Diterbitkan saat masuk/daftar sebagai cookie <code className="break-all font-mono text-xs">session</code> yang
                HttpOnly. Dipakai halaman dashboard dan endpoint perangkat serta admin.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
              <p className="font-medium text-slate-800">API key</p>
              <p className="mt-1 leading-relaxed text-slate-600">
                Dibuat lewat <code className="break-all font-mono text-xs">POST /auth/api-key</code> (ditampilkan sekali, hanya
                hash SHA-256 yang disimpan). Berlaku untuk <code className="break-all font-mono text-xs">/messages</code>.
              </p>
            </div>
          </div>
          <CodeBlock label="Daftar akun" code={registerSnippet} onCopy={copy} />
          <CodeBlock label="Masuk & simpan cookie" code={loginSnippet} onCopy={copy} />
          <CodeBlock label="Terbitkan API key" code={apiKeySnippet} onCopy={copy} />
          <div className="space-y-2">
            {authEndpoints.map((endpoint) => (
              <EndpointRow key={`${endpoint.method}${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
          <Alert tone="warning" title="Perlakukan API key seperti kata sandi" icon={<ShieldCheck className="size-4" />}>
            Jangan menaruh API key di kode frontend atau repositori publik. Simpan pada variabel lingkungan di server
            pengirim, dan putar (rotate) bila ada dugaan kebocoran.
          </Alert>
        </Section>

        <Section
          id="perangkat"
          title="Perangkat"
          description="Satu perangkat memakai tepat satu provider — tidak ada fallback otomatis antar provider."
          icon={<Smartphone className="size-4" />}
        >
          <div className="space-y-2">
            {deviceEndpoints.map((endpoint) => (
              <EndpointRow key={`${endpoint.method}${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
          <CodeBlock label="Periksa status & hubungkan perangkat" code={deviceStatusSnippet} onCopy={copy} />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Arti status sambungan perangkat</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Status koneksi</th>
                  <th className="px-3 py-2 font-medium">Arti</th>
                </tr>
              </thead>
              <tbody>
                {CONNECTION_KEYS.map((key) => {
                  const meta = connectionStatus(key);
                  return (
                    <tr key={key} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <code className="font-mono text-xs text-slate-800">{key}</code>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <span className="font-medium text-slate-800">{meta.label}.</span> {meta.hint}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="kirim"
          title="Kirim pesan"
          description="Satu permintaan dapat menampung beberapa nomor sekaligus."
          icon={<Send className="size-4" />}
        >
          <CodeBlock label="cURL — kirim pesan" code={sendSnippet} onCopy={copy} />
          <CodeBlock label="JavaScript — kirim pesan" code={sendJsSnippet} onCopy={copy} />
          <div className="space-y-2">
            {messageEndpoints.map((endpoint) => (
              <EndpointRow key={`${endpoint.method}${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
          <Alert tone="info" title="Status awal selalu Processing" icon={<LifeBuoy className="size-4" />}>
            Respons pengiriman berarti permintaan sudah diterima gateway, belum tentu sudah sampai ke HP penerima.
            Pantau perubahan status melalui riwayat pesan (<code className="break-all font-mono text-xs">GET /messages</code>).
          </Alert>
        </Section>

        <Section
          id="riwayat"
          title="Riwayat & arti status"
          description="Status mengikuti tahapan pengiriman WhatsApp dan diperbarui oleh callback gateway."
          icon={<ListChecks className="size-4" />}
        >
          <CodeBlock label="Ambil riwayat pesan" code={historySnippet} onCopy={copy} />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Arti status pesan</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Label di dashboard</th>
                  <th className="px-3 py-2 font-medium">Arti</th>
                </tr>
              </thead>
              <tbody>
                {MESSAGE_STATUS_KEYS.map((key) => {
                  const meta = messageStatus(key);
                  return (
                    <tr key={key} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <code className="font-mono text-xs text-slate-800">{key}</code>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{meta.hint}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Nilai status lain yang mungkin muncul dari provider (mis. <code className="break-all font-mono">Expired</code>,{" "}
            <code className="break-all font-mono">Invalid</code>, <code className="break-all font-mono">Failed</code>) ditampilkan apa adanya
            dengan label Indonesia melalui tabel terjemahan dashboard.
          </p>
        </Section>

        <Section
          id="admin"
          title="Akun & admin"
          description="Peran admin dapat menambah akun operator dan menonaktifkannya."
          icon={<Users className="size-4" />}
        >
          <div className="space-y-2">
            {adminEndpoints.map((endpoint) => (
              <EndpointRow key={`${endpoint.method}${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Panel admin tersedia di Beranda untuk akun dengan peran <code className="break-all font-mono text-xs">admin</code>.
            Akun nonaktif tidak bisa masuk, tetapi riwayat pesannya tetap tersimpan.
          </p>
        </Section>

        <Section
          id="batas"
          title="Batas & kuota"
          description="Batas ini berlaku untuk semua jalur pengiriman, Meta maupun Baileys."
          icon={<ShieldCheck className="size-4" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Batas dan kuota</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Aturan</th>
                  <th className="px-3 py-2 font-medium">Nilai</th>
                  <th className="px-3 py-2 font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                {[
                  ["Kuota pengiriman", `${DAILY_QUOTA} pesan / 24 jam bergulir`, "Direservasi secara transaksional sehingga permintaan bersamaan tidak bisa melewati batas."],
                  ["Nomor tujuan per permintaan", "1 – 100 nomor", "Pisahkan dengan koma pada field target."],
                  ["Format nomor", "8 – 16 digit, kode negara, tanpa + atau 0", "Contoh benar: 628123456789."],
                  ["Panjang pesan", "1 – 4096 byte", "Teks biasa; template/opt-in Meta belum ditangani MVP ini."],
                  ["Riwayat pesan", "1 – 100 per permintaan", "Parameter limit, bawaan 50."],
                  ["Kata sandi akun", "12 – 128 karakter", "Hash Argon2 untuk akun terdaftar, BCrypt untuk admin awal."],
                ].map(([rule, value, note]) => (
                  <tr key={rule} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">{rule}</td>
                    <td className="px-3 py-2.5">{value}</td>
                    <td className="px-3 py-2.5">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="error"
          title="Kode error"
          description="Semua kegagalan memakai amplop error yang sama."
          icon={<TriangleAlert className="size-4" />}
        >
          <pre className="overflow-x-auto rounded-xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-800">
            <code>{`{ "error": { "code": "invalid_request", "message": "message must contain 1 to 4096 bytes" } }`}</code>
          </pre>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Daftar kode error</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">HTTP</th>
                  <th className="px-3 py-2 font-medium">code</th>
                  <th className="px-3 py-2 font-medium">Kapan terjadi</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_CODES.map((item) => (
                  <tr key={item.code} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">{item.status}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <code className="font-mono text-xs text-slate-800">{item.code}</code>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{item.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Kegagalan per pesan juga tampil sebagai status <code className="break-all font-mono">Failed</code> pada riwayat,
            tanpa membatalkan pesan lain dalam permintaan yang sama.
          </p>
        </Section>

        <Section
          id="operasional"
          title="Catatan operasional"
          description="Hal-hal yang paling sering menimbulkan pertanyaan saat mengoperasikan KirimWA."
          icon={<Wrench className="size-4" />}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-slate-800">Kredensial sesi Baileys bertahan di volume</p>
              <p className="mt-1 leading-relaxed">
                Sesi WhatsApp tersimpan pada volume <code className="break-all font-mono text-xs">baileys_auth</code>. Setelah
                service gateway dijalankan ulang, perangkat bisa terbaca <em>Disconnected</em> sampai{" "}
                <code className="break-all font-mono text-xs">POST /devices/&#123;id&#125;/connect</code> dipanggil lagi — tanpa
                perlu memindai QR ulang. Jangan menjalankan <code className="break-all font-mono text-xs">docker compose down -v</code>{" "}
                karena menghapus sesi dan seluruh database.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-slate-800">Kolom cached_messages pada status perangkat</p>
              <p className="mt-1 leading-relaxed">
                Jumlah pesan terkirim yang masih disimpan gateway (maksimum 256, disimpan di memori) agar WhatsApp dapat
                meminta ulang isi pesan saat penerima gagal mendekripsi (&ldquo;retry receipt&rdquo;). Nilainya mulai
                dari 0 setiap gateway dijalankan ulang; selama masih 0, penerima berpotensi melihat keterangan
                &ldquo;menunggu pesan ini&rdquo; untuk pesan lama, dan pengiriman baru akan mengisinya kembali.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-slate-800">Perbedaan cakupan status per provider</p>
              <p className="mt-1 leading-relaxed">
                Baileys melaporkan status sampai <em>Diterima</em> dan <em>Dibaca</em> lewat callback gateway. Meta
                Cloud API pada MVP ini belum memakai webhook status Meta, sehingga statusnya umumnya berhenti di{" "}
                <em>Terkirim</em> — pantau detail pengiriman di Meta Business.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-slate-800">Pengamanan kredensial</p>
              <p className="mt-1 leading-relaxed">
                Access token Meta dienkripsi AES-256-GCM dengan kunci <code className="break-all font-mono text-xs">DEVICE_CREDENTIALS_KEY</code>{" "}
                dan tidak pernah dikirim ke frontend. Service gateway Baileys hanya berada di jaringan internal Docker
                dan dilindungi <code className="break-all font-mono text-xs">GATEWAY_TOKEN</code>. Semua kredensial ada di{" "}
                <code className="break-all font-mono text-xs">.env</code> — cadangkan file itu bila ingin memulihkan sesi dan
                perangkat.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-slate-800">Baris pesan tanpa perangkat</p>
              <p className="mt-1 leading-relaxed">
                Pesan lama dengan <code className="break-all font-mono text-xs">device_id</code> kosong adalah sisa pengiriman
                sebelum ada perangkat tersambung. Baris seperti ini hanya bisa dilihat, tidak dapat dikirim ulang;
                kirim ulang sebagai pesan baru lewat perangkat yang sudah terhubung.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Endpoint internal</p>
            {internalEndpoints.map((endpoint) => (
              <EndpointRow key={`${endpoint.method}${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
          <CodeBlock label="Pemeriksaan kesehatan API" code={healthSnippet} onCopy={copy} />
        </Section>

        <Section
          id="bantuan"
          title="Pemecahan masalah"
          description="Gejala yang paling sering muncul beserta langkah cepatnya."
          icon={<LifeBuoy className="size-4" />}
        >
          <dl className="space-y-3 text-sm">
            {[
              {
                symptom: "Pengiriman ditolak dengan pesan perangkat belum terhubung",
                fix: "Buka Koneksi WhatsApp, klik Hubungkan, lalu pindai QR. Status harus Terhubung sebelum mengirim.",
              },
              {
                symptom: "Respons 502 upstream_error",
                fix: "Gateway WhatsApp tidak merespons. Periksa container gateway dan status perangkat, lalu ulangi pengiriman.",
              },
              {
                symptom: "Penerima melihat keterangan menunggu pesan",
                fix: "Biasanya cache pesan gateway sedang kosong (baru dijalankan ulang). Kirim ulang pesan tersebut agar dapat dijawab ke WhatsApp.",
              },
              {
                symptom: "Pesan berstatus Gagal (Failed)",
                fix: "Cek format nomor (kode negara, tanpa tanda +) dan pastikan nomor terdaftar di WhatsApp; status Invalid berarti nomor tidak dikenali WhatsApp.",
              },
              {
                symptom: "Sesi dashboard tiba-tiba berakhir",
                fix: "Cookie sesi kedaluwarsa atau API dijalankan ulang dengan JWT_SECRET berbeda. Masuk kembali lewat halaman Masuk.",
              },
            ].map((item) => (
              <div key={item.symptom} className="rounded-xl border border-slate-200 p-4">
                <dt className="flex items-start gap-2 font-medium text-slate-800">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {item.symptom}
                </dt>
                <dd className="mt-1 pl-6 leading-relaxed text-slate-600">{item.fix}</dd>
              </div>
            ))}
          </dl>
          <Alert tone="info" title="Dokumentasi teknis lengkap" icon={<ExternalLink className="size-4" />}>
            Referensi instalasi, variabel lingkungan, dan catatan audit ada di berkas <code className="break-all font-mono text-xs">README.md</code>{" "}
            dan <code className="break-all font-mono text-xs">AUDIT.md</code> pada repositori proyek.
          </Alert>
        </Section>

        {!account ? (
          <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="size-3.5 animate-spin" /> memuat profil akun…
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
