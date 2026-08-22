"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, Badge, Button, Input, Label, Modal, Spinner, Th, Td, kes } from "@/components/ui";

/* Money is integer CENTS, exactly as stored. The API returns the run rows
 * verbatim, so NSSF/AHL come split by employee/employer side. */
interface Run {
  id: number; period: string; name: string; status: string; employeeCount: number;
  grossTotal: number; netTotal: number; payeTotal: number;
  nssfEmployeeTotal: number; nssfEmployerTotal: number;
  shifTotal: number; housingLevyEmployeeTotal: number; housingLevyEmployerTotal: number;
  employerCostTotal: number; createdAt: string;
}

export default function PayrollPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch("/api/payroll").then((r) => r.json()).then(setRuns);
  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period }),
    });
    const body = await res.json();
    setRunning(false);
    if (!res.ok) { setError(body.error || "Failed"); return; }
    setResult(`Computed payroll for ${body.run.employeeCount} employees in ${body.durationMs}ms — PAYE, NSSF, SHIF & Housing Levy all reconciled.`);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Payroll Runs"
        subtitle="Draft → Approve → Disburse workflow with full audit trail, rollback, and automatic statutory reconciliation."
        actions={<Button onClick={() => { setOpen(true); setResult(null); setError(null); }}>⚡ Run Payroll</Button>}
      />

      {!runs ? <Spinner /> : runs.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-2xl">₪</div>
          <div>
            <div className="text-lg font-bold text-white">No payroll runs yet</div>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              Process your first payroll — the engine computes PAYE bands, NSSF Tier I/II, SHIF, Housing Levy, HELB and loan recoveries for every employee in milliseconds.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>⚡ Run First Payroll</Button>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr>
                <Th>Run</Th><Th>Status</Th><Th right>Employees</Th><Th right>Gross</Th>
                <Th right>PAYE</Th><Th right>NSSF</Th><Th right>SHIF</Th><Th right>AHL</Th><Th right>Net Pay</Th><Th> </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03]">
                  <Td>
                    <div className="font-medium text-slate-100">{r.name}</div>
                    <div className="text-[11px] text-slate-500">{r.period}</div>
                  </Td>
                  <Td><Badge value={r.status} /></Td>
                  <Td right>{r.employeeCount}</Td>
                  <Td right>{kes(r.grossTotal)}</Td>
                  <Td right>{kes(r.payeTotal)}</Td>
                  <Td right>{kes(r.nssfEmployeeTotal + r.nssfEmployerTotal)}</Td>
                  <Td right>{kes(r.shifTotal)}</Td>
                  <Td right>{kes(r.housingLevyEmployeeTotal + r.housingLevyEmployerTotal)}</Td>
                  <Td right><span className="font-semibold text-emerald-300">{kes(r.netTotal)}</span></Td>
                  <Td right><Link href={`/payroll/${r.id}`} className="text-[12px] font-semibold text-emerald-300 hover:underline">Open →</Link></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Run Payroll">
        <div className="space-y-4">
          <div>
            <Label>Pay Period</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12.5px] leading-relaxed text-slate-400">
            The engine will, for every active employee: compute gross pay → deduct NSSF (Tier I & II), SHIF (2.75%) and Housing Levy (1.5%) as allowable deductions → apply progressive KRA PAYE bands → apply personal & insurance reliefs → recover HELB and loan installments → generate payslips, bank schedule and statutory returns.
          </div>
          {error && <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-300">{error}</div>}
          {result && <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-300">✓ {result}</div>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>{result ? "Close" : "Cancel"}</Button>
            {!result && <Button onClick={run} disabled={running}>{running ? "Calculating…" : "Calculate Payroll"}</Button>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
