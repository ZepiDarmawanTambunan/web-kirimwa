"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog konfirmasi yang bisa dipakai keyboard & pembaca layar:
 * Escape membatalkan, Tab terkurung di dalam dialog, fokus kembali ke elemen
 * pemicu setelah dialog ditutup. Dipakai menggantikan `window.confirm`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const cancelRef = React.useRef(onCancel);
  const titleId = React.useId();
  const descriptionId = React.useId();

  // Simpan handler terbaru tanpa mengulang efek (mencegah fokus "melompat").
  React.useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

  React.useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes?.length) nodes[nodes.length - 1].focus();
      else panelRef.current?.focus();
    }, 30);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] motion-safe:animate-[fade-in_0.15s_ease-out]"
        aria-hidden="true"
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl outline-none motion-safe:animate-[dialog-in_0.16s_ease-out] sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700",
            )}
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="text-sm leading-relaxed text-slate-600">
                {description}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "default"}
            onClick={onConfirm}
            disabled={busy}
            className={cn("w-full sm:w-auto", tone === "danger" && "hover:bg-rose-100")}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}