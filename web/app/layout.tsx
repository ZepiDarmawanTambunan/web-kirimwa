import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KirimWA — WhatsApp API",
  description: "Dashboard pengiriman WhatsApp mandiri dengan Baileys lokal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
