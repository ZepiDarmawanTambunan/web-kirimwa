import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
          <Compass className="size-6" />
        </span>
        <p className="mt-4 text-sm font-semibold tracking-[0.2em] text-emerald-700">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Alamat yang Anda tuju tidak ada di workspace ini. Periksa kembali tautannya atau kembali ke dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Ke dashboard
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Buka dokumentasi
          </Link>
        </div>
      </div>
    </main>
  );
}