"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◈" },
  { href: "/employees", label: "Employees", icon: "❖" },
  { href: "/payroll", label: "Payroll", icon: "₪" },
  { href: "/leave", label: "Leave", icon: "✈" },
  { href: "/loans", label: "Loans & Advances", icon: "◉" },
  { href: "/reports", label: "Compliance Reports", icon: "▤" },
  { href: "/assistant", label: "Zawadi AI", icon: "✦" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] bg-[#0a0d16]/90 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-black text-black shadow-lg shadow-emerald-500/25">
            Z
          </div>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-white">ZawadiHR</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">
              Payroll · Kenya
            </div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-all ${
                  active
                    ? "bg-emerald-400/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.2)]"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                <span className={`text-base ${active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}`}>
                  {item.icon}
                </span>
                {item.label}
                {item.label === "Zawadi AI" && (
                  <span className="ml-auto rounded-full bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-300">
                    AI
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mx-3 mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold text-slate-300">Compliance Engine</div>
          <div className="mt-1.5 space-y-1 text-[10.5px] text-slate-500">
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> KRA PAYE FY 2025/26</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> SHIF 2.75% · NSSF Yr 3</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Housing Levy 1.5%</div>
          </div>
        </div>
        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-black">
              ZT
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-200">Zawadi Technologies</div>
              <div className="text-[10px] text-slate-500">Enterprise · Nairobi</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#0a0d16]/95 px-4 py-3 backdrop-blur-xl md:hidden">
        <span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-black text-black">Z</span>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                ? "bg-emerald-400/15 text-emerald-300"
                : "text-slate-400"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <main className="min-w-0 flex-1 pt-16 md:ml-64 md:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
