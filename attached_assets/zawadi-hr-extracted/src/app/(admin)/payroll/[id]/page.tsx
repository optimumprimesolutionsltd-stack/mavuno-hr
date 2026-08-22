"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, PageHeader, Badge, Button, Modal, Spinner, Th, Td, kes, kes2 } from "@/components/ui";

/* All money is integer CENTS; band rates are basis points (100 bps = 1%). */
interface Slip {
  payslip: {
    id: number; basic: number; allowances: number; gross: number; nssfEmployee: number; shif: number;
    housingLevyEmployee: number; taxableIncome: number; payeBeforeRelief: number; personalRelief: number;
    insuranceRelief: number; paye: number; helb: number; pension: number; loanDeduction: number;
    totalDeductions: number; netPay: number; employerCost: number;
    breakdown: { bands?: { band: string; amount: number; bps: number; tax: number }[]; nssfTier1?: number; nssfTier2?: number } | null;
  };
  employee: { id: number; firstName: string; lastName: string; empNo: string; position: string; kraPin: string | null; bankName: string | null; bankAccount: string | null };
  department: { name: string } | null;
}

interface RunDetail {
  run: {
    id: number; name: string; period: string; status: string; employeeCount: number;
    grossTotal: number; netTotal: number; payeTotal: number;
    nssfEmployeeTotal: number; nssfEmployerTotal: number;
    shifTotal: number; housingLevyEmployeeTotal: number; housingLevyEmployerTotal: number;
    employerCostTotal: number;
  };
  payslips: Slip[];
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<RunDetail | null>(null);
  const [selected, setSelected] = useState<Slip | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetch(`/api/payroll/${id}`).then((r) => r.json()).then(setData), [id]);
  useEffect(() => { load(); }, [load]);

  if (!data || !data.run) return <Spinner />;
  const { run, payslips } = data;

  const act = async (action: string) => {
    setBusy(true);
    const res = await fetch(`/api/payroll/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json();
      /* Surfacing this matters: a 403 here is usually the segregation-of-duties
       * control saying you cannot approve your own run — the user needs to see
       * that, not a silently unchanged page. */
      alert(err.error || "Action failed");
      return;
    }
    load();
  };

  const rollback = async () => {
    if (!confirm("Roll back this draft run? All payslips will be discarded.")) return;
    await fetch(`/api/payroll/${id}`, { method: "DELETE" });
    router.push("/payroll");
  };

  const steps = ["draft", "pending_approval", "approved", "paid"];
  const stepIdx = steps.indexOf(run.status);

  return (
    <div>
      <PageHeader
        title={run.name}
        subtitle={`${run.employeeCount} employees · Period ${run.period} · Total employer cost ${kes(run.employerCostTotal)}`}
        actions={
          <div className="flex items-center gap-3">
            <Link href="/payroll" className="text-sm text-slate-400 hover:text-white">← Runs</Link>
            {run.status === "draft" && <Button variant="danger" onClick={rollback}>Discard Draft</Button>}
            {run.status === "draft" && <Button variant="sky" onClick={() => act("submit")} disabled={busy}>Submit for Approval</Button>}
            {run.status === "pending_approval" && <Button variant="danger" onClick={() => act("reject")} disabled={busy}>Send Back</Button>}
            {run.status === "pending_approval" && <Button variant="sky" onClick={() => act("approve")} disabled={busy}>Approve Run</Button>}
            {run.status === "approved" && <Button onClick={() => act("pay")} disabled={busy}>💸 Disburse Salaries</Button>}
            {run.status === "paid" && <Badge value="paid" />}
          </div>
        }
      />

      <Card className="mb-4 px-5 py-4">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i <= stepIdx ? "bg-emerald-400 text-black" : "bg-white/[0.06] text-slate-500"}`}>
                {i < stepIdx ? "✓" : i + 1}
              </div>
              <span className={`text-[12px] font-semibold capitalize ${i <= stepIdx ? "text-emerald-300" : "text-slate-500"}`}>
                {s === "paid" ? "Disbursed" : s.replace("_", " ")}
              </span>
              {i < steps.length - 1 && <div className={`h-px flex-1 ${i < stepIdx ? "bg-emerald-400/50" : "bg-white/[0.08]"}`} />}
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        {([
          ["Gross", run.grossTotal], ["PAYE → KRA", run.payeTotal],
          ["NSSF", run.nssfEmployeeTotal + run.nssfEmployerTotal],
          ["SHIF → SHA", run.shifTotal],
          ["Housing Levy", run.housingLevyEmployeeTotal + run.housingLevyEmployerTotal],
          ["Net Payout", run.netTotal],
        ] as [string, number][]).map(([label, v]) => (
          <Card key={label} className="px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-1 text-[15px] font-bold tabular-nums text-white">{kes(v)}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-white/[0.06]">
            <tr>
              <Th>Employee</Th><Th right>Gross</Th><Th right>NSSF</Th><Th right>SHIF</Th>
              <Th right>AHL</Th><Th right>PAYE</Th><Th right>Other Deds</Th><Th right>Net Pay</Th><Th> </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {payslips.map((s) => (
              <tr key={s.payslip.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setSelected(s)}>
                <Td>
                  <div className="font-medium text-slate-100">{s.employee.firstName} {s.employee.lastName}</div>
                  <div className="text-[11px] text-slate-500">{s.department?.name || "—"} · {s.employee.empNo}</div>
                </Td>
                <Td right>{kes(s.payslip.gross)}</Td>
                <Td right>{kes(s.payslip.nssfEmployee)}</Td>
                <Td right>{kes(s.payslip.shif)}</Td>
                <Td right>{kes(s.payslip.housingLevyEmployee)}</Td>
                <Td right>{kes(s.payslip.paye)}</Td>
                <Td right>{kes(s.payslip.helb + s.payslip.loanDeduction + s.payslip.pension)}</Td>
                <Td right><span className="font-semibold text-emerald-300">{kes(s.payslip.netPay)}</span></Td>
                <Td right><span className="text-[12px] font-semibold text-emerald-300">Payslip →</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Payslip">
        {selected && (
          <div>
            <div className="mb-5 flex items-start justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div>
                <div className="text-base font-bold text-white">{selected.employee.firstName} {selected.employee.lastName}</div>
                <div className="text-[12px] text-slate-500">{selected.employee.position} · {selected.employee.empNo} · PIN {selected.employee.kraPin || "—"}</div>
                <div className="text-[12px] text-slate-500">{selected.employee.bankName} · {selected.employee.bankAccount}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{run.name}</div>
                <div className="text-lg font-bold text-emerald-300">{kes2(selected.payslip.netPay)}</div>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Earnings</div>
                {([["Basic Pay", selected.payslip.basic], ["Allowances", selected.payslip.allowances], ["Gross Pay", selected.payslip.gross]] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-white/[0.04] py-2 text-[12.5px]">
                    <span className="text-slate-400">{l}</span><span className="tabular-nums font-medium text-slate-200">{kes2(v)}</span>
                  </div>
                ))}
                <div className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">PAYE Band Workings</div>
                {(selected.payslip.breakdown?.bands || []).map((b, i) => (
                  <div key={i} className="flex justify-between py-1 text-[11.5px] text-slate-500">
                    <span>{b.band} @ {(b.bps / 100).toFixed(1)}%</span>
                    <span className="tabular-nums">{kes2(b.tax)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/[0.06] py-2 text-[12px]">
                  <span className="text-slate-400">Less reliefs</span>
                  <span className="tabular-nums text-slate-300">−{kes2(selected.payslip.personalRelief + selected.payslip.insuranceRelief)}</span>
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Deductions</div>
                {([
                  ["PAYE", selected.payslip.paye], ["NSSF", selected.payslip.nssfEmployee], ["SHIF", selected.payslip.shif],
                  ["Housing Levy", selected.payslip.housingLevyEmployee], ["Pension", selected.payslip.pension],
                  ["HELB", selected.payslip.helb], ["Loans", selected.payslip.loanDeduction],
                ] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-white/[0.04] py-2 text-[12.5px]">
                    <span className="text-slate-400">{l}</span><span className="tabular-nums text-rose-300/90">−{kes2(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 text-[13px] font-bold">
                  <span className="text-white">Total Deductions</span>
                  <span className="tabular-nums text-rose-300">−{kes2(selected.payslip.totalDeductions)}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-emerald-400/10 px-3 py-2.5 text-[14px] font-bold">
                  <span className="text-white">Net Pay</span>
                  <span className="tabular-nums text-emerald-300">{kes2(selected.payslip.netPay)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
