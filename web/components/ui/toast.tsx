"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-white text-slate-900",
  error: "border-rose-200 bg-white text-slate-900",
  info: "border-sky-200 bg-white text-slate-900",
  warning: "border-amber-200 bg-white text-slate-900",
};

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="size-5 text-emerald-600" />,
  error: <CircleAlert className="size-5 text-rose-600" />,
  info: <Info className="size-5 text-sky-600" />,
  warning: <TriangleAlert className="size-5 text-amber-600" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-3), { id, tone, title, description }]);
      const timeout = tone === "error" ? 9000 : 5000;
      window.setTimeout(() => remove(id), timeout);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push("success", title, description),
      error: (title, description) => push("error", title, description),
      info: (title, description) => push("info", title, description),
      warning: (title, description) => push("warning", title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg shadow-slate-900/5",
              TONE_STYLES[item.tone],
            )}
          >
            <span className="mt-0.5 shrink-0">{TONE_ICON[item.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return context;
}
