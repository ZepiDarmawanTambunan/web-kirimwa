"use client";

import { useMemo, useState } from "react";
import {
  CheckCheck,
  ChevronDown,
  Clipboard,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@/components/ui/controls";
import { StatusBadge } from "@/components/status-badge";
import type { Message } from "@/lib/api";
import { copyText, formatDateTime, formatRelative, truncateMiddle } from "@/lib/format";
import { DAILY_QUOTA, messageStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

type Filter = "all" | "processing" | "sent" | "delivered" | "failed";

const FILTERS: Array<{ key: Filter; label: string; match: (status: string) => boolean }> = [
  { key: "all", label: "Semua", match: () => true },
  {
    key: "processing",
    label: "Diproses",
    match: (status) => messageStatus(status).tone === "progress",
  },
  { key: "sent", label: "Terkirim", match: (status) => ["sent", "read"].includes(messageStatus(status).key) },
  { key: "delivered", label: "Diterima", match: (status) => messageStatus(status).key === "delivered" },
  { key: "failed", label: "Gagal", match: (status) => messageStatus(status).tone === "danger" },
];

/** Keterangan tambahan bila pesan masih berstatus "Terkirim" setelah beberapa menit. */
function stuckHint(message: Message): string | null {
  const meta = messageStatus(message.status);
  if (meta.key !== "sent") return null;
  const age = Date.now() - new Date(message.created_at).getTime();
  if (Number.isNaN(age) || age < 2 * 60_000) return null;
  return "Sudah sampai server WhatsApp, tetapi HP penerima belum mengonfirmasi. Ini normal bila HP penerima sedang offline, notifikasi/muat ulang dimatikan, atau opsi “Laporan dibaca” di HP penerima tidak aktif.";
}

export function MessageHistory({
  messages,
  loading,
  refreshing,
  error,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  onRefreshOne,
}: {
  messages: Message[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  autoRefresh: boolean;
  onToggleAutoRefresh: (next: boolean) => void;
  onRefresh: () => void;
  onRefreshOne: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchFilter = FILTERS.find((item) => item.key === filter)?.match ?? (() => true);
    return messages.filter((message) => {
      if (!matchFilter(message.status)) return false;
      if (!needle) return true;
      return (
        message.target.toLowerCase().includes(needle) ||
        message.body.toLowerCase().includes(needle) ||
        message.id.toLowerCase().includes(needle) ||
        (message.provider_id ?? "").toLowerCase().includes(needle)
      );
    });
  }, [messages, filter, query]);

  const counts = useMemo(() => {
    const summary: Record<Filter, number> = { all: messages.length, processing: 0, sent: 0, delivered: 0, failed: 0 };
    for (const message of messages) {
      for (const item of FILTERS) {
        if (item.key !== "all" && item.match(message.status)) summary[item.key] += 1;
      }
    }
    return summary;
  }, [messages]);

  async function handleCopy(value: string, id: string) {
    if (await copyText(value)) {
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1800);
    }
  }

  async function handleRefreshOne(id: string) {
    setBusyId(id);
    try {
      await onRefreshOne(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-4 text-slate-400" />
              Riwayat pengiriman
              <Hint text={`Menampilkan maksimal 50 pesan terakhir dari gateway. Kuota ${DAILY_QUOTA} pesan per 24 jam per akun.`} />
            </CardTitle>
            <CardDescription>
              Klik <span className="font-medium text-slate-600">Detail</span> untuk melihat isi pesan dan memeriksa status terbaru
              dari provider.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => onToggleAutoRefresh(event.target.checked)}
                className="size-4 accent-emerald-600"
              />
              Perbarui otomatis (10 detik)
            </label>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2">
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              Perbarui
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nomor tujuan, isi pesan, atau ID…"
              aria-label="Cari riwayat pengiriman"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter status pesan">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  filter === item.key
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {item.label}
                <span className="text-[11px] text-slate-400">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert tone="danger" title="Gagal memuat riwayat">{error}</Alert> : null}

        {loading && messages.length === 0 ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-live="polite">
            <span className="sr-only">Memuat riwayat pesan…</span>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Send className="size-5" />}
            title={messages.length === 0 ? "Belum ada pesan terkirim" : "Tidak ada pesan yang cocok"}
            description={
              messages.length === 0
                ? "Kirim pesan pertama Anda melalui formulir di atas. Status tiap pesan akan tercatat di sini."
                : "Coba ubah kata kunci pencarian atau pilih filter status lain."
            }
            action={
              messages.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Reset filter
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Tampilan kartu untuk layar kecil */}
            <ul className="space-y-3 lg:hidden">
              {filtered.map((message) => {
                const hint = stuckHint(message);
                const open = expanded === message.id;
                return (
                  <li key={message.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium text-slate-900">{message.target}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDateTime(message.created_at)} · {formatRelative(message.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={message.status} />
                    </div>
                    <p className={cn("mt-3 text-sm text-slate-700", !open && "line-clamp-2")}>{message.body}</p>
                    {hint ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{hint}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setExpanded(open ? null : message.id)} className="gap-1.5">
                        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
                        {open ? "Tutup" : "Detail"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRefreshOne(message.id)}
                        disabled={busyId === message.id}
                        className="gap-1.5"
                      >
                        {busyId === message.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        Cek status
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(message.id, message.id)} className="gap-1.5">
                        <Clipboard className="size-4" />
                        {copied === message.id ? "Tersalin" : "Salin ID"}
                      </Button>
                    </div>
                    {open ? (
                      <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0">ID pesan</dt>
                          <dd className="font-mono text-slate-700">{message.id}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0">ID WhatsApp</dt>
                          <dd className="break-all font-mono text-slate-700">{message.provider_id ?? "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0">Perangkat</dt>
                          <dd className="font-mono text-slate-700">{message.device_id ? truncateMiddle(message.device_id) : "—"}</dd>
                        </div>
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Tabel untuk layar besar */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 lg:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Riwayat pengiriman pesan WhatsApp</caption>
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Tujuan</th>
                    <th scope="col" className="px-4 py-3 font-medium">Pesan</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Waktu</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((message) => {
                    const hint = stuckHint(message);
                    const open = expanded === message.id;
                    return (
                      <tr key={message.id} className="align-top transition hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-900">{message.target}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(message.target, `target-${message.id}`)}
                              aria-label={`Salin nomor ${message.target}`}
                              className="rounded p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
                            >
                              <Clipboard className="size-3.5" />
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {message.provider_id ? `ID WA ${truncateMiddle(message.provider_id, 10, 6)}` : "Belum ada ID WA"}
                          </p>
                        </td>
                        <td className="max-w-md px-4 py-3">
                          <p className={cn("text-slate-700", !open && "line-clamp-2")}>{message.body}</p>
                          {hint ? (
                            <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900">
                              {hint}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={message.status} />
                          {message.state ? <p className="mt-1 text-xs text-slate-400">state: {message.state}</p> : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          <div className="flex flex-col">
                            <span>{formatDateTime(message.created_at)}</span>
                            <span className="text-xs text-slate-400">{formatRelative(message.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRefreshOne(message.id)}
                              disabled={busyId === message.id}
                              className="gap-1.5"
                              title="Ambil status terbaru dari provider"
                            >
                              {busyId === message.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <CheckCheck className="size-4" />
                              )}
                              Cek
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setExpanded(open ? null : message.id)}>
                              <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
                              {open ? "Tutup" : "Detail"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Menampilkan {filtered.length} dari {messages.length} pesan terakhir
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Badge tone="progress" dot>
                  Diproses
                </Badge>
                <Badge tone="info" dot>
                  Terkirim
                </Badge>
                <Badge tone="success" dot>
                  Diterima / Dibaca
                </Badge>
                <Badge tone="danger" dot>
                  Gagal
                </Badge>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
