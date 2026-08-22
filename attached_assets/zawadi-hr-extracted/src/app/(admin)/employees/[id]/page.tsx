"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, PageHeader, Badge, Spinner, Th, Td, kes, kes2 } from "@/components/ui";

/* All money fields below are integer CENTS from the API; leaveBalance and
 * leave days are tenths of a day. The live payslip is computed SERVER-side
 * against the statutory config in force — the client no longer has (and must
 * not have) its own copy of the tax tables. */
interface LivePayslip {
  basic: number; allowances: number; gross: number; taxableIncome: number;
  payeBeforeRelief: number; personalRelief: number; insuranceRelief: number; paye: number;
  nssfEmployee: number; nssfTier1: number; nssfTier2: number; shif: number;
  housingLevyEmployee: number; pension: number; helb: number; loanDeduction: number;
  netPay: number; employerCost: number;
}
interface Detail {
  employee: {
    id: number; empNo: string; firstName: string; lastName: string; email: string; phone: string | null;
    gender: string; nationalId: string | null; kraPin: string | null; nssfNo: string | null; shifNo: string | null;
    bankName: string | null; bankAccount: string | null; position: string; employmentType: string;
    residentStatus: string; hireDate: string; status: string; leaveBalance: number;
  };
  department: { name: string; costCenter: string | null } | null;
  payslips: { payslip: { id: number; gross: number; paye: number; netPay: number }; run: { id: number; name: string; period: string; status: string } }[];
  loans: { id: number; type: string; principal: number; balance: number; monthlyInstallment: number; status: string }[];
  leaves: { id: number; type: string; startDate: string; endDate: string; days: number; status: string }[];
  livePayslip: LivePayslip;
  statutoryConfigName: string;
}

export default function EmployeeProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [resetInfo, setResetInfo] = useState<{ email: string; tempPassword: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch(`/api/employees/${id}`).then((r) => r.json()).then(setData);
  }, [id]);

  const resetPortalPassword = async () => {
    setResetting(true);
    setResetInfo(null);
    try {
      const res = await fetch(`/api/employees/${id}/portal-access`, { method: "POST" });
      const info = await res.json();
      if (res.ok) setResetInfo(info);
    } finally {
      setResetting(false);
    }
  };

  if (!data) return <Spinner />;
  const e = data.employee;

  const live = data.livePayslip;

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between border-b border-white/[0.04] py-2 text-[12.5px] last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-200">{value}</span>
    </div>
  );

  const DedRow = ({ label, value, bold = false, negative = true }: { label: string; value: number; bold?: boolean; negative?: boolean }) => (
    <div className={`flex justify-between py-1.5 text-[12.5px] ${bold ? "border-t border-white/10 pt-2.5 font-bold text-white" : ""}`}>
      <span className={bold ? "" : "text-slate-400"}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-emerald-300" : negative ? "text-rose-300/90" : "text-slate-200"}`}>
        {negative && !bold && value > 0 ? "−" : ""}{kes2(value)}
      </span>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        subtitle={`${e.position} · ${data.department?.name || "Unassigned"} · Joined ${e.hireDate}`}
        actions={<Link href="/employees" className="text-sm text-slate-400 hover:text-white">← All employees</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Profile & Statutory IDs</h3>
            <Badge value={e.status} />
          </div>
          <InfoRow label="Staff No" value={e.empNo} />
          <InfoRow label="Email" value={e.email} />
          <InfoRow label="Phone" value={e.phone || "—"} />
          <InfoRow label="National ID" value={e.nationalId || "—"} />
          <InfoRow label="KRA PIN" value={e.kraPin || "—"} />
          <InfoRow label="NSSF No" value={e.nssfNo || "—"} />
          <InfoRow label="SHIF No" value={e.shifNo || "—"} />
          <InfoRow label="Bank" value={`${e.bankName || "—"} · ${e.bankAccount || ""}`} />
          <InfoRow label="Contract" value={e.employmentType} />
          <InfoRow label="Tax Residency" value={e.residentStatus.replace("_", "-")} />
          <InfoRow label="Leave Balance" value={`${(e.leaveBalance / 10).toFixed(1)} days`} />
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Employee Portal Access</h3>
            <Badge value="portal" />
          </div>
          <p className="text-[12.5px] text-slate-400">
            {e.firstName} logs in at <span className="font-semibold text-slate-200">/portal/login</span> with{" "}
            <span className="font-semibold text-slate-200">{e.email}</span> to apply for leave, upload sick leave
            documents and download their P9.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={resetPortalPassword}
              disabled={resetting}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[12.5px] font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
            >
              {resetting ? "Generating…" : "Reset / Issue Portal Password"}
            </button>
          </div>
          {resetInfo && (
            <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3 text-[12.5px] text-emerald-200">
              Share these credentials with the employee — shown once:{" "}
              <span className="font-mono font-semibold text-white">{resetInfo.email}</span> /{" "}
              <span className="font-mono font-semibold text-white">{resetInfo.tempPassword}</span>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Live Payslip Simulation</h3>
            <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-400/25">
              Computed against {data.statutoryConfigName}
            </span>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Earnings</div>
              <DedRow label="Basic Salary" value={live.basic} negative={false} />
              <DedRow label="Allowances" value={live.allowances} negative={false} />
              <DedRow label="Gross Pay" value={live.gross} bold />
              <div className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">PAYE Computation</div>
              <DedRow label="Taxable Income" value={live.taxableIncome} negative={false} />
              <DedRow label="PAYE before relief" value={live.payeBeforeRelief} negative={false} />
              <DedRow label="Personal Relief" value={live.personalRelief} negative={false} />
              <DedRow label="Insurance Relief" value={live.insuranceRelief} negative={false} />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Deductions</div>
              <DedRow label="PAYE" value={live.paye} />
              <DedRow label={`NSSF (T1 ${kes(live.nssfTier1)} + T2 ${kes(live.nssfTier2)})`} value={live.nssfEmployee} />
              <DedRow label="SHIF" value={live.shif} />
              <DedRow label="Housing Levy" value={live.housingLevyEmployee} />
              <DedRow label="Pension" value={live.pension} />
              <DedRow label="HELB" value={live.helb} />
              <DedRow label="Loan Recoveries" value={live.loanDeduction} />
              <DedRow label="Net Pay" value={live.netPay} bold />
              <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[11.5px] text-slate-400">
                Employer cost: <span className="font-semibold text-slate-200">{kes2(live.employerCost)}</span> · Effective tax rate:{" "}
                <span className="font-semibold text-slate-200">{((live.paye / Math.max(1, live.gross)) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-x-auto lg:col-span-2">
          <div className="px-5 pt-4 pb-2 text-sm font-bold text-white">Payroll History</div>
          {data.payslips.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500">No payslips yet. Run payroll to generate.</p>
          ) : (
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr><Th>Period</Th><Th>Status</Th><Th right>Gross</Th><Th right>PAYE</Th><Th right>Net Pay</Th><Th> </Th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.payslips.map((s) => (
                  <tr key={s.payslip.id} className="hover:bg-white/[0.03]">
                    <Td>{s.run.name}</Td>
                    <Td><Badge value={s.run.status} /></Td>
                    <Td right>{kes(s.payslip.gross)}</Td>
                    <Td right>{kes(s.payslip.paye)}</Td>
                    <Td right><span className="font-semibold text-emerald-300">{kes(s.payslip.netPay)}</span></Td>
                    <Td right><Link href={`/payroll/${s.run.id}`} className="text-[12px] font-semibold text-emerald-300 hover:underline">Open →</Link></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-white">Loans</h3>
            {data.loans.length === 0 ? <p className="text-sm text-slate-500">No loans on record.</p> : data.loans.map((l) => (
              <div key={l.id} className="mb-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="flex justify-between text-[12.5px]">
                  <span className="font-medium capitalize text-slate-200">{l.type} loan</span>
                  <Badge value={l.status} />
                </div>
                <div className="mt-1 text-[11.5px] text-slate-500">Balance {kes(l.balance)} · {kes(l.monthlyInstallment)}/mo</div>
              </div>
            ))}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-white">Leave History</h3>
            {data.leaves.length === 0 ? <p className="text-sm text-slate-500">No leave requests.</p> : data.leaves.map((l) => (
              <div key={l.id} className="mb-2 flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 text-[12px]">
                <div>
                  <span className="font-medium capitalize text-slate-200">{l.type}</span>
                  <span className="ml-2 text-slate-500">{l.startDate} → {l.endDate}</span>
                </div>
                <Badge value={l.status} />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
