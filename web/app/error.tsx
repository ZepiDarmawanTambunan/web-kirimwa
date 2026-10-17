"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100">
          <TriangleAlert className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{error?.message || "Ada masalah saat memuat halaman ini."}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <RotateCcw className="size-4" />
            Coba lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Kembali ke beranda
          </a>
        </div>
      </div>
    </main>
  );
}