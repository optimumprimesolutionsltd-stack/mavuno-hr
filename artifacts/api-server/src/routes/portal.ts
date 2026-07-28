import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { employees, leaveRequests, loans, loanRequests, loanRepayments, payslips, payrollRuns, organizations } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { computeLoanFringeBenefitTax } from "../lib/payroll.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { fullName } from "../lib/employee-name.js";

const router = Router();

function requireEmployee(req: any): number {
  const p = (req as AuthRequest).principal;
  if (!p.employeeId) throw new HttpError(403, "No employee profile linked to this account");
  return p.employeeId;
}

router.get("/me", requireAuth("self:read"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, empId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee profile not found" }); return; }

    // Recent payslips — flatten to what the component expects
    const slipRows = await db.select({ slip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.employeeId, empId), eq(payslips.orgId, p.orgId)))
      .orderBy(desc(payrollRuns.period))
      .limit(12);

    const flatSlips = slipRows.map(r => ({
      period: r.run.period,
      grossPay: r.slip.gross,
      paye: r.slip.paye,
      nssfEmployee: r.slip.nssfEmployee,
      shif: r.slip.shif,
      housingLevyEmployee: r.slip.housingLevyEmployee,
      netPay: r.slip.netPay,
    }));

    // Leave balance: entitlement from employee record minus approved annual leave taken this year
    const thisYear = new Date().getFullYear().toString();
    const takenLeaves = await db
      .select({ days: leaveRequests.days, startDate: leaveRequests.startDate })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, empId),
        eq(leaveRequests.orgId, p.orgId),
        eq(leaveRequests.status, "approved"),
        eq(leaveRequests.type, "annual"),
      ));
    const takenDays = takenLeaves
      .filter(l => l.startDate?.startsWith(thisYear))
      .reduce((acc, l) => acc + Math.round((l.days ?? 0) / 10), 0);
    const entitled = Math.round((emp.leaveBalance ?? 210) / 10);
    const remaining = Math.max(0, entitled - takenDays);

    res.json({
      employee: emp,
      payslips: flatSlips,
      leaveBalance: remaining,
      leaveBalanceSummary: { entitled, taken: takenDays, remaining },
    });
  } catch (err) { next(err); }
});

router.get("/leave", requireAuth("self:read"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const [empRow] = await db
      .select({ leaveBalance: employees.leaveBalance })
      .from(employees)
      .where(and(eq(employees.id, empId), eq(employees.orgId, p.orgId)))
      .limit(1);
    const entitlement = Math.round(((empRow?.leaveBalance) ?? 210) / 10);

    const leaves = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.employeeId, empId), eq(leaveRequests.orgId, p.orgId)))
      .orderBy(desc(leaveRequests.createdAt));

    // Compute balanceAfter for approved annual leaves in the current year
    const thisYear = new Date().getFullYear().toString();
    const approvedAnnual = leaves
      .filter(l => l.type === "annual" && l.status === "approved" && l.startDate?.startsWith(thisYear))
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    let running = entitlement;
    const balanceAfterMap: Record<number, number> = {};
    for (const l of approvedAnnual) {
      running = Math.max(0, running - Math.round((l.days ?? 0) / 10));
      balanceAfterMap[l.id] = running;
    }

    const result = leaves.map(l => ({
      ...l,
      balanceAfter:
        l.type === "annual" && l.status === "approved" && l.startDate?.startsWith(thisYear)
          ? (balanceAfterMap[l.id] ?? null)
          : null,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leaveSchema = z.object({
  type: z.enum(["annual","sick","maternity","paternity","compassionate","study","unpaid"]),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().max(500).optional(),
}).refine((l) => l.endDate >= l.startDate, { message: "End date must be on or after start date", path: ["endDate"] });

// Kenya public holidays (fixed + Easter 2024-2030)
function kenyaHolidays(year: number): Set<string> {
  const fixed = [
    `${year}-01-01`, // New Year's Day
    `${year}-05-01`, // Labour Day
    `${year}-06-01`, // Madaraka Day
    `${year}-10-20`, // Mashujaa Day
    `${year}-12-12`, // Jamhuri Day
    `${year}-12-25`, // Christmas Day
    `${year}-12-26`, // Boxing Day
  ];
  // Easter Good Friday + Easter Monday (pre-computed 2024-2030)
  const easter: Record<number, [string, string]> = {
    2024: ["2024-03-29", "2024-04-01"],
    2025: ["2025-04-18", "2025-04-21"],
    2026: ["2026-04-03", "2026-04-06"],
    2027: ["2027-03-26", "2027-03-29"],
    2028: ["2028-04-14", "2028-04-17"],
    2029: ["2029-03-30", "2029-04-02"],
    2030: ["2030-04-19", "2030-04-22"],
  };
  return new Set([...fixed, ...(easter[year] ?? [])]);
}

function countLeaveDays(
  startDate: string, endDate: string,
  workDaysPerWeek: number, worksOnHolidays: boolean
): number {
  const s = new Date(startDate), e = new Date(endDate);
  let days = 0;
  const cur = new Date(s);
  // Pre-build holiday sets for the years spanned
  const holidaySets: Record<number, Set<string>> = {};
  while (cur <= e) {
    const yr = cur.getFullYear();
    const dow = cur.getDay();
    const dateStr = cur.toISOString().slice(0, 10);
    const isSunday = dow === 0;
    const isSaturday = dow === 6;
    if (!holidaySets[yr]) holidaySets[yr] = kenyaHolidays(yr);
    const isHoliday = holidaySets[yr].has(dateStr);

    // A day counts as leave only if it is a scheduled working day
    const isWorkDay =
      !isSunday &&
      !(workDaysPerWeek === 5 && isSaturday) &&
      (worksOnHolidays || !isHoliday);

    if (isWorkDay) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

router.post("/leave", requireAuth("self:request"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const parsed = leaveSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    // Load employee work schedule to count days correctly
    const [emp] = await db.select({
      workDaysPerWeek: employees.workDaysPerWeek,
      worksOnHolidays: employees.worksOnHolidays,
      leaveBalance: employees.leaveBalance,
    }).from(employees).where(and(eq(employees.id, empId), eq(employees.orgId, p.orgId)));

    const workDaysPerWeek = emp?.workDaysPerWeek ?? 5;
    const worksOnHolidays = emp?.worksOnHolidays ?? false;
    const days = countLeaveDays(parsed.data.startDate, parsed.data.endDate, workDaysPerWeek, worksOnHolidays);

    // Annual leave balance check
    if (parsed.data.type === "annual") {
      const thisYear = parsed.data.startDate.slice(0, 4);
      const takenRows = await db
        .select({ days: leaveRequests.days, startDate: leaveRequests.startDate })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, empId),
          eq(leaveRequests.orgId, p.orgId),
          eq(leaveRequests.status, "approved"),
          eq(leaveRequests.type, "annual"),
        ));
      const takenDays = takenRows
        .filter(l => l.startDate?.startsWith(thisYear))
        .reduce((acc, l) => acc + Math.round((l.days ?? 0) / 10), 0);
      const entitlement = Math.round((emp?.leaveBalance ?? 210) / 10);
      const requested = days;
      if (takenDays + requested > entitlement) {
        res.status(422).json({
          error: `Insufficient annual leave balance. You have ${entitlement - takenDays} day(s) remaining but this request requires ${requested} day(s).`,
          code: "INSUFFICIENT_LEAVE_BALANCE",
        });
        return;
      }
    }

    const [leave] = await db.insert(leaveRequests).values({
      orgId: p.orgId, employeeId: empId, type: parsed.data.type,
      startDate: parsed.data.startDate, endDate: parsed.data.endDate,
      days: days * 10, reason: parsed.data.reason ?? null, status: "pending",
    }).returning();

    res.status(201).json(leave);
  } catch (err) { next(err); }
});

router.get("/loans", requireAuth("self:read"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const myLoans = await db.select().from(loans)
      .where(and(eq(loans.employeeId, empId), eq(loans.orgId, p.orgId)))
      .orderBy(desc(loans.createdAt));

    // Resolve statutory config for FBT (company loans only)
    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));
    const currentPeriod = new Date().toISOString().slice(0, 7);
    let cfg: Awaited<ReturnType<typeof resolveConfig>>["config"] | null = null;
    try {
      const resolved = await resolveConfig(db as any, p.orgId, org?.countryCode ?? "KE", currentPeriod);
      cfg = resolved.config;
    } catch { /* no config — FBT not computable */ }

    // Attach repayment history and FBT for each loan
    const withHistory = await Promise.all(myLoans.map(async (loan) => {
      const repayments = await db.select().from(loanRepayments)
        .where(eq(loanRepayments.loanId, loan.id))
        .orderBy(desc(loanRepayments.createdAt)).limit(24);

      let fringeBenefit: { monthlyBenefit: number; monthlyTax: number } | null = null;
      if (loan.type === "company" && cfg) {
        const fbt = computeLoanFringeBenefitTax(loan.balance as any, loan.interestRateBps, cfg);
        if (fbt.monthlyTax > 0) fringeBenefit = fbt;
      }

      return { loan, repayments, fringeBenefit };
    }));

    res.json(withHistory);
  } catch (err) { next(err); }
});

router.get("/p9", requireAuth("self:read"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;
    const year = String(req.query.year ?? new Date().getFullYear());

    // Sum all approved payslips for the year
    const slips = await db.select({ slip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(
        eq(payslips.employeeId, empId),
        eq(payslips.orgId, p.orgId),
      ));

    const yearSlips = slips.filter((r) => r.run.period.startsWith(year) && r.run.status !== "reversed");

    const totals = yearSlips.reduce((acc, r) => ({
      grossPay: acc.grossPay + r.slip.gross,
      taxableIncome: acc.taxableIncome + r.slip.taxableIncome,
      paye: acc.paye + r.slip.paye,
      personalRelief: acc.personalRelief + r.slip.personalRelief,
      insuranceRelief: acc.insuranceRelief + r.slip.insuranceRelief,
      nssfEmployee: acc.nssfEmployee + r.slip.nssfEmployee,
      shif: acc.shif + r.slip.shif,
    }), { grossPay: 0, taxableIncome: 0, paye: 0, personalRelief: 0, insuranceRelief: 0, nssfEmployee: 0, shif: 0 });

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, empId), eq(employees.orgId, p.orgId)));

    // Build KRA P9 monthly rows with standard field names
    const months = yearSlips.map((r) => {
      const s = r.slip;
      const relief = s.personalRelief + s.insuranceRelief;
      const taxOnPay = s.paye + relief; // gross PAYE before relief
      return {
        month: r.run.period, // "2025-01" — component formats this
        basicSalary: s.gross,
        benefits: 0,
        grossPay: s.gross,
        pension: s.nssfEmployee,
        chargeablePay: s.taxableIncome,
        taxOnPay,
        relief,
        paye: s.paye,
      };
    });

    const p9Totals = months.reduce((acc, m) => ({
      basicSalary: acc.basicSalary + m.basicSalary,
      benefits: 0,
      grossPay: acc.grossPay + m.grossPay,
      pension: acc.pension + m.pension,
      chargeablePay: acc.chargeablePay + m.chargeablePay,
      taxOnPay: acc.taxOnPay + m.taxOnPay,
      relief: acc.relief + m.relief,
      paye: acc.paye + m.paye,
    }), { basicSalary: 0, benefits: 0, grossPay: 0, pension: 0, chargeablePay: 0, taxOnPay: 0, relief: 0, paye: 0 });

    res.json({ year, employee: emp, months, totals: p9Totals });
  } catch (err) { next(err); }
});

// ── Loan requests (employee-facing) ─────────────────────────────────────────
const portalLoanRequestSchema = z.object({
  type: z.enum(["company", "sacco", "advance", "emergency"]),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Invalid amount"),
  months: z.number().int().min(1).max(60),
  interestRateBps: z.number().int().min(0).max(10_000).default(0),
  reason: z.string().max(500).optional(),
});

function toCentsPortal(val: string): number {
  return Math.round(parseFloat(val) * 100);
}

router.get("/loan-requests", requireAuth("self:read"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;
    const requests = await db.select().from(loanRequests)
      .where(and(eq(loanRequests.employeeId, empId), eq(loanRequests.orgId, p.orgId)))
      .orderBy(desc(loanRequests.createdAt));
    res.json(requests);
  } catch (err) { next(err); }
});

router.post("/loan-requests", requireAuth("self:request"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const parsed = portalLoanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return;
    }

    const { type, amount, months, reason, interestRateBps } = parsed.data;
    const amountCents = toCentsPortal(amount);

    // Kenya Employment Act: salary/emergency advances capped at one month's gross salary
    if (type === "advance" || type === "emergency") {
      const [emp] = await db.select({
        basicSalary: employees.basicSalary,
        houseAllowance: employees.houseAllowance,
        transportAllowance: employees.transportAllowance,
        otherAllowance: employees.otherAllowance,
      }).from(employees).where(and(eq(employees.id, empId), eq(employees.orgId, p.orgId)));

      if (emp) {
        const grossMonthlyCents = emp.basicSalary + emp.houseAllowance + emp.transportAllowance + emp.otherAllowance;
        if (amountCents > grossMonthlyCents) {
          const capKes = (grossMonthlyCents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 });
          res.status(422).json({
            error: `Advance amount exceeds the legal cap. The maximum salary advance is one month's gross salary (KES ${capKes}).`,
          });
          return;
        }
      }
    }

    const [request] = await db.insert(loanRequests).values({
      orgId: p.orgId, employeeId: empId, type,
      amount: amountCents, months,
      interestRateBps: type === "sacco" ? (interestRateBps ?? 0) : 0,
      reason: reason ?? null, status: "pending",
    }).returning();

    res.status(201).json(request);
  } catch (err) { next(err); }
});

// ── PDF payslip download (employee self-service) ────────────────────────────
router.get("/payslip/:slipId/pdf", requireAuth("self:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const slipId = Number(req.params.slipId);

    const rows = await db
      .select({ slip: payslips, emp: employees, org: organizations, run: payrollRuns })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .innerJoin(organizations, eq(payslips.orgId, organizations.id))
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.id, slipId), eq(payslips.orgId, p.orgId)));

    if (!rows.length) throw new HttpError(404, "Payslip not found");
    const { slip, emp, org, run } = rows[0];

    // Employees can only download their own payslip
    if (emp.id !== p.employeeId) throw new HttpError(403, "Access denied");

    const bd = (slip.breakdown ?? {}) as { nssfTier1?: number; nssfTier2?: number; tier2Provider?: string; tier2ProviderName?: string };
    const { generatePayslipPdf } = await import("../lib/pdf-payslip.js");

    const pdfBuffer = await generatePayslipPdf({
      orgName: org.name, orgKraPin: org.kraPin ?? undefined, orgNssfNo: org.nssfEmployerNo ?? undefined,
      period: run.period, runName: run.name,
      empNo: emp.empNo, empName: fullName(emp),
      position: emp.position ?? "", employmentType: emp.employmentType ?? "permanent",
      nationalId: emp.nationalId ?? undefined, kraPin: emp.kraPin ?? undefined,
      nssfNo: emp.nssfNo ?? undefined, shifNo: emp.shifNo ?? undefined,
      bankName: emp.bankName ?? undefined, bankAccount: emp.bankAccount ?? undefined,
      mpesaPhone: emp.mpesaPhone ?? undefined,
      daysPayable: slip.daysPayable ?? 0, daysInPeriod: slip.daysInPeriod ?? 30,
      basic: slip.basic, allowances: slip.allowances, overtime: slip.overtime,
      adjustmentEarnings: slip.adjustmentEarnings, nonCashBenefit: slip.nonCashBenefit,
      gross: slip.gross, cashGross: slip.cashGross,
      paye: slip.paye, nssfEmployee: slip.nssfEmployee,
      nssfTier1: bd.nssfTier1 ?? 0, nssfTier2: bd.nssfTier2 ?? 0,
      tier2Label: bd.tier2Provider === "private" ? `${bd.tier2ProviderName ?? "Private Pension Fund"} — Tier II` : "NSSF — Tier II",
      shif: slip.shif, housingLevyEmployee: slip.housingLevyEmployee,
      pension: slip.pension, helb: slip.helb, sacco: slip.sacco,
      loanDeduction: slip.loanDeduction, adjustmentDeductions: slip.adjustmentDeductions,
      totalDeductions: slip.totalDeductions, netPay: slip.netPay,
      nssfEmployer: slip.nssfEmployer, housingLevyEmployer: slip.housingLevyEmployer,
      pensionEmployer: slip.pensionEmployer,
    });

    const filename = `Payslip_${run.period}_${emp.empNo}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.get("/timesheets", requireAuth("self:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const empId = requireEmployee(req);

    const { timesheets } = await import("@workspace/db/schema");
    const rows = await db.select().from(timesheets)
      .where(and(eq(timesheets.employeeId, empId), eq(timesheets.orgId, p.orgId)))
      .orderBy(desc(timesheets.id)).limit(12);
    res.json(rows);
  } catch (err) { next(err); }
});

const portalTimesheetSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  daysWorked: z.number().int().min(0).max(31).default(0),
  normalHours: z.number().int().min(0).max(400).default(0),
  overtimeHours: z.number().int().min(0).max(200).default(0),
  holidayHours: z.number().int().min(0).max(100).default(0),
});

router.post("/timesheets", requireAuth("self:request"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const empId = requireEmployee(req);

    const parsed = portalTimesheetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const { timesheets } = await import("@workspace/db/schema");
    const [existing] = await db.select().from(timesheets).where(and(
      eq(timesheets.orgId, p.orgId),
      eq(timesheets.employeeId, empId),
      eq(timesheets.period, parsed.data.period),
    ));

    let result;
    if (existing) {
      if (existing.approvedAt) {
        res.status(409).json({ error: "This timesheet has already been approved. Please contact HR to make changes." });
        return;
      }
      const [updated] = await db.update(timesheets).set({
        daysWorked: parsed.data.daysWorked,
        normalHours: parsed.data.normalHours,
        overtimeHours: parsed.data.overtimeHours,
        holidayHours: parsed.data.holidayHours,
        approvedAt: null,
        approvedBy: null,
      }).where(eq(timesheets.id, existing.id)).returning();
      result = updated;
    } else {
      const [created] = await db.insert(timesheets).values({
        orgId: p.orgId, employeeId: empId, ...parsed.data,
      }).returning();
      result = created;
    }

    res.json(result);
  } catch (err) { next(err); }
});

// ── Pending leave requests for approvers (managers, HR, admins) ─────────────
router.get("/pending-leaves", requireAuth("leave:approve"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;

    const rows = await db.select({ leave: leaveRequests, employee: employees })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(eq(leaveRequests.orgId, p.orgId))
      .orderBy(desc(leaveRequests.createdAt));

    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
