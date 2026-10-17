import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: {
    default: "KirimWA — Dashboard WhatsApp API",
    template: "%s · KirimWA",
  },
  description:
    "Dashboard pengiriman WhatsApp mandiri: kirim pesan, pantau status pengantaran, dan kelola koneksi Baileys lokal atau Meta Cloud API.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#047857",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>
        {/* Toast dipasang di root supaya bisa dipakai semua halaman (dashboard, koneksi, dsb.). */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
