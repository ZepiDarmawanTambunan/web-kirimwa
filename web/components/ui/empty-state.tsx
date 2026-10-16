import type * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mx-auto max-w-md text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
