"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "@/components/PortalShell";
import { Card, PageHeader, Spinner, Select, Th, Td, kes } from "@/components/ui";

interface P9Row {
  period: string; basic: number; benefits: number; nonCash: number; gross: number;
  definedContribution: number; ownerOccupiedInterest: number; taxable: number;
  payeCharged: number; personalRelief: number; insuranceRelief: number; payeDeducted: number;
}
interface P9Data {
  employee: { empNo: string; name: string; kraPin: string | null; nationalId: string | null };
  year: string; months: P9Row[]; totals: Omit<P9Row, "period">;
}

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2].map(String);

export default function PortalP9Page() {
  const router = useRouter();
  const [year, setYear] = useState(String(currentYear));
  const [data, setData] = useState<P9Data | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => {
      if (r.status === 401) return router.push("/portal/login");
    });
    fetch("/api/portal/me").then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setName(`${d.employee.firstName} ${d.employee.lastName}`));
  }, [router]);

  useEffect(() => {
    setData(null);
    fetch(`/api/portal/p9?year=${year}`).then((r) => (r.ok ? r.json() : null)).then(setData);
  }, [year]);

  return (
    <PortalShell employeeName={name}>
      <PageHeader
        title="My P9 Tax Deduction Card"
        subtitle="A statutory summary of your gross pay, deductions and PAYE for the selected year. Covers paid payroll runs only."
        actions={
          <div className="flex items-center gap-3">
            <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-28">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <a
              href={`/api/portal/p9/pdf?year=${year}`}
              className="rounded-lg bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 text-[13px] font-semibold text-black shadow-lg shadow-emerald-500/25 hover:brightness-110"
            >
              Download PDF
            </a>
          </div>
        }
      />

      {!data ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
            <div className="text-sm font-bold text-white">
              {data.employee.name} · {data.employee.empNo}
            </div>
            <div className="text-[12px] text-slate-500">KRA PIN: {data.employee.kraPin || "—"}</div>
          </div>
          {data.months.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500">No paid payroll runs found for {year} yet.</p>
          ) : (
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <Th>Period</Th><Th right>Basic</Th><Th right>Gross</Th>
                  <Th right>NSSF/Pension</Th><Th right>Taxable</Th><Th right>PAYE Charged</Th>
                  <Th right>Reliefs</Th><Th right>PAYE Deducted</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.months.map((r) => (
                  <tr key={r.period} className="hover:bg-white/[0.03]">
                    <Td>{r.period}</Td>
                    <Td right>{kes(r.basic)}</Td>
                    <Td right>{kes(r.gross)}</Td>
                    <Td right>{kes(r.definedContribution)}</Td>
                    <Td right>{kes(r.taxable)}</Td>
                    <Td right>{kes(r.payeCharged)}</Td>
                    <Td right>{kes(r.personalRelief + r.insuranceRelief)}</Td>
                    <Td right className="font-semibold text-emerald-300">{kes(r.payeDeducted)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 font-bold text-white">
                  <Td>TOTAL</Td>
                  <Td right>{kes(data.totals.basic)}</Td>
                  <Td right>{kes(data.totals.gross)}</Td>
                  <Td right>{kes(data.totals.definedContribution)}</Td>
                  <Td right>{kes(data.totals.taxable)}</Td>
                  <Td right>{kes(data.totals.payeCharged)}</Td>
                  <Td right>{kes(data.totals.personalRelief + data.totals.insuranceRelief)}</Td>
                  <Td right className="text-emerald-300">{kes(data.totals.payeDeducted)}</Td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      )}
    </PortalShell>
  );
}
