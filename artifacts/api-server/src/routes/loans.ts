import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { loans, loanRequests, employees, loanRepayments, payrollRuns } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { toCents } from "../lib/money.js";
import { HttpError } from "../lib/http-error.js";

const router = Router();

const moneyString = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const loanSchema = z.object({
  employeeId: z.number().int().positive(),
  type: z.enum(["company","sacco","advance","emergency"]),
  amount: moneyString,
  months: z.number().int().min(1).max(60),
  interestRateBps: z.number().int().min(0).max(10_000).default(0),
  startDate: isoDate,
});

const loanRequestSchema = z.object({
  type: z.enum(["company","sacco","advance","emergency"]),
  amount: moneyString,
  months: z.number().int().min(1).max(60),
  reason: z.string().max(500).optional(),
});

const loanDecisionSchema = z.object({
  action: z.enum(["approve","reject"]),
  interestRateBps: z.number().int().min(0).max(10_000).default(0),
  months: z.number().int().min(1).max(60).optional(),
  startDate: isoDate.optional(),
  reviewNote: z.string().max(500).optional(),
});

router.get("/", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const rows = await db.select({ loan: loans, emp: employees })
      .from(loans)
      .innerJoin(employees, eq(loans.employeeId, employees.id))
      .where(eq(loans.orgId, p.orgId))
      .orderBy(desc(loans.createdAt));
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = loanSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const principal = toCents(parsed.data.amount);
    const months = parsed.data.months;
    const bps = parsed.data.interestRateBps;
    // Simple monthly installment: P/n + (P * monthlyRate)
    const monthlyRate = bps / 12 / 10_000;
    const installment = monthlyRate > 0
      ? Math.round(principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1))
      : Math.ceil(principal / months);

    const [loan] = await db.insert(loans).values({
      orgId: p.orgId, employeeId: parsed.data.employeeId, type: parsed.data.type,
      principal, balance: principal, monthlyInstallment: installment,
      interestRateBps: bps, status: "active", startDate: parsed.data.startDate,
    }).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "LOAN_ISSUED", entity: "loans", entityId: loan.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { employeeId: loan.employeeId, amount: principal, months },
      });
    });

    res.status(201).json(loan);
  } catch (err) { next(err); }
});

// Loan requests
router.get("/requests", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const rows = await db.select({ req: loanRequests, emp: employees })
      .from(loanRequests)
      .innerJoin(employees, eq(loanRequests.employeeId, employees.id))
      .where(eq(loanRequests.orgId, p.orgId))
      .orderBy(desc(loanRequests.createdAt));
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/requests", requireAuth("self:request"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    if (!p.employeeId) { res.status(403).json({ error: "No employee profile linked to this account" }); return; }
    const parsed = loanRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [req2] = await db.insert(loanRequests).values({
      orgId: p.orgId, employeeId: p.employeeId, type: parsed.data.type,
      amount: toCents(parsed.data.amount), months: parsed.data.months,
      reason: parsed.data.reason ?? null, status: "pending",
    }).returning();

    res.status(201).json(req2);
  } catch (err) { next(err); }
});

router.patch("/requests/:id", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = loanDecisionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [loanReq] = await db.select().from(loanRequests)
      .where(and(eq(loanRequests.id, id), eq(loanRequests.orgId, p.orgId)));
    if (!loanReq) { res.status(404).json({ error: "Loan request not found" }); return; }
    if (loanReq.status !== "pending") throw new HttpError(409, "Loan request is not pending");

    const { action, interestRateBps, months, startDate, reviewNote } = parsed.data;

    if (action === "approve") {
      const principal = loanReq.amount;
      const m = months ?? loanReq.months;
      const bps = interestRateBps;
      const monthlyRate = bps / 12 / 10_000;
      const installment = monthlyRate > 0
        ? Math.round(principal * (monthlyRate * Math.pow(1 + monthlyRate, m)) / (Math.pow(1 + monthlyRate, m) - 1))
        : Math.ceil(principal / m);

      const today = startDate ?? new Date().toISOString().slice(0, 10);
      const [loan] = await db.insert(loans).values({
        orgId: p.orgId, employeeId: loanReq.employeeId, type: loanReq.type,
        principal, balance: principal, monthlyInstallment: installment,
        interestRateBps: bps, status: "active", startDate: today,
      }).returning();

      await db.update(loanRequests).set({
        status: "approved", loanId: loan.id, decidedByUserId: p.userId,
        reviewedAt: new Date(), reviewNote: reviewNote ?? null,
      }).where(eq(loanRequests.id, id));
    } else {
      await db.update(loanRequests).set({
        status: "rejected", decidedByUserId: p.userId,
        reviewedAt: new Date(), reviewNote: reviewNote ?? null,
      }).where(eq(loanRequests.id, id));
    }

    const [updated] = await db.select().from(loanRequests).where(eq(loanRequests.id, id));

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: `LOAN_REQUEST_${action.toUpperCase()}D`, entity: "loan_requests", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: "pending" }, after: { status: updated.status },
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
