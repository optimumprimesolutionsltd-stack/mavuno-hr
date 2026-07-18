import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { employees, leaveRequests, loans, loanRequests, loanRepayments, payslips, payrollRuns } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";

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

    // Leave balance: annual entitlement (21 days) minus approved annual leave taken this year
    const thisYear = new Date().getFullYear().toString();
    const takenLeaves = await db.select().from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, empId),
        eq(leaveRequests.orgId, p.orgId),
        eq(leaveRequests.status, "approved"),
        eq(leaveRequests.type, "annual"),
      ));
    const takenDays = takenLeaves
      .filter(l => l.startDate.startsWith(thisYear))
      .reduce((acc, l) => acc + Math.round((l.days ?? 0) / 10), 0);
    const leaveBalance = Math.max(0, 21 - takenDays);

    res.json({ employee: emp, payslips: flatSlips, leaveBalance });
  } catch (err) { next(err); }
});

router.get("/leave", requireAuth("self:read"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const leaves = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.employeeId, empId), eq(leaveRequests.orgId, p.orgId)))
      .orderBy(desc(leaveRequests.createdAt));
    res.json(leaves);
  } catch (err) { next(err); }
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leaveSchema = z.object({
  type: z.enum(["annual","sick","maternity","paternity","compassionate","study","unpaid"]),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().max(500).optional(),
}).refine((l) => l.endDate >= l.startDate, { message: "End date must be on or after start date", path: ["endDate"] });

router.post("/leave", requireAuth("self:request"), async (req, res, next) => {
  try {
    const empId = requireEmployee(req);
    const p = (req as AuthRequest).principal;

    const parsed = leaveSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const s = new Date(parsed.data.startDate), e = new Date(parsed.data.endDate);
    let days = 0;
    const cur = new Date(s);
    while (cur <= e) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) days++;
      cur.setDate(cur.getDate() + 1);
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

    // Attach repayment history for each loan
    const withHistory = await Promise.all(myLoans.map(async (loan) => {
      const repayments = await db.select().from(loanRepayments)
        .where(eq(loanRepayments.loanId, loan.id))
        .orderBy(desc(loanRepayments.createdAt)).limit(24);
      return { loan, repayments };
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

    const { type, amount, months, reason } = parsed.data;
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
      amount: amountCents, months, reason: reason ?? null, status: "pending",
    }).returning();

    res.status(201).json(request);
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

export default router;
