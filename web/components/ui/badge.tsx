import type * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  progress: "bg-amber-50 text-amber-700 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-orange-50 text-orange-700 ring-orange-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
};

const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  progress: "bg-amber-500",
  success: "bg-emerald-500",
  warning: "bg-orange-500",
  danger: "bg-rose-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean; pulse?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT_TONES[tone], pulse && "animate-pulse")} />
      ) : null}
      {children}
    </span>
  );
}
