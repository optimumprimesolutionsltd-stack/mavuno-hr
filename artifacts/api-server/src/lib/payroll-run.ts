import { and, eq, ne, inArray, isNull, sql } from "drizzle-orm";
import {
  employees, payrollRuns, payslips, loans, loanRepayments, timesheets,
  payAdjustments, organizations, leaveRequests,
} from "@workspace/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { computePayslip, type PayInput } from "./payroll.js";
import { resolveConfig } from "./statutory-resolve.js";
import { writeAudit } from "./audit.js";
import { HttpError } from "./http-error.js";
import type { Principal } from "./session.js";
import type { Cents } from "./money.js";

type Tx = NodePgDatabase<typeof schema>;

function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function payableDays(
  period: string,
  hireDate: string,
  terminationDate: string | null,
  unpaidLeaveDays: number,
): { daysInPeriod: number; daysPayable: number } {
  const total = daysInMonth(period);
  const [y, m] = period.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m - 1, total);

  const hire = new Date(hireDate);
  const term = terminationDate ? new Date(terminationDate) : null;

  const from = hire > start ? hire : start;
  const to = term && term < end ? term : end;

  if (from > to) return { daysInPeriod: total, daysPayable: 0 };

  const served = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return {
    daysInPeriod: total,
    daysPayable: Math.max(0, Math.min(total, served) - unpaidLeaveDays),
  };
}

export async function calculateRun(
  tx: Tx,
  principal: Principal,
  input: { period: string; runType: "regular" | "off_cycle" | "bonus" | "final"; employeeIds?: number[] },
  ip: string | null,
) {
  const { orgId } = principal;

  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new HttpError(404, "Organization not found");

  const { id: configId, config } = await resolveConfig(tx, orgId, org.countryCode, input.period);

  if (input.runType === "regular") {
    const [dupe] = await tx.select({ id: payrollRuns.id }).from(payrollRuns)
      .where(and(
        eq(payrollRuns.orgId, orgId),
        eq(payrollRuns.period, input.period),
        eq(payrollRuns.runType, "regular"),
        ne(payrollRuns.status, "reversed"),
      ));
    if (dupe) throw new HttpError(409, `A regular payroll run for ${input.period} already exists.`, "RUN_EXISTS");
  }

  const staff = await tx.select().from(employees).where(and(
    eq(employees.orgId, orgId),
    ne(employees.status, "terminated"),
    ...(input.employeeIds?.length ? [inArray(employees.id, input.employeeIds)] : []),
  ));
  if (staff.length === 0) throw new HttpError(400, "No employees in scope for this run");

  if (staff.length > org.seatLimit) {
    throw new HttpError(402, `This run covers ${staff.length} employees but your plan allows ${org.seatLimit}. Upgrade to continue.`, "SEAT_LIMIT_EXCEEDED");
  }

  const empIds = staff.map((e) => e.id);

  const sheets = await tx.select().from(timesheets).where(and(
    eq(timesheets.orgId, orgId),
    eq(timesheets.period, input.period),
    inArray(timesheets.employeeId, empIds),
  ));
  const sheetBy = new Map(sheets.filter((s) => s.approvedAt).map((s) => [s.employeeId, s]));

  const adjustments = await tx.select().from(payAdjustments).where(and(
    eq(payAdjustments.orgId, orgId),
    eq(payAdjustments.period, input.period),
    isNull(payAdjustments.consumedByRunId),
    inArray(payAdjustments.employeeId, empIds),
  ));
  const adjBy = new Map<number, { taxable: Cents; nonTaxable: Cents; deduction: Cents }>();
  for (const a of adjustments) {
    const cur = adjBy.get(a.employeeId) ?? { taxable: 0, nonTaxable: 0, deduction: 0 };
    if (a.kind === "earning") {
      if (a.taxable) cur.taxable += a.amount; else cur.nonTaxable += a.amount;
    } else {
      cur.deduction += a.amount;
    }
    adjBy.set(a.employeeId, cur);
  }

  const unpaid = await tx.select().from(leaveRequests).where(and(
    eq(leaveRequests.orgId, orgId),
    eq(leaveRequests.type, "unpaid"),
    eq(leaveRequests.status, "approved"),
    inArray(leaveRequests.employeeId, empIds),
    sql`${leaveRequests.startDate} <= ${input.period + "-" + String(daysInMonth(input.period)).padStart(2, "0")}`,
    sql`${leaveRequests.endDate}   >= ${input.period + "-01"}`,
  ));
  const unpaidBy = new Map<number, number>();
  for (const l of unpaid) {
    unpaidBy.set(l.employeeId, (unpaidBy.get(l.employeeId) ?? 0) + Math.round(l.days / 10));
  }

  const activeLoans = await tx.select().from(loans).where(and(
    eq(loans.orgId, orgId),
    eq(loans.status, "active"),
    inArray(loans.employeeId, empIds),
  ));
  const loanBy = new Map<number, Cents>();
  for (const l of activeLoans) {
    const inst = Math.min(l.monthlyInstallment, l.balance);
    loanBy.set(l.employeeId, (loanBy.get(l.employeeId) ?? 0) + inst);
  }

  const monthName = new Date(`${input.period}-01T00:00:00Z`)
    .toLocaleString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });

  const [run] = await tx.insert(payrollRuns).values({
    orgId,
    period: input.period,
    name: `${monthName} ${input.runType === "regular" ? "Payroll" : input.runType.replace("_", " ")}`,
    runType: input.runType,
    status: "draft",
    statutoryConfigId: configId,
    statutorySnapshot: config,
    createdByUserId: principal.userId,
  }).returning();

  const totals = { gross: 0, net: 0, paye: 0, nssfE: 0, nssfR: 0, shif: 0, ahlE: 0, ahlR: 0, employerCost: 0 };
  const warnings: { empNo: string; warnings: string[] }[] = [];

  const slipRows = staff.map((e) => {
    const ts = sheetBy.get(e.id);
    const adj = adjBy.get(e.id) ?? { taxable: 0, nonTaxable: 0, deduction: 0 };
    const { daysInPeriod, daysPayable } = payableDays(input.period, e.hireDate, e.terminationDate, unpaidBy.get(e.id) ?? 0);

    const pin: PayInput = {
      basicSalary: e.basicSalary, houseAllowance: e.houseAllowance,
      transportAllowance: e.transportAllowance, otherAllowance: e.otherAllowance,
      nonCashBenefit: e.nonCashBenefit, insurancePremium: e.insurancePremium,
      pensionEmployee: e.pensionEmployee, pensionEmployer: e.pensionEmployer,
      mortgageInterest: e.mortgageInterest, helbMonthly: e.helbMonthly,
      saccoMonthly: e.saccoMonthly, loanInstallment: loanBy.get(e.id) ?? 0,
      adjustmentEarningsTaxable: adj.taxable, adjustmentEarningsNonTaxable: adj.nonTaxable,
      adjustmentDeductions: adj.deduction,
      overtimeHours: ts?.overtimeHours ?? 0, holidayHours: ts?.holidayHours ?? 0,
      daysInPeriod,
      daysPayable: e.employmentType === "casual" ? (ts?.daysWorked ?? 0) : daysPayable,
      employmentType: e.employmentType as PayInput["employmentType"],
      residentStatus: e.residentStatus as PayInput["residentStatus"],
      disabilityExemption: e.disabilityExemption,
    };

    const r = computePayslip(pin, config);
    if (r.warnings.length) warnings.push({ empNo: e.empNo, warnings: r.warnings });

    totals.gross += r.gross; totals.net += r.netPay; totals.paye += r.paye;
    totals.nssfE += r.nssfEmployee; totals.nssfR += r.nssfEmployer; totals.shif += r.shif;
    totals.ahlE += r.housingLevyEmployee; totals.ahlR += r.housingLevyEmployer;
    totals.employerCost += r.employerCost;

    return {
      orgId, runId: run.id, employeeId: e.id,
      basic: r.basic, allowances: r.allowances, overtime: r.overtime,
      adjustmentEarnings: r.adjustmentEarnings, nonCashBenefit: r.nonCashBenefit,
      gross: r.gross, cashGross: r.cashGross,
      nssfEmployee: r.nssfEmployee, nssfEmployer: r.nssfEmployer, shif: r.shif,
      housingLevyEmployee: r.housingLevyEmployee, housingLevyEmployer: r.housingLevyEmployer,
      pension: r.pension, pensionEmployer: r.pensionEmployer, mortgageInterest: r.mortgageInterest,
      taxableIncome: r.taxableIncome, payeBeforeRelief: r.payeBeforeRelief,
      personalRelief: r.personalRelief, insuranceRelief: r.insuranceRelief, paye: r.paye,
      helb: r.helb, sacco: r.sacco, loanDeduction: r.loanDeduction,
      adjustmentDeductions: r.adjustmentDeductions, totalDeductions: r.totalDeductions,
      netPay: r.netPay, employerCost: r.employerCost, daysInPeriod,
      daysPayable: pin.daysPayable,
      breakdown: { bands: r.bands, nssfTier1: r.nssfTier1, nssfTier2: r.nssfTier2, warnings: r.warnings },
    };
  });

  await tx.insert(payslips).values(slipRows);

  if (adjustments.length) {
    await tx.update(payAdjustments)
      .set({ consumedByRunId: run.id })
      .where(inArray(payAdjustments.id, adjustments.map((a) => a.id)));
  }

  const [updated] = await tx.update(payrollRuns).set({
    employeeCount: staff.length,
    grossTotal: totals.gross, netTotal: totals.net, payeTotal: totals.paye,
    nssfEmployeeTotal: totals.nssfE, nssfEmployerTotal: totals.nssfR,
    shifTotal: totals.shif,
    housingLevyEmployeeTotal: totals.ahlE, housingLevyEmployerTotal: totals.ahlR,
    employerCostTotal: totals.employerCost,
  }).where(eq(payrollRuns.id, run.id)).returning();

  await writeAudit(tx, {
    orgId, action: "PAYROLL_CALCULATED", entity: "payroll_runs", entityId: run.id,
    detail: `${updated.name}: ${staff.length} employees, gross ${totals.gross / 100}, net ${totals.net / 100}`,
    actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    after: { runId: run.id, ...totals },
  });

  return { run: updated, warnings };
}

export async function recalculateRun(
  tx: Tx,
  principal: Principal,
  runId: number,
  ip: string | null,
) {
  const { orgId } = principal;

  const [run] = await tx.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, orgId)));
  if (!run) throw new HttpError(404, "Payroll run not found");
  if (!["draft", "pending_approval"].includes(run.status)) {
    throw new HttpError(409, `Payroll run in status '${run.status}' cannot be recalculated`);
  }

  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new HttpError(404, "Organization not found");

  const { id: configId, config } = await resolveConfig(tx, orgId, org.countryCode, run.period);

  const staff = await tx.select().from(employees).where(and(
    eq(employees.orgId, orgId),
    ne(employees.status, "terminated"),
  ));
  if (staff.length === 0) throw new HttpError(400, "No employees in scope");

  const empIds = staff.map((e) => e.id);

  const sheets = await tx.select().from(timesheets).where(and(
    eq(timesheets.orgId, orgId),
    eq(timesheets.period, run.period),
    inArray(timesheets.employeeId, empIds),
  ));
  const sheetBy = new Map(sheets.filter((s) => s.approvedAt).map((s) => [s.employeeId, s]));

  const adjustments = await tx.select().from(payAdjustments).where(and(
    eq(payAdjustments.orgId, orgId),
    eq(payAdjustments.period, run.period),
    sql`(${payAdjustments.consumedByRunId} IS NULL OR ${payAdjustments.consumedByRunId} = ${runId})`,
    inArray(payAdjustments.employeeId, empIds),
  ));
  const adjBy = new Map<number, { taxable: Cents; nonTaxable: Cents; deduction: Cents }>();
  for (const a of adjustments) {
    const cur = adjBy.get(a.employeeId) ?? { taxable: 0, nonTaxable: 0, deduction: 0 };
    if (a.kind === "earning") {
      if (a.taxable) cur.taxable += a.amount; else cur.nonTaxable += a.amount;
    } else {
      cur.deduction += a.amount;
    }
    adjBy.set(a.employeeId, cur);
  }

  const unpaid = await tx.select().from(leaveRequests).where(and(
    eq(leaveRequests.orgId, orgId),
    eq(leaveRequests.type, "unpaid"),
    eq(leaveRequests.status, "approved"),
    inArray(leaveRequests.employeeId, empIds),
    sql`${leaveRequests.startDate} <= ${run.period + "-" + String(daysInMonth(run.period)).padStart(2, "0")}`,
    sql`${leaveRequests.endDate}   >= ${run.period + "-01"}`,
  ));
  const unpaidBy = new Map<number, number>();
  for (const l of unpaid) {
    unpaidBy.set(l.employeeId, (unpaidBy.get(l.employeeId) ?? 0) + Math.round(l.days / 10));
  }

  const activeLoans = await tx.select().from(loans).where(and(
    eq(loans.orgId, orgId),
    eq(loans.status, "active"),
    inArray(loans.employeeId, empIds),
  ));
  const loanBy = new Map<number, Cents>();
  for (const l of activeLoans) {
    const inst = Math.min(l.monthlyInstallment, l.balance);
    loanBy.set(l.employeeId, (loanBy.get(l.employeeId) ?? 0) + inst);
  }

  // Delete existing payslips for this run
  await tx.delete(payslips).where(and(eq(payslips.runId, runId), eq(payslips.orgId, orgId)));

  const totals = { gross: 0, net: 0, paye: 0, nssfE: 0, nssfR: 0, shif: 0, ahlE: 0, ahlR: 0, employerCost: 0 };
  const warnings: { empNo: string; warnings: string[] }[] = [];

  const slipRows = staff.map((e) => {
    const ts = sheetBy.get(e.id);
    const adj = adjBy.get(e.id) ?? { taxable: 0, nonTaxable: 0, deduction: 0 };
    const { daysInPeriod, daysPayable } = payableDays(run.period, e.hireDate, e.terminationDate, unpaidBy.get(e.id) ?? 0);

    const pin: PayInput = {
      basicSalary: e.basicSalary, houseAllowance: e.houseAllowance,
      transportAllowance: e.transportAllowance, otherAllowance: e.otherAllowance,
      nonCashBenefit: e.nonCashBenefit, insurancePremium: e.insurancePremium,
      pensionEmployee: e.pensionEmployee, pensionEmployer: e.pensionEmployer,
      mortgageInterest: e.mortgageInterest, helbMonthly: e.helbMonthly,
      saccoMonthly: e.saccoMonthly, loanInstallment: loanBy.get(e.id) ?? 0,
      adjustmentEarningsTaxable: adj.taxable, adjustmentEarningsNonTaxable: adj.nonTaxable,
      adjustmentDeductions: adj.deduction,
      overtimeHours: ts?.overtimeHours ?? 0, holidayHours: ts?.holidayHours ?? 0,
      daysInPeriod,
      daysPayable: e.employmentType === "casual" ? (ts?.daysWorked ?? 0) : daysPayable,
      employmentType: e.employmentType as PayInput["employmentType"],
      residentStatus: e.residentStatus as PayInput["residentStatus"],
      disabilityExemption: e.disabilityExemption,
    };

    const r = computePayslip(pin, config);
    if (r.warnings.length) warnings.push({ empNo: e.empNo, warnings: r.warnings });

    totals.gross += r.gross; totals.net += r.netPay; totals.paye += r.paye;
    totals.nssfE += r.nssfEmployee; totals.nssfR += r.nssfEmployer; totals.shif += r.shif;
    totals.ahlE += r.housingLevyEmployee; totals.ahlR += r.housingLevyEmployer;
    totals.employerCost += r.employerCost;

    return {
      orgId, runId, employeeId: e.id,
      basic: r.basic, allowances: r.allowances, overtime: r.overtime,
      adjustmentEarnings: r.adjustmentEarnings, nonCashBenefit: r.nonCashBenefit,
      gross: r.gross, cashGross: r.cashGross,
      nssfEmployee: r.nssfEmployee, nssfEmployer: r.nssfEmployer, shif: r.shif,
      housingLevyEmployee: r.housingLevyEmployee, housingLevyEmployer: r.housingLevyEmployer,
      pension: r.pension, pensionEmployer: r.pensionEmployer, mortgageInterest: r.mortgageInterest,
      taxableIncome: r.taxableIncome, payeBeforeRelief: r.payeBeforeRelief,
      personalRelief: r.personalRelief, insuranceRelief: r.insuranceRelief, paye: r.paye,
      helb: r.helb, sacco: r.sacco, loanDeduction: r.loanDeduction,
      adjustmentDeductions: r.adjustmentDeductions, totalDeductions: r.totalDeductions,
      netPay: r.netPay, employerCost: r.employerCost, daysInPeriod,
      daysPayable: pin.daysPayable,
      breakdown: { bands: r.bands, nssfTier1: r.nssfTier1, nssfTier2: r.nssfTier2, warnings: r.warnings },
    };
  });

  await tx.insert(payslips).values(slipRows);

  // Re-associate adjustments
  if (adjustments.length) {
    await tx.update(payAdjustments)
      .set({ consumedByRunId: runId })
      .where(inArray(payAdjustments.id, adjustments.map((a) => a.id)));
  }

  const [updated] = await tx.update(payrollRuns).set({
    status: "draft",
    employeeCount: staff.length,
    grossTotal: totals.gross, netTotal: totals.net, payeTotal: totals.paye,
    nssfEmployeeTotal: totals.nssfE, nssfEmployerTotal: totals.nssfR,
    shifTotal: totals.shif,
    housingLevyEmployeeTotal: totals.ahlE, housingLevyEmployerTotal: totals.ahlR,
    employerCostTotal: totals.employerCost,
    statutoryConfigId: configId,
    statutorySnapshot: config,
  }).where(eq(payrollRuns.id, runId)).returning();

  await writeAudit(tx, {
    orgId, action: "PAYROLL_RECALCULATED", entity: "payroll_runs", entityId: runId,
    detail: `Recalculated: ${staff.length} employees, gross ${totals.gross / 100}, net ${totals.net / 100}`,
    actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    after: { runId, ...totals },
  });

  return { run: updated, warnings };
}

export async function applyLoanRepayments(tx: Tx, orgId: number, runId: number) {
  const slips = await tx.select({
    employeeId: payslips.employeeId, loanDeduction: payslips.loanDeduction,
  }).from(payslips).where(and(eq(payslips.orgId, orgId), eq(payslips.runId, runId)));

  for (const slip of slips) {
    let remaining = slip.loanDeduction;
    if (remaining <= 0) continue;

    const empLoans = await tx.select().from(loans).where(and(
      eq(loans.orgId, orgId),
      eq(loans.employeeId, slip.employeeId),
      eq(loans.status, "active"),
    )).orderBy(loans.startDate).for("update");

    for (const l of empLoans) {
      if (remaining <= 0) break;
      const pay = Math.min(l.monthlyInstallment, l.balance, remaining);
      if (pay <= 0) continue;

      const balanceAfter = l.balance - pay;
      const inserted = await tx.insert(loanRepayments).values({
        orgId, loanId: l.id, runId, amount: pay, balanceAfter,
      }).onConflictDoNothing().returning();

      if (inserted.length === 0) continue;

      await tx.update(loans).set({
        balance: balanceAfter,
        status: balanceAfter <= 0 ? "settled" : "active",
      }).where(eq(loans.id, l.id));

      remaining -= pay;
    }
  }
}
