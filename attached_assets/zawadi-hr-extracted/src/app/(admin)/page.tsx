"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Card, PageHeader, Stat, Spinner, Badge, kes } from "@/components/ui";

interface Dash {
  headcount: number;
  genderRatio: { female: number; male: number };
  monthlyGross: number;
  avgCostPerEmployee: number;
  pendingLeaveCount: number;
  pendingLeaves: { leave: { id: number; type: string; days: number }; employee: { firstName: string; lastName: string } }[];
  activeLoanCount: number;
  loanBalance: number;
  latestRun: { name: string; status: string; netTotal: number; id: number } | null;
  runs: { period: string; gross: number; net: number; paye: number; nssf: number; shif: number; housingLevy: number }[];
  deptCosts: { name: string; gross: number; count: number }[];
  salaryBuckets: { label: string; count: number }[];
  auditLogs: { id: number; action: string; detail: string | null; createdAt: string }[];
}

const COLORS = ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185", "#2dd4bf"];

const tooltipStyle = {
  backgroundColor: "#0c101a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#e2e8f0",
};

export default function Dashboard() {
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <Spinner />;

  /* n is integer cents. */
  const compact = (c: number) => { const n = c / 100; return `KSh ${n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : (n / 1e3).toFixed(0) + "K"}`; };

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Real-time workforce intelligence for Zawadi Technologies Ltd — statutory rates auto-synced with KRA, SHA, NSSF & the State Department for Housing."
        actions={
          <Link href="/payroll" className="rounded-lg bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 text-[13px] font-semibold text-black shadow-lg shadow-emerald-500/25 hover:brightness-110">
            Run Payroll →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active Headcount" value={String(data.headcount)} hint={`${data.genderRatio.female}F / ${data.genderRatio.male}M · ${Math.round((data.genderRatio.female / Math.max(1, data.headcount)) * 100)}% female`} accent="emerald" />
        <Stat label="Monthly Gross Commitment" value={compact(data.monthlyGross)} hint={`Avg ${compact(data.avgCostPerEmployee)} / employee`} accent="sky" />
        <Stat label="Pending Approvals" value={String(data.pendingLeaveCount)} hint="Leave requests awaiting action" accent="amber" />
        <Stat label="Outstanding Loans" value={compact(data.loanBalance)} hint={`${data.activeLoanCount} active facilities`} accent="violet" />
      </div>

      {data.latestRun && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 border-emerald-400/15 bg-emerald-400/[0.04] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">₪</span>
            <div>
              <div className="text-sm font-semibold text-white">{data.latestRun.name}</div>
              <div className="text-xs text-slate-400">Net payout {kes(data.latestRun.netTotal)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge value={data.latestRun.status} />
            <Link href={`/payroll/${data.latestRun.id}`} className="text-xs font-semibold text-emerald-300 hover:underline">View run →</Link>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Payroll Trend</h3>
            <span className="text-[11px] text-slate-500">Gross vs Net vs PAYE by period</span>
          </div>
          {data.runs.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-slate-500">
              No payroll runs yet — process your first payroll to see trends.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.runs}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="period" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1e8).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => kes(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="gross" name="Gross" stroke="#34d399" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="net" name="Net" stroke="#38bdf8" fill="url(#g2)" strokeWidth={2} />
                <Area type="monotone" dataKey="paye" name="PAYE" stroke="#fbbf24" fill="none" strokeWidth={2} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Department Cost Split</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.deptCosts} dataKey="gross" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                {data.deptCosts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => kes(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5">
            {data.deptCosts.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-[11.5px]">
                <span className="flex items-center gap-2 text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {d.name} · {d.count}
                </span>
                <span className="tabular-nums font-medium text-slate-300">{compact(d.gross)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Salary Distribution</h3>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={data.salaryBuckets}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke="#475569" fontSize={10.5} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Employees" fill="#a78bfa" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-white">Pending Leave Approvals</h3>
          {data.pendingLeaves.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">All caught up ✓</p>
          ) : (
            <div className="space-y-2.5">
              {data.pendingLeaves.map((l) => (
                <div key={l.leave.id} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium text-slate-200">{l.employee.firstName} {l.employee.lastName}</div>
                    <div className="text-[11px] capitalize text-slate-500">{l.leave.type} · {(l.leave.days / 10).toFixed(1)} days</div>
                  </div>
                  <Link href="/leave" className="text-[11px] font-semibold text-emerald-300 hover:underline">Review →</Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-white">Audit Trail</h3>
          <div className="space-y-2.5">
            {data.auditLogs.map((log) => (
              <div key={log.id} className="flex gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{log.action.replace(/_/g, " ")}</div>
                  <div className="truncate text-[11.5px] text-slate-500">{log.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
