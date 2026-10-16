import type * as React from "react";
import { cn } from "@/lib/utils";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
};

export function Alert({
  tone = "info",
  title,
  icon,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", TONES[tone], className)}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
