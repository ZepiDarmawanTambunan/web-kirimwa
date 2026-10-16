"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  BookOpen,
  CheckCheck,
  Clock3,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Terminal,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { MessageHistory } from "@/components/message-history";
import { ConnectionBadge, ProviderBadge } from "@/components/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Hint, Select, Textarea } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  api,
  ApiRequestError,
  type Account,
  type AdminUser,
  type Device,
  type Message,
  type SendMessageResponse,
  type SessionStatus,
} from "@/lib/api";
import {
  copyText,
  formatDateTime,
  formatNumber,
  formatRelative,
  isValidPhone,
  normalizeTargets,
} from "@/lib/format";
import { DAILY_QUOTA, isDeliveredStatus, isFailedStatus, isProcessingStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const MESSAGE_LIMIT = 1000;

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "text-slate-500 bg-slate-100",
    success: "text-emerald-600 bg-emerald-50",
    warning: "text-amber-600 bg-amber-50",
    danger: "text-rose-600 bg-rose-50",
    info: "text-sky-600 bg-sky-50",
  };
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          {icon}
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="text-[11px] leading-snug text-slate-400">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardOverview() {
  const router = useRouter();
  const toast = useToast();

  const [account, setAccount] = useState<Account | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [targetRaw, setTargetRaw] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);

  const device = useMemo(() => devices.find((item) => item.id === deviceId) ?? null, [devices, deviceId]);

  const targets = useMemo(() => normalizeTargets(targetRaw), [targetRaw]);
  const invalidTargets = useMemo(() => targets.filter((item) => !isValidPhone(item)), [targets]);
  const validTargets = useMemo(() => targets.filter((item) => isValidPhone(item)), [targets]);

  const stats = useMemo(() => {
    const today = messages.filter((item) => isToday(item.created_at));
    return {
      total: messages.length,
      today: today.length,
      delivered: messages.filter((item) => isDeliveredStatus(item.status)).length,
      failed: messages.filter((item) => isFailedStatus(item.status)).length,
      processing: messages.filter((item) => isProcessingStatus(item.status)).length,
    };
  }, [messages]);

  const quotaUsed = Math.min(stats.today, DAILY_QUOTA);
  const quotaPercent = Math.round((quotaUsed / DAILY_QUOTA) * 100);
  const quotaFull = stats.today >= DAILY_QUOTA;

  /** Hentikan polling ketika tab tidak aktif agar tidak membebani API. */
  const visible = useRef(true);
  useEffect(() => {
    function onVisibility() {
      visible.current = document.visibilityState === "visible";
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const loadMessages = useCallback(async () => {
    const result = await api<{ messages: Message[] }>(`/messages?limit=${MESSAGE_LIMIT}`);
    setMessages(result.messages);
  }, []);

  const loadSession = useCallback(async (id: string) => {
    if (!id) return;
    const result = await api<SessionStatus>(`/devices/${id}/status`);
    setSession(result);
    setLastSynced(new Date().toISOString());
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const me = await api<Account>("/auth/me");
      setAccount(me);
      const [deviceList, history] = await Promise.all([
        api<Device[]>("/devices"),
        api<{ messages: Message[] }>(`/messages?limit=${MESSAGE_LIMIT}`),
      ]);
      setDevices(deviceList);
      setMessages(history.messages);
      const active = deviceList.find((item) => item.is_active) ?? deviceList[0];
      setDeviceId(active?.id ?? "");
      if (active?.id) {
        await loadSession(active.id).catch(() => setSession(null));
      }
      if (me.role === "admin") {
        const adminUsers = await api<AdminUser[]>("/admin/users");
        setUsers(adminUsers);
      }
      setFatalError(null);
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.isUnauthorized) {
        router.replace("/login");
        return;
      }
      setFatalError(failure instanceof Error ? failure.message : "Dashboard gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [loadSession, router]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(
    async (notify = false) => {
      setRefreshing(true);
      try {
        await loadMessages();
        if (deviceId) await loadSession(deviceId).catch(() => undefined);
        setHistoryError(null);
        if (notify) toast.success("Riwayat diperbarui", "Status terbaru dari gateway sudah ditarik.");
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : "Riwayat gagal diperbarui.";
        setHistoryError(text);
        if (notify) toast.error("Gagal memperbarui", text);
      } finally {
        setRefreshing(false);
      }
    },
    [deviceId, loadMessages, loadSession, toast],
  );

  useEffect(() => {
    if (!account || !autoRefresh) return;
    const timer = window.setInterval(() => {
      if (!visible.current) return;
      void loadMessages()
        .then(() => (deviceId ? loadSession(deviceId).catch(() => undefined) : undefined))
        .catch((failure: unknown) => {
          setHistoryError(failure instanceof Error ? failure.message : "Riwayat gagal diperbarui.");
        });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [account, autoRefresh, deviceId, loadMessages, loadSession]);

  const refreshOne = useCallback(
    async (id: string) => {
      try {
        const result = await api<Message>(`/messages/${id}`);
        setMessages((current) => current.map((item) => (item.id === result.id ? result : item)));
      } catch (failure) {
        toast.error("Gagal menyegarkan pesan", failure instanceof Error ? failure.message : "Coba lagi.");
      }
    },
    [toast],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deviceId) {
      toast.error("Belum ada perangkat", "Hubungkan perangkat WhatsApp terlebih dahulu.");
      return;
    }
    if (validTargets.length === 0) {
      toast.error("Nomor belum valid", "Masukkan minimal satu nomor format internasional, contoh 628123456789.");
      return;
    }
    if (!body.trim()) {
      toast.error("Pesan kosong", "Tulis isi pesan yang mau dikirim.");
      return;
    }

    setSending(true);
    setProgress({ done: 0, total: validTargets.length });
    let accepted = 0;
    let failed = 0;
    let quota = 0;
    try {
      for (const target of validTargets) {
        try {
          const result = await api<SendMessageResponse>("/messages", {
            method: "POST",
            body: JSON.stringify({ device_id: deviceId, target, message: body }),
          });
          accepted += result.messages.length;
          failed += result.messages.filter((item) => isFailedStatus(item.status)).length;
        } catch (failure) {
          failed += 1;
          if (failure instanceof ApiRequestError && failure.status === 429) quota += 1;
        }
        setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
      }

      if (accepted > 0 && failed === 0) {
        toast.success(
          `${accepted} pesan masuk antrean gateway`,
          "Status berikutnya akan menyusul otomatis dari gateway.",
        );
      } else if (accepted > 0) {
        toast.warning(`${accepted} pesan diterima, ${failed} gagal`, "Periksa koneksi perangkat dan kuota harian.");
      } else {
        toast.error("Pesan gagal dikirim", quota > 0 ? "Kuota harian tercapai." : "Periksa koneksi perangkat.");
      }

      if (accepted > 0) setBody("");
      await refresh();
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  async function createApiKey() {
    setCreatingKey(true);
    try {
      const result = await api<{ api_key: string }>("/auth/api-key", { method: "POST" });
      setApiKey(result.api_key);
      toast.success("API key baru dibuat", "Key lama langsung tidak berlaku.");
    } catch (failure) {
      toast.error("API key gagal dibuat", failure instanceof Error ? failure.message : "Coba lagi.");
    } finally {
      setCreatingKey(false);
    }
  }

  async function toggleUser(user: AdminUser) {
    setPendingUser(user.id);
    try {
      await api(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !user.is_active }),
      });
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, is_active: !user.is_active } : item)),
      );
      toast.success(user.is_active ? "Akun dinonaktifkan" : "Akun diaktifkan", user.email);
    } catch (failure) {
      toast.error("Perubahan gagal disimpan", failure instanceof Error ? failure.message : "Coba lagi.");
    } finally {
      setPendingUser(null);
    }
  }

  async function copy(value: string, label: string) {
    const ok = await copyText(value);
    if (ok) toast.success(`${label} disalin`);
    else toast.error("Gagal menyalin", "Salin manual dari kolom teks.");
  }

  const curlSnippet = `curl -X POST "${process.env.NEXT_PUBLIC_API_URL}/api/v1/messages" \\
  -H "Authorization: Bearer $KIRIMWA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"device_id":"${deviceId || "<device-id>"}","target":"628123456789","message":"Halo dari KirimWA"}'`;

  return (
    <AppShell
      email={account?.email ?? "memuat…"}
      role={account?.role ?? "user"}
      banner={
        device && device.connection_status !== "connected" ? (
          <Alert
            tone={device.connection_status === "disconnected" ? "warning" : "info"}
            title="Perangkat WhatsApp belum terhubung"
            icon={<TriangleAlert className="size-4" />}
            action={
              <Button size="sm" variant="outline" onClick={() => router.push("/devices")}>
                <Smartphone className="size-4" />
                Buka koneksi
              </Button>
            }
          >
            Pesan yang dikirim sekarang akan tertahan atau gagal. Hubungkan perangkat lewat halaman Koneksi
            WhatsApp, lalu kirim ulang.
          </Alert>
        ) : null
      }
    >
      <div className="space-y-6">
        {fatalError ? (
          <Alert
            tone="danger"
            title="Dashboard gagal dimuat"
            icon={<TriangleAlert className="size-4" />}
            action={
              <Button size="sm" variant="outline" onClick={() => void bootstrap()}>
                <RefreshCw className="size-4" />
                Coba lagi
              </Button>
            }
          >
            {fatalError}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Ringkasan pengiriman</h1>
            <p className="text-sm text-slate-500">
              Pantau status pesan, kirim pesan uji, dan kelola akses API dari satu halaman.
            </p>
          </div>
          <Button variant="secondary" size="sm" asChild className="gap-2">
            <Link href="/docs">
              <BookOpen className="size-4" />
              Panduan &amp; API
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[92px] rounded-2xl" />)
          ) : (
            <>
              <Metric
                icon={<MessageSquare className="size-5" />}
                label="Pesan (100 terakhir)"
                value={formatNumber(stats.total)}
                hint={`${formatNumber(stats.today)} dikirim hari ini`}
              />
              <Metric
                icon={<CheckCheck className="size-5" />}
                label="Sampai penerima"
                value={formatNumber(stats.delivered)}
                hint="Status Delivered/Read"
                tone="success"
              />
              <Metric
                icon={<Clock3 className="size-5" />}
                label="Masih diproses"
                value={formatNumber(stats.processing)}
                hint="Pending/Processing/Queued"
                tone="info"
              />
              <Metric
                icon={<TriangleAlert className="size-5" />}
                label="Gagal"
                value={formatNumber(stats.failed)}
                hint="Butuh pengecekan"
                tone={stats.failed > 0 ? "danger" : "neutral"}
              />
            </>
          )}
        </div>

        <Card className="shadow-sm">
          <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="size-4 text-emerald-600" />
                Kuota harian
              </CardTitle>
              <CardDescription>
                Batas pengiriman per akun: {formatNumber(DAILY_QUOTA)} pesan/hari. Sisa kuota dihitung dari riwayat
                yang tampil di halaman ini.
              </CardDescription>
            </div>
            <Badge tone={quotaFull ? "danger" : quotaPercent > 80 ? "warning" : "success"}>
              {formatNumber(quotaUsed)} / {formatNumber(DAILY_QUOTA)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  quotaFull ? "bg-rose-500" : quotaPercent > 80 ? "bg-amber-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(quotaPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {quotaFull
                ? "Kuota hari ini sudah terpakai penuh — pengiriman berikutnya berisiko ditolak gateway."
                : `Sisa sekitar ${formatNumber(Math.max(DAILY_QUOTA - quotaUsed, 0))} pesan hari ini.`}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="size-4 text-emerald-600" />
                Kirim pesan
              </CardTitle>
              <CardDescription>
                Satu nomor atau banyak sekaligus — pisahkan dengan koma, spasi, atau baris baru.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={sendMessage}>
                <Field label="Perangkat pengirim" htmlFor="device" hint="Perangkat dengan centang hijau siap dipakai.">
                  <Select
                    id="device"
                    value={deviceId}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDeviceId(next);
                      void loadSession(next).catch(() => setSession(null));
                    }}
                    disabled={devices.length === 0}
                  >
                    {devices.length === 0 ? <option value="">Belum ada perangkat</option> : null}
                    {devices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.device_name} · {item.phone_number || "tanpa nomor"} ({item.connection_status})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Nomor tujuan"
                  htmlFor="target"
                  hint="Format internasional tanpa tanda plus, contoh 628123456789."
                  error={invalidTargets.length > 0 ? `Tidak valid: ${invalidTargets.slice(0, 3).join(", ")}` : null}
                >
                  <Textarea
                    id="target"
                    rows={2}
                    value={targetRaw}
                    onChange={(event) => setTargetRaw(event.target.value)}
                    placeholder="628123456789, 628129876543"
                  />
                </Field>

                {targets.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    {formatNumber(validTargets.length)} nomor siap dikirim
                    {invalidTargets.length > 0 ? `, ${formatNumber(invalidTargets.length)} dilewati` : ""}.
                  </p>
                ) : null}

                <Field
                  label="Isi pesan"
                  htmlFor="body"
                  hint={`${formatNumber(body.length)}/${formatNumber(MESSAGE_LIMIT)} karakter`}
                >
                  <Textarea
                    id="body"
                    rows={5}
                    value={body}
                    onChange={(event) => setBody(event.target.value.slice(0, MESSAGE_LIMIT))}
                    placeholder="Halo, ini pesan uji dari KirimWA."
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={sending || devices.length === 0}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {sending
                      ? progress
                        ? `Mengirim ${progress.done}/${progress.total}…`
                        : "Mengirim…"
                      : validTargets.length > 1
                        ? `Kirim ke ${validTargets.length} nomor`
                        : "Kirim pesan"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTargetRaw("");
                      setBody("");
                    }}
                    disabled={sending || (!targetRaw && !body)}
                  >
                    Bersihkan
                  </Button>
                  <Hint text="Status 'Accepted' berarti gateway sudah menerima pesan. Status 'Delivered' baru muncul setelah perangkat penerima melaporkan penerimaan." />
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-emerald-600" />
                  Status gateway
                </CardTitle>
                <CardDescription>Kondisi perangkat dan cache pesan yang menjawab retry receipt WhatsApp.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {device ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Perangkat</span>
                      <span className="truncate font-medium text-slate-800">{device.device_name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Koneksi</span>
                      <ConnectionBadge status={device.connection_status} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Provider</span>
                      <ProviderBadge provider={device.provider} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Cache pesan</span>
                      <Badge tone={(session?.cached_messages ?? 0) > 0 ? "info" : "neutral"} dot>
                        {formatNumber(session?.cached_messages ?? 0)} pesan
                      </Badge>
                    </div>
                    <Hint text="Cache ini menyimpan pesan terkirim agar gateway bisa menjawab permintaan ulang (retry receipt) WhatsApp. Bila nilainya 0 setelah gateway restart dan penerima menampilkan 'Menunggu pesan ini. Ini mungkin membutuhkan waktu…', kirim ulang pesannya." />
                  </>
                ) : loading ? (
                  <Skeleton className="h-24 rounded-xl" />
                ) : (
                  <EmptyState
                    icon={<Smartphone className="size-5" />}
                    title="Belum ada perangkat"
                    description="Tambahkan dan hubungkan perangkat WhatsApp sebelum mengirim pesan."
                    action={
                      <Button size="sm" onClick={() => router.push("/devices")}>
                        <Plus className="size-4" />
                        Tambah perangkat
                      </Button>
                    }
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void refresh(true)}
                  disabled={refreshing}
                >
                  {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Segarkan status
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4 text-emerald-600" />
                  API key
                </CardTitle>
                <CardDescription>Untuk integrasi aplikasi lain lewat endpoint /api/v1/messages.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    <ShieldCheck className="size-3.5" />
                    {account?.role === "admin" ? "Admin" : "Pengguna"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void createApiKey()}
                    disabled={creatingKey}
                  >
                    {creatingKey ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                    {apiKey ? "Ganti API key" : "Buat API key"}
                  </Button>
                </div>

                {apiKey ? (
                  <Alert tone="success" title="Simpan key ini sekarang — hanya tampil sekali.">
                    <div className="flex items-start gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-lg bg-white/70 px-2 py-1 font-mono text-xs text-slate-800">
                        {apiKey}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => void copy(apiKey, "API key")}>
                        Salin
                      </Button>
                    </div>
                  </Alert>
                ) : (
                  <p className="text-xs text-slate-500">
                    Key lama berupa awalan {users.find((item) => item.email === account?.email)?.api_key_prefix ?? "••••"}
                    … dan tidak bisa ditampilkan penuh lagi.
                  </p>
                )}

                <div className="rounded-xl bg-slate-900 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                      <Terminal className="size-3.5" />
                      Contoh pemakaian
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                      onClick={() => void copy(curlSnippet, "Contoh cURL")}
                    >
                      Salin
                    </Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-200">
                    {curlSnippet}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <MessageHistory
          messages={messages}
          loading={loading}
          refreshing={refreshing}
          error={historyError}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={setAutoRefresh}
          onRefresh={() => void refresh()}
          onRefreshOne={refreshOne}
        />

        {account?.role === "admin" ? (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-emerald-600" />
                Pengguna
              </CardTitle>
              <CardDescription>Aktifkan atau nonaktifkan akun. Akun admin tidak bisa menonaktifkan dirinya sendiri.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {users.length === 0 ? (
                <div className="px-6 pb-6">
                  <EmptyState icon={<Users className="size-5" />} title="Belum ada pengguna lain" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-6 py-2.5 font-medium">Email</th>
                        <th className="px-4 py-2.5 font-medium">Peran</th>
                        <th className="px-4 py-2.5 font-medium">API key</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-6 py-2.5 text-right font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/60">
                          <td className="px-6 py-3">
                            <span className="font-medium text-slate-800">{user.email}</span>
                            {user.email === account?.email ? (
                              <span className="ml-2 text-xs text-slate-400">(Anda)</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={user.role === "admin" ? "info" : "neutral"}>{user.role}</Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {user.api_key_prefix ? `${user.api_key_prefix}…` : "belum dibuat"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={user.is_active ? "success" : "danger"} dot>
                              {user.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void toggleUser(user)}
                              disabled={pendingUser === user.id || user.email === account?.email}
                            >
                              {pendingUser === user.id ? <Loader2 className="size-4 animate-spin" /> : null}
                              {user.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        <p className="flex flex-wrap items-center gap-2 pb-2 text-xs text-slate-400">
          <ExternalLink className="size-3.5" />
          Status terakhir disinkronkan {lastSynced ? formatRelative(lastSynced) : "—"} ·
          riwayat terbaru {formatDateTime(messages[0]?.created_at)} · login sebagai {account?.email ?? "—"}
        </p>
      </div>
    </AppShell>
  );
}
