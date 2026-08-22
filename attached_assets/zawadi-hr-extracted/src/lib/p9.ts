import { and, eq, like } from "drizzle-orm";
import { payslips, payrollRuns, employees } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import type { Cents } from "@/lib/money";

/**
 * P9A — the annual tax deduction card an employee needs to file their own
 * return. All amounts in cents; the caller formats.
 *
 * Only PAID runs count. A draft or reversed run must never appear on a P9:
 * it would show tax that was never actually remitted to KRA.
 */
export interface P9Row {
  period: string;
  basic: Cents;
  benefits: Cents;
  nonCash: Cents;
  gross: Cents;
  definedContribution: Cents;   // NSSF + registered pension
  ownerOccupiedInterest: Cents;
  taxable: Cents;
  payeCharged: Cents;
  personalRelief: Cents;
  insuranceRelief: Cents;
  payeDeducted: Cents;
}

export async function getEmployeeP9(tx: Tx, orgId: number, employeeId: number, year: string) {
  const [emp] = await tx.select().from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.orgId, orgId)));
  if (!emp) return null;

  const rows = await tx
    .select({ p: payslips, run: payrollRuns })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
    .where(and(
      eq(payslips.orgId, orgId),
      eq(payslips.employeeId, employeeId),
      like(payrollRuns.period, `${year}%`),
      eq(payrollRuns.status, "paid"),   // only what was actually paid and remitted
    ));

  rows.sort((a, b) => a.run.period.localeCompare(b.run.period));

  const table: P9Row[] = rows.map(({ p, run }) => ({
    period: run.period,
    basic: p.basic,
    benefits: p.allowances + p.overtime + p.adjustmentEarnings,
    nonCash: p.nonCashBenefit,
    gross: p.gross,
    definedContribution: p.nssfEmployee + p.pension,
    ownerOccupiedInterest: p.mortgageInterest,
    taxable: p.taxableIncome,
    payeCharged: p.payeBeforeRelief,
    personalRelief: p.personalRelief,
    insuranceRelief: p.insuranceRelief,
    payeDeducted: p.paye,
  }));

  const zero: Omit<P9Row, "period"> = {
    basic: 0, benefits: 0, nonCash: 0, gross: 0, definedContribution: 0,
    ownerOccupiedInterest: 0, taxable: 0, payeCharged: 0,
    personalRelief: 0, insuranceRelief: 0, payeDeducted: 0,
  };

  const totals = table.reduce<Omit<P9Row, "period">>((a, r) => ({
    basic: a.basic + r.basic,
    benefits: a.benefits + r.benefits,
    nonCash: a.nonCash + r.nonCash,
    gross: a.gross + r.gross,
    definedContribution: a.definedContribution + r.definedContribution,
    ownerOccupiedInterest: a.ownerOccupiedInterest + r.ownerOccupiedInterest,
    taxable: a.taxable + r.taxable,
    payeCharged: a.payeCharged + r.payeCharged,
    personalRelief: a.personalRelief + r.personalRelief,
    insuranceRelief: a.insuranceRelief + r.insuranceRelief,
    payeDeducted: a.payeDeducted + r.payeDeducted,
  }), zero);

  return {
    employee: {
      empNo: emp.empNo,
      name: `${emp.firstName} ${emp.lastName}`,
      kraPin: emp.kraPin,
      nationalId: emp.nationalId,
    },
    year,
    months: table,
    totals,
  };
}
