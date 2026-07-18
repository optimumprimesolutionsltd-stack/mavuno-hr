"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader, Select, Spinner, Th, Td, Button } from "@/components/ui";

const TYPES = [
  { key: "paye", label: "PAYE (P10)", desc: "KRA iTax-ready PAYE return" },
  { key: "p9", label: "P9 Summary", desc: "Tax deduction cards" },
  { key: "nssf", label: "NSSF Return", desc: "Tier I & II contributions" },
  { key: "shif", label: "SHIF Return", desc: "Social Health Insurance Fund" },
  { key: "housing", label: "Housing Levy", desc: "AHL employee + employer" },
  { key: "bank", label: "Bank Schedule", desc: "Net pay credit transfers" },
  { key: "journal", label: "GL Journal", desc: "Double-entry payroll posting" },
];

interface Report {
  title: string;
  run: { id: number; name: string; period: string };
  columns: string[];
  rows: (string | number)[][];
  totals: (string | number)[];
  error?: string;
}

interface Run { id: number; name: string; period: string }

export default function ReportsPage() {
  const [type, setType] = useState("paye");
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string>("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payroll").then((r) => r.json()).then((rs: Run[]) => {
      setRuns(rs);
      if (rs.length > 0) setRunId(String(rs[0].id));
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/reports?type=${type}${runId ? `&runId=${runId}` : ""}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) { setError(body.error); setReport(null); return; }
    setReport(body);
  }, [type, runId]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!report) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [report.columns.map(esc).join(","), ...report.rows.map((r) => r.map(esc).join(",")), report.totals.map(esc).join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type}-${report.run.period}.csv`;
    a.click();
  };

  const fmtCell = (v: string | number) => (typeof v === "number" ? v.toLocaleString("en-KE", { maximumFractionDigits: 2 }) : v);

  return (
    <div>
      <PageHeader
        title="Compliance Reports"
        subtitle="Statutory returns generated straight from the payroll ledger — iTax, NSSF portal, SHA portal and bank-upload ready."
        actions={<Button variant="ghost" onClick={exportCSV} disabled={!report}>⬇ Export CSV</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`rounded-xl border px-3 py-3 text-left transition-all ${
              type === t.key
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <div className={`text-[12px] font-bold ${type === t.key ? "text-emerald-300" : "text-slate-200"}`}>{t.label}</div>
            <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{t.desc}</div>
          </button>
        ))}
      </div>

      {runs.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Select value={runId} onChange={(e) => setRunId(e.target.value)}>
            {runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
      )}

      {loading ? <Spinner /> : error ? (
        <Card className="p-10 text-center">
          <div className="text-lg font-bold text-white">No data yet</div>
          <p className="mt-1 text-sm text-slate-400">{error}</p>
        </Card>
      ) : report ? (
        <Card className="overflow-x-auto">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <div className="text-sm font-bold text-white">{report.title}</div>
            <div className="text-[11px] text-slate-500">Zawadi Technologies Ltd · Employer PIN P051234567X · Generated {new Date().toLocaleDateString("en-KE")}</div>
          </div>
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr>{report.columns.map((c, i) => <Th key={c} right={typeof report.rows[0]?.[i] === "number"}>{c}</Th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {report.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-white/[0.03]">
                  {row.map((cell, ci) => (
                    <Td key={ci} right={typeof cell === "number"}>
                      <span className={typeof cell === "number" ? "tabular-nums text-slate-200" : "text-slate-300"}>{fmtCell(cell)}</span>
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-white/[0.1] bg-white/[0.02]">
              <tr>
                {report.totals.map((t, i) => (
                  <Td key={i} right={typeof t === "number"}>
                    <span className="font-bold tabular-nums text-emerald-300">{i === 0 && t === "" ? "TOTALS" : fmtCell(t)}</span>
                  </Td>
                ))}
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
