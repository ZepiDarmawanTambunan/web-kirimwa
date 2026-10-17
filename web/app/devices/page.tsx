"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  TriangleAlert,
  Unplug,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ConnectionBadge, ProviderBadge } from "@/components/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Select } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiRequestError, type Account } from "@/lib/api";
import { providerMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

type Provider = "meta_cloud" | "baileys";
type Device = {
  id: string;
  device_name: string;
  phone_number: string;
  provider: Provider;
  is_active: boolean;
  connection_status: string;
};
type PairingStatus = {
  status: string;
  qr_code: string | null;
  cached_messages?: number | null;
  paired?: boolean | null;
  auto_repairs?: number | null;
  last_close_reason?: string | null;
  last_error?: string | null;
  decrypt_failures?: number | null;
  getmessage_misses?: number | null;
};

/**
 * Status yang berarti perangkat perlu dipindai ulang: kredensialnya sudah
 * ditolak WhatsApp (`logged_out`) atau sesi tidak dapat dipulihkan (`error`).
 */
const NEEDS_QR = ["disconnected", "logged_out", "error", "needs_repair"];

/** Aksi destruktif yang menunggu konfirmasi di dialog (bukan `window.confirm`). */
type PendingAction = { kind: "relink" | "remove"; device: Device } | null;

export default function DevicesPage() {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceName, setDeviceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState<Provider>("meta_cloud");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [pairing, setPairing] = useState<Record<string, PairingStatus>>({});
  /** Device yang sedang menjalani penautan ulang manual (kartunya menampilkan "Menyiapkan QR baru..."). */
  const [relinking, setRelinking] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  /** Galat polling status yang bersifat sementara — ditampilkan terpisah agar tidak menutupi galat formulir. */
  const [pollError, setPollError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    const result = await api<Device[]>("/devices");
    setDevices(result);
  }, []);

  const handleFailure = useCallback(
    (failure: unknown, fallback: string) => {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        router.replace("/login");
        return;
      }
      setError(failure instanceof Error ? failure.message : fallback);
    },
    [router],
  );

  const refresh = useCallback(async () => {
    try {
      await loadDevices();
      setError("");
    } catch (failure) {
      handleFailure(failure, "Daftar device gagal dimuat.");
    }
  }, [handleFailure, loadDevices]);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api<Account>("/auth/me");
        setAccount(me);
      } catch {
        /* Sesi ditangani oleh pemuatan device di bawah. */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    const polling = devices.filter((device) => device.provider === "baileys");
    if (!polling.length) return;

    let cancelled = false;
    async function poll() {
      try {
        const results = await Promise.all(
          polling.map(async (device) => [device.id, await api<PairingStatus>(`/devices/${device.id}/status`)] as const),
        );
        if (cancelled) return;
        setPairing((current) => {
          const next = { ...current };
          for (const [id, status] of results) next[id] = status;
          return next;
        });
        setPollError("");
      } catch (failure) {
        if (cancelled) return;
        setPollError(failure instanceof Error ? failure.message : "Status koneksi gagal diperbarui.");
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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
        toast.info("Koneksi dibuat", "Pindai kode QR yang muncul untuk menautkan perangkat.");
      } else {
        toast.success("Koneksi ditambahkan", `“${device.device_name}” siap dipakai.`);
      }
    } catch (failure) {
      handleFailure(failure, "Gagal menambahkan koneksi.");
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
      toast.info("Menyiapkan QR", "Pindai kode QR dari WhatsApp → Perangkat tertaut.");
    } catch (failure) {
      handleFailure(failure, "Koneksi Baileys gagal dimulai.");
    }
  }

  /**
   * Memaksa penautan ulang: kredensial lokal dihapus di gateway dan WhatsApp
   * mengeluarkan QR baru. Dipakai bila sesi lama sudah tidak dapat dipulihkan
   * supaya pengguna tidak terjebak menunggu status `connecting`.
   */
  async function relink(device: Device) {
    setError("");
    setRelinking((current) => ({ ...current, [device.id]: true }));
    try {
      await api<PairingStatus>(`/devices/${device.id}/reconnect`, { method: "POST" });
      // Gateway menghapus kredensial lalu membuka socket baru; respons pertama bisa
      // masih 'disconnected' (socket lama sedang ditutup). Polling sampai QR baru
      // muncul supaya kartu tidak menampilkan status palsu.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const status = await api<PairingStatus>(`/devices/${device.id}/status`);
        setPairing((current) => ({ ...current, [device.id]: status }));
        if (status.qr_code || status.status === "connected" || status.status === "error") break;
      }
      await loadDevices();
      toast.success("QR baru siap", "Pindai kode QR untuk menautkan kembali perangkat.");
    } catch (failure) {
      handleFailure(failure, "Penautan ulang gagal dijalankan.");
    } finally {
      setRelinking((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });
    }
  }

  async function remove(device: Device) {
    setError("");
    try {
      await api<void>(`/devices/${device.id}`, { method: "DELETE" });
      setDevices((current) => current.filter((entry) => entry.id !== device.id));
      setPairing((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });
      toast.success("Koneksi dihapus", `“${device.device_name}” tidak lagi tersambung.`);
    } catch (failure) {
      handleFailure(failure, "Koneksi gagal dihapus.");
    }
  }

  async function runPending() {
    if (!pending) return;
    const { kind, device } = pending;
    setPending(null);
    setPendingBusy(true);
    try {
      if (kind === "relink") await relink(device);
      else await remove(device);
    } finally {
      setPendingBusy(false);
    }
  }

  return (
    <AppShell email={account?.email ?? "memuat…"} role={account?.role ?? "user"}>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <Smartphone className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Koneksi WhatsApp</h1>
              <p className="text-sm text-slate-500">
                Pilih provider untuk setiap device. Koneksi provider tidak dicampur.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            className="self-start"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Muat ulang
          </Button>
        </header>

        {error ? (
          <Alert tone="danger" title="Terjadi kesalahan" icon={<TriangleAlert className="size-4" />}>
            {error}
          </Alert>
        ) : null}

        <form
          onSubmit={submit}
          className="grid gap-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 md:grid-cols-2"
        >
          <Field label="Nama koneksi" htmlFor="device_name" hint="Nama ini hanya untuk identifikasi di dashboard.">
            <Input
              id="device_name"
              name="device_name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="Contoh: WhatsApp Toko"
              autoComplete="off"
              required
              maxLength={255}
            />
          </Field>
          <Field label="Nomor WhatsApp bisnis" htmlFor="phone_number" hint="Format internasional tanpa tanda +, contoh 628123456789.">
            <Input
              id="phone_number"
              name="phone_number"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="628123456789"
              inputMode="tel"
              autoComplete="off"
              required
              maxLength={32}
            />
          </Field>
          <Field label="Provider" htmlFor="provider" className="md:col-span-2" hint={providerMeta(provider).description}>
            <Select
              id="provider"
              name="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
            >
              <option value="meta_cloud">Meta WhatsApp Cloud API (resmi)</option>
              <option value="baileys">Baileys QR (eksperimental, nonresmi)</option>
            </Select>
          </Field>
          {provider === "meta_cloud" ? (
            <>
              <Field label="Meta Phone Number ID" htmlFor="meta_phone_number_id" className="md:col-span-2" hint="Diambil dari WhatsApp Manager → Nomor telepon.">
                <Input
                  id="meta_phone_number_id"
                  name="meta_phone_number_id"
                  value={phoneNumberId}
                  onChange={(event) => setPhoneNumberId(event.target.value)}
                  placeholder="ID nomor dari WhatsApp Manager"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </Field>
              <Field
                label="Meta access token"
                htmlFor="meta_access_token"
                className="md:col-span-2"
                hint="Dikirim langsung ke backend dan dienkripsi saat disimpan. Tidak ditampilkan kembali."
              >
                <Input
                  id="meta_access_token"
                  name="meta_access_token"
                  type="password"
                  autoComplete="new-password"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  placeholder="Token akses WhatsApp Business Platform"
                  required
                  minLength={20}
                  maxLength={4096}
                />
              </Field>
            </>
          ) : (
            <Alert
              tone="warning"
              className="md:col-span-2"
              icon={<TriangleAlert className="size-4" />}
              title="Provider nonresmi"
            >
              Baileys berkomunikasi memakai protokol WhatsApp Web nonresmi. Ini terpisah dari Meta Cloud API dan
              dapat berisiko bagi stabilitas/kepatuhan akun. Gunakan hanya untuk eksperimen, bukan nomor Meta yang sama.
            </Alert>
          )}
          <Button type="submit" className="w-full md:col-span-2" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {busy ? "Menyimpan…" : "Tambah koneksi"}
          </Button>
        </form>

        <section className="space-y-3" aria-labelledby="daftar-koneksi">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="daftar-koneksi" className="text-base font-semibold tracking-tight text-slate-900">
              Koneksi Anda
            </h2>
            {!loading && devices.length > 0 ? (
              <span className="text-xs text-slate-500">{devices.length} koneksi</span>
            ) : null}
          </div>

          {pollError ? (
            <Alert tone="warning" icon={<TriangleAlert className="size-4" />}>
              {pollError}
            </Alert>
          ) : null}

          <div role="status" aria-live="polite" aria-busy={loading || undefined} className="space-y-3">
            {loading ? (
              <>
                <span className="sr-only">Memuat daftar koneksi WhatsApp…</span>
                <DeviceListSkeleton />
              </>
            ) : devices.length === 0 ? (
              <EmptyState
                icon={<Unplug className="size-5" />}
                title="Belum ada koneksi WhatsApp"
                description="Tambahkan koneksi di formulir atas: pilih Meta Cloud API untuk jalur resmi, atau Baileys untuk menautkan lewat QR."
              />
            ) : (
              devices.map((device) => {
                const liveStatus = pairing[device.id];
                const isRelinking = Boolean(relinking[device.id]);
                const statusText = liveStatus?.status ?? device.connection_status;
                const needsQr = device.provider === "baileys" && NEEDS_QR.includes(statusText);
                const diagnostics = [
                  liveStatus?.last_close_reason
                    ? { label: "Putus terakhir", value: liveStatus.last_close_reason }
                    : null,
                  liveStatus?.last_error ? { label: "Galat terakhir", value: liveStatus.last_error } : null,
                  liveStatus?.auto_repairs ? { label: "Perbaikan otomatis", value: String(liveStatus.auto_repairs) } : null,
                  liveStatus?.cached_messages != null
                    ? { label: "Cache pesan", value: String(liveStatus.cached_messages) }
                    : null,
                ].filter((row): row is { label: string; value: string } => row !== null);

                return (
                  <article
                    key={device.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 sm:text-base">{device.device_name}</h3>
                          <ProviderBadge provider={device.provider} />
                          <ConnectionBadge status={statusText} />
                          {isRelinking ? (
                            <Badge tone="progress" dot pulse>
                              Menyiapkan QR baru…
                            </Badge>
                          ) : needsQr ? (
                            <Badge tone="warning" dot>
                              Perlu QR baru
                            </Badge>
                          ) : null}
                        </div>

                        <p className="font-mono text-xs text-slate-500 sm:text-sm">{device.phone_number}</p>

                        {needsQr && !isRelinking ? (
                          <Alert tone="warning" className="mt-1" icon={<TriangleAlert className="size-4" />}>
                            Sesi ini terputus dan tidak dapat dipulihkan otomatis. Tekan <strong>Tautkan ulang</strong>{" "}
                            untuk menampilkan QR baru, lalu pindai dari WhatsApp → Perangkat tertaut.
                          </Alert>
                        ) : null}

                        {isRelinking ? (
                          <p
                            aria-live="polite"
                            className="mt-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                          >
                            <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
                            <span>
                              Kredensial lama dihapus, menyiapkan QR baru… QR biasanya muncul beberapa detik lagi;
                              biarkan halaman ini terbuka.
                            </span>
                          </p>
                        ) : null}

                        {diagnostics.length > 0 ? (
                          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2 text-xs sm:grid-cols-4">
                            {diagnostics.map((row) => (
                              <div key={row.label} className="min-w-0">
                                <dt className="text-slate-500">{row.label}</dt>
                                <dd className="truncate font-medium text-slate-700" title={row.value}>
                                  {row.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}

                        {device.provider === "baileys" && liveStatus?.qr_code ? (
                          <div className="mt-4 w-fit max-w-full rounded-2xl border border-slate-200 bg-white p-3">
                            <Image
                              src={liveStatus.qr_code}
                              alt={`Kode QR untuk menautkan ${device.device_name}`}
                              width={220}
                              height={220}
                              unoptimized
                              className="h-auto w-[220px] max-w-full"
                            />
                            <p className="mt-2 text-center text-xs text-slate-500">WhatsApp → Perangkat tertaut</p>
                          </div>
                        ) : null}

                        {device.provider === "meta_cloud" ? (
                          <p className="text-xs text-slate-500">
                            Kredensial tersimpan. Pengiriman aktual tetap bergantung pada validitas token dan
                            konfigurasi Meta.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                        {device.provider === "baileys" && (!needsQr || isRelinking) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isRelinking}
                            onClick={() => void reconnect(device)}
                            className="flex-1 sm:flex-none"
                          >
                            {isRelinking ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                            Tampilkan QR
                          </Button>
                        ) : null}
                        {device.provider === "baileys" && needsQr && !isRelinking ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPending({ kind: "relink", device })}
                            className="flex-1 sm:flex-none"
                          >
                            <RefreshCw className="size-4" />
                            Tautkan ulang
                          </Button>
                        ) : null}
                        <Button
                          variant="danger"
                          size="icon"
                          aria-label={`Hapus koneksi ${device.device_name}`}
                          title={`Hapus ${device.device_name}`}
                          onClick={() => setPending({ kind: "remove", device })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === "remove"
            ? `Hapus koneksi “${pending.device.device_name}”?`
            : `Tautkan ulang “${pending?.device.device_name}”?`
        }
        description={
          pending?.kind === "remove"
            ? "Kredensial perangkat dihapus dari gateway. Pesan yang sudah terkirim tidak terpengaruh."
            : "Sesi lama dihapus dan QR baru dibuat. Perangkat lama akan berhenti tersambung sampai QR baru dipindai."
        }
        confirmLabel={pending?.kind === "remove" ? "Hapus koneksi" : "Tautkan ulang"}
        tone={pending?.kind === "remove" ? "danger" : "brand"}
        busy={pendingBusy}
        onCancel={() => {
          if (!pendingBusy) setPending(null);
        }}
        onConfirm={() => void runPending()}
      />
    </AppShell>
  );
}

/** Kerangka kartu koneksi supaya daftar tidak berkedip saat data pertama dimuat. */
function DeviceListSkeleton() {
  return (
    <>
      {[0, 1].map((index) => (
        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32 rounded-xl" />
              <Skeleton className="size-9 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}