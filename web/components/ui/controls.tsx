import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-slate-700", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px_16px] bg-[right_0.85rem_center] bg-no-repeat pl-3.5 pr-10 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50",
        checked ? "bg-emerald-600" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-4.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-[1.4rem]",
        )}
      />
    </button>
  );
}

/** Ikon info dengan tooltip ringan (CSS, tanpa dependensi tambahan). */
export function Hint({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("group/hint relative inline-flex", className)}>
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex size-4.5 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100 opacity-0 shadow-lg transition-opacity group-hover/hint:opacity-100 group-focus-within/hint:opacity-100">
        {text}
      </span>
    </span>
  );
}
