import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { loans, loanRequests, employees, organizations } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { toCents } from "../lib/money.js";
import { HttpError } from "../lib/http-error.js";
import { computeLoanFringeBenefitTax } from "../lib/payroll.js";
import { resolveConfig } from "../lib/statutory-resolve.js";

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

// HR creates a loan request on behalf of any employee
const adminLoanRequestSchema = z.object({
  employeeId: z.number().int().positive(),
  type: z.enum(["company","sacco","advance","emergency"]),
  amount: moneyString,
  months: z.number().int().min(1).max(60),
  interestRateBps: z.number().int().min(0).max(10_000).default(0),
  reason: z.string().max(500).optional(),
});

// HR edits a pending loan request
const editRequestSchema = z.object({
  type: z.enum(["company","sacco","advance","emergency"]).optional(),
  amount: moneyString.optional(),
  months: z.number().int().min(1).max(60).optional(),
  interestRateBps: z.number().int().min(0).max(10_000).optional(),
  reason: z.string().max(500).optional(),
});

const loanDecisionSchema = z.object({
  action: z.enum(["approve","reject"]),
  interestRateBps: z.number().int().min(0).max(10_000).optional(),
  months: z.number().int().min(1).max(60).optional(),
  startDate: isoDate.optional(),
  reviewNote: z.string().max(500).optional(),
});

function calcInstallment(principal: number, bps: number, months: number): number {
  const monthlyRate = bps / 12 / 10_000;
  if (monthlyRate === 0) return Math.ceil(principal / months);
  return Math.round(principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1));
}

// GET /api/loans — list all active loans with FBT computation for company loans
router.get("/", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const rows = await db.select({ loan: loans, employee: employees })
      .from(loans)
      .innerJoin(employees, eq(loans.employeeId, employees.id))
      .where(eq(loans.orgId, p.orgId))
      .orderBy(desc(loans.createdAt));

    // Resolve statutory config for FBT deemed rate
    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));
    const currentPeriod = new Date().toISOString().slice(0, 7);
    let cfg: Awaited<ReturnType<typeof resolveConfig>>["config"] | null = null;
    try {
      const resolved = await resolveConfig(db as any, p.orgId, org?.countryCode ?? "KE", currentPeriod);
      cfg = resolved.config;
    } catch { /* no config — FBT not computable */ }

    const result = rows.map(r => {
      // FBT applies to company loans only (employer-issued, below deemed rate)
      let fringeBenefit: { monthlyBenefit: number; monthlyTax: number } | null = null;
      if (r.loan.type === "company" && cfg) {
        const fbt = computeLoanFringeBenefitTax(r.loan.balance as any, r.loan.interestRateBps, cfg);
        if (fbt.monthlyTax > 0) fringeBenefit = fbt;
      }
      return { ...r, fringeBenefit };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/loans — HR issues a loan directly to an employee
router.post("/", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = loanSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const principal = toCents(parsed.data.amount);
    const { months, interestRateBps: bps, startDate } = parsed.data;
    const installment = calcInstallment(principal, bps, months);

    const [loan] = await db.insert(loans).values({
      orgId: p.orgId, employeeId: parsed.data.employeeId, type: parsed.data.type,
      principal, balance: principal, monthlyInstallment: installment,
      interestRateBps: bps, status: "active", startDate,
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

// GET /api/loans/requests — list all loan requests (all statuses)
router.get("/requests", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const rows = await db.select({ request: loanRequests, employee: employees })
      .from(loanRequests)
      .innerJoin(employees, eq(loanRequests.employeeId, employees.id))
      .where(eq(loanRequests.orgId, p.orgId))
      .orderBy(desc(loanRequests.createdAt));
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/loans/requests/for-employee — HR creates a loan request on behalf of any employee
router.post("/requests/for-employee", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = adminLoanRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const [request] = await db.insert(loanRequests).values({
      orgId: p.orgId,
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      amount: toCents(parsed.data.amount),
      months: parsed.data.months,
      interestRateBps: parsed.data.type === "sacco" ? (parsed.data.interestRateBps ?? 0) : 0,
      reason: parsed.data.reason ?? null,
      status: "pending",
    }).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "LOAN_REQUEST_CREATED_BY_HR", entity: "loan_requests", entityId: request.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { employeeId: request.employeeId, amount: request.amount, type: request.type },
      });
    });

    res.status(201).json(request);
  } catch (err) { next(err); }
});

// PATCH /api/loans/requests/:id/edit — HR edits a pending loan request
router.patch("/requests/:id/edit", requireAuth("loan:review"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = editRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [loanReq] = await db.select().from(loanRequests)
      .where(and(eq(loanRequests.id, id), eq(loanRequests.orgId, p.orgId)));
    if (!loanReq) { res.status(404).json({ error: "Loan request not found" }); return; }
    if (loanReq.status !== "pending") throw new HttpError(409, "Only pending requests can be edited");

    const updates: Partial<typeof loanReq> = {};
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.amount !== undefined) (updates as any).amount = toCents(parsed.data.amount);
    if (parsed.data.months !== undefined) updates.months = parsed.data.months;
    if (parsed.data.reason !== undefined) updates.reason = parsed.data.reason;

    // Interest rate: only editable on SACCO loans, only if still pending
    const effectiveType = parsed.data.type ?? loanReq.type;
    if (effectiveType === "sacco" && parsed.data.interestRateBps !== undefined) {
      (updates as any).interestRateBps = parsed.data.interestRateBps;
    }

    const [updated] = await db.update(loanRequests).set(updates).where(eq(loanRequests.id, id)).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "LOAN_REQUEST_EDITED", entity: "loan_requests", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { type: loanReq.type, amount: loanReq.amount, months: loanReq.months },
        after: updates,
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// PATCH /api/loans/requests/:id — approve or reject a loan request
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

    const { action, months, startDate, reviewNote } = parsed.data;

    if (action === "approve") {
      const principal = loanReq.amount;
      const m = months ?? loanReq.months;
      // SACCO: always use the interest rate the employee specified on the request (locked)
      // Company/advance/emergency: use the rate HR supplies at approval time
      const bps = loanReq.type === "sacco"
        ? loanReq.interestRateBps
        : (parsed.data.interestRateBps ?? 0);
      const installment = calcInstallment(principal, bps, m);
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
