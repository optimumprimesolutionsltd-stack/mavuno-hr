"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/portal", label: "Dashboard", icon: "◈" },
  { href: "/portal/leave", label: "Leave", icon: "✈" },
  { href: "/portal/loans", label: "Loans", icon: "◎" },
  { href: "/portal/p9", label: "My P9", icon: "▤" },
];

export default function PortalShell({
  employeeName,
  children,
}: {
  employeeName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/portal/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-[#0a0d16]/90 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-black text-black shadow-lg shadow-emerald-500/25">
            Z
          </div>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-white">ZawadiHR</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">Employee Portal</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-all ${
                  active
                    ? "bg-emerald-400/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.2)]"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                <span className={active ? "text-emerald-400" : "text-slate-500"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="mb-3 truncate text-xs font-semibold text-slate-200">{employeeName}</div>
          <button
            onClick={logout}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12.5px] font-semibold text-slate-300 hover:bg-white/[0.08]"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0a0d16]/95 px-4 py-3 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-black text-black">Z</span>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                (item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href))
                  ? "bg-emerald-400/15 text-emerald-300"
                  : "text-slate-400"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <button onClick={logout} className="shrink-0 text-xs font-semibold text-slate-400">Log out</button>
      </div>

      <main className="min-w-0 flex-1 pt-16 md:ml-60 md:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
