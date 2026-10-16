import type { Metadata } from "next";

import ApiDocs from "@/components/api-docs";

export const metadata: Metadata = {
  title: "Dokumentasi",
  description:
    "Panduan pemakaian dashboard KirimWA dan referensi REST API: autentikasi, perangkat, pengiriman pesan, batas kuota, dan kode error.",
};

export default function DocsPage() {
  return <ApiDocs />;
}
