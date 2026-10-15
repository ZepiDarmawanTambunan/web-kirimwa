export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-6xl font-bold text-emerald-700">404</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-slate-500">Alamat yang Anda tuju tidak ada di workspace ini.</p>
        <a href="/" className="mt-5 inline-block rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800">Kembali ke beranda</a>
      </div>
    </main>
  );
}
