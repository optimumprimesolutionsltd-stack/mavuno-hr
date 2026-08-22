"use client";

import type { ReactNode } from "react";

export { kes, kes2 } from "@/lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  draft: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  approved: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  paid: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  active: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  pending: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  rejected: "bg-rose-400/10 text-rose-300 ring-rose-400/25",
  settled: "bg-slate-400/10 text-slate-300 ring-slate-400/25",
  terminated: "bg-rose-400/10 text-rose-300 ring-rose-400/25",
  on_leave: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  permanent: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  contract: "bg-violet-400/10 text-violet-300 ring-violet-400/25",
  casual: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
};

export function Badge({ value }: { value: string }) {
  const cls = badgeColors[value] || "bg-slate-400/10 text-slate-300 ring-slate-400/25";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ${cls}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export function Stat({ label, value, hint, accent = "emerald" }: { label: string; value: string; hint?: string; accent?: string }) {
  const accents: Record<string, string> = {
    emerald: "from-emerald-400/15 to-transparent text-emerald-300",
    sky: "from-sky-400/15 to-transparent text-sky-300",
    violet: "from-violet-400/15 to-transparent text-violet-300",
    amber: "from-amber-400/15 to-transparent text-amber-300",
    rose: "from-rose-400/15 to-transparent text-rose-300",
  };
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accents[accent]?.split(" ").slice(0, 2).join(" ")}`} />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="mt-2 text-[22px] font-bold tracking-tight text-white">{value}</div>
        {hint && <div className={`mt-1 text-[11.5px] font-medium ${accents[accent]?.split(" ").pop()}`}>{hint}</div>}
      </div>
    </Card>
  );
}

export function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function Td({ children, right = false, className = "" }: { children: ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-[13px] ${right ? "text-right tabular-nums" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "sky";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants = {
    primary:
      "bg-gradient-to-r from-emerald-400 to-teal-500 text-black shadow-lg shadow-emerald-500/25 hover:brightness-110",
    sky: "bg-gradient-to-r from-sky-400 to-blue-500 text-black shadow-lg shadow-sky-500/25 hover:brightness-110",
    ghost: "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
    danger: "border border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-emerald-400/50 focus:bg-white/[0.06] ${props.className || ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-white/10 bg-[#11151f] px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-400/50 ${props.className || ""}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</label>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0c101a] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
    </div>
  );
}
