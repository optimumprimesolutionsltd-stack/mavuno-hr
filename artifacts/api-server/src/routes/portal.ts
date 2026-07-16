import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { employees, leaveRequests, loans, loanRepayments, payslips, payrollRuns } from "@workspace/db/schema";
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

    // Recent payslips
    const slips = await db.select({ slip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.employeeId, empId), eq(payslips.orgId, p.orgId)))
      .orderBy(desc(payrollRuns.period))
      .limit(12);

    res.json({ employee: emp, payslips: slips });
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
      return { ...loan, repayments };
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

    res.json({
      year, employee: emp, totals,
      monthlyBreakdown: yearSlips.map((r) => ({ period: r.run.period, ...r.slip })),
    });
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
