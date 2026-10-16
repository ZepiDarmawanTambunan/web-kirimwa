"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Loader2, LogOut, MessageCircleMore, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Beranda", icon: LayoutDashboard },
  { href: "/devices", label: "Koneksi WhatsApp", icon: Smartphone },
];

export function AppShell({
  email,
  role,
  children,
  banner,
}: {
  email: string;
  role: string;
  children: React.ReactNode;
  banner?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
      toast.info("Anda sudah keluar", "Terima kasih, sampai jumpa lagi.");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Gagal keluar", "Coba lagi sebentar lagi.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <MessageCircleMore className="size-5" />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-semibold text-slate-900">KirimWA</span>
              <span className="text-[11px] text-slate-500">Dashboard WhatsApp API</span>
            </span>
          </Link>

          <nav aria-label="Navigasi utama" className="ml-2 flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                    active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:flex">
              <span className="flex size-7 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-semibold text-white">
                {initials(email)}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="max-w-[13rem] truncate text-xs font-medium text-slate-800">{email}</span>
                <span className="text-[11px] text-slate-500">{role === "admin" ? "Administrator" : "Pengguna"}</span>
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} disabled={loggingOut} className="gap-2">
              {loggingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {banner}
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-slate-400 sm:px-6">
        KirimWA · pengiriman WhatsApp melalui Baileys lokal atau Meta Cloud API
      </footer>
    </div>
  );
}
