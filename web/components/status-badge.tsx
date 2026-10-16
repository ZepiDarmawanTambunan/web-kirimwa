"use client";

import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/controls";
import { connectionStatus, messageStatus, providerMeta } from "@/lib/status";

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = messageStatus(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={meta.tone} dot pulse={meta.tone === "progress"} className={className}>
        {meta.label}
      </Badge>
      {meta.hint ? <Hint text={meta.hint} /> : null}
    </span>
  );
}

export function ConnectionBadge({ status }: { status: string | null | undefined }) {
  const meta = connectionStatus(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={meta.tone} dot pulse={meta.tone === "progress"}>
        {meta.label}
      </Badge>
      <Hint text={meta.hint} />
    </span>
  );
}

export function ProviderBadge({ provider }: { provider: string | null | undefined }) {
  const meta = providerMeta(provider);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={meta.key === "baileys" ? "info" : meta.key === "meta_cloud" ? "success" : "neutral"}>
        {meta.label}
      </Badge>
      <Hint text={meta.description} />
    </span>
  );
}
