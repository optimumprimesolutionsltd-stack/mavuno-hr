import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { eq, ne, count, max, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations, employees, payrollRuns, users } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  PLAN_IDS, BILLING_CYCLES,
  standardMonthlyCents, effectiveMonthlyCents, cycleChargeCents,
} from "../lib/pricing.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// ── Super-admin gate ──────────────────────────────────────────────────────────
function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function requireSuperAdmin() {
  return [
    requireAuth(),
    (req: Request, res: Response, next: NextFunction) => {
      const p = (req as AuthRequest).principal;
      if (!getSuperAdminEmails().includes(p.email.toLowerCase())) {
        res.status(403).json({ error: "Super-admin access required" });
        return;
      }
      next();
    },
  ];
}

// The CRM pulls the org list on a schedule. It has no user session, so it
// presents `CRM_SYNC_KEY` as a Bearer token instead. This is a read-only
// credential for GET /orgs only — patch/suspend/activate stay session-gated.
function hasValidSyncKey(req: Request): boolean {
  const expected = process.env.CRM_SYNC_KEY?.trim();
  if (!expected) return false; // fail closed when unconfigured
  const auth = req.headers["authorization"];
  const got = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Accept either a super-admin session or the CRM sync key. The key is checked
// first so a valid key is never mistaken for a stale session token by
// requireAuth().
function requireSuperAdminOrSyncKey() {
  const [auth, emailGate] = requireSuperAdmin();
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasValidSyncKey(req)) {
      next();
      return;
    }
    auth(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      emailGate(req, res, next);
    });
  };
}

// ── GET /api/super/orgs ───────────────────────────────────────────────────────
router.get("/orgs", requireSuperAdminOrSyncKey(), async (_req, res, next) => {
  try {
    // Per-org aggregates: employee count, payroll run count, last run date, admin email
    const orgs = await db.select().from(organizations).orderBy(organizations.createdAt);

    const [empCounts, runCounts, adminRows] = await Promise.all([
      db
        .select({ orgId: employees.orgId, cnt: count() })
        .from(employees)
        .where(eq(employees.status, "active"))
        .groupBy(employees.orgId),
      db
        .select({ orgId: payrollRuns.orgId, cnt: count(), lastRun: max(payrollRuns.createdAt) })
        .from(payrollRuns)
        .where(ne(payrollRuns.runType, "historical"))
        .groupBy(payrollRuns.orgId),
      db
        .select({ orgId: users.orgId, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.role, "admin")),
    ]);

    const empMap = Object.fromEntries(empCounts.map((r) => [r.orgId, r.cnt]));
    const runMap = Object.fromEntries(runCounts.map((r) => [r.orgId, { cnt: r.cnt, lastRun: r.lastRun }]));
    const adminMap: Record<number, { email: string; name: string }[]> = {};
    for (const r of adminRows) {
      if (!adminMap[r.orgId]) adminMap[r.orgId] = [];
      adminMap[r.orgId].push({ email: r.email, name: r.name });
    }

    res.json(
      orgs.map((o) => {
        const activeEmployees = empMap[o.id] ?? 0;
        const overrideCents = o.monthlyCharge ?? 0;
        const cycle = o.billingCycle ?? "monthly";
        const standardMonthlyCharge = standardMonthlyCents(o.plan, activeEmployees);
        const monthlyCharge = effectiveMonthlyCents({
          plan: o.plan,
          activeEmployees,
          overrideCents,
        });
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          status: o.status,
          seatLimit: o.seatLimit,
          billingCycle: cycle,
          // What the org actually pays each month (override wins over rate card).
          monthlyCharge,
          // The rate-card figure at the current headcount, for comparison.
          standardMonthlyCharge,
          // The negotiated override itself (0 = none / use rate card).
          overrideCharge: overrideCents,
          // Amount per invoice (annual bills 10x the monthly).
          cycleCharge: cycleChargeCents(monthlyCharge, cycle),
          countryCode: o.countryCode,
          currencyCode: o.currencyCode,
          trialEndsAt: o.trialEndsAt,
          payrollStartPeriod: o.payrollStartPeriod,
          createdAt: o.createdAt,
          activeEmployees,
          payrollRuns: runMap[o.id]?.cnt ?? 0,
          lastPayrollRun: runMap[o.id]?.lastRun ?? null,
          admins: adminMap[o.id] ?? [],
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/super/orgs/:id ─────────────────────────────────────────────────
const patchOrgSchema = z.object({
  plan: z.enum(PLAN_IDS).optional(),
  seatLimit: z.number().int().min(1).max(10_000_000).optional(),
  // Negotiated per-org override in KES cents. 0 clears it (use the rate card).
  monthlyCharge: z.number().int().min(0).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  payrollStartPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
});

router.patch("/orgs/:id", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new HttpError(400, "Invalid org id");

    const parsed = patchOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }

    const updates: Partial<typeof organizations.$inferInsert> = {};
    const d = parsed.data;
    if (d.plan !== undefined) updates.plan = d.plan;
    if (d.seatLimit !== undefined) updates.seatLimit = d.seatLimit;
    if (d.monthlyCharge !== undefined) updates.monthlyCharge = d.monthlyCharge;
    if (d.billingCycle !== undefined) updates.billingCycle = d.billingCycle;
    if (d.status !== undefined) updates.status = d.status;
    if (d.trialEndsAt !== undefined)
      updates.trialEndsAt = d.trialEndsAt ? new Date(d.trialEndsAt) : null;
    if (d.payrollStartPeriod !== undefined) updates.payrollStartPeriod = d.payrollStartPeriod ?? null;

    if (Object.keys(updates).length === 0) {
      res.status(422).json({ error: "Nothing to update" });
      return;
    }

    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, id))
      .returning();

    if (!updated) throw new HttpError(404, "Organization not found");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/super/orgs/:id/suspend ─────────────────────────────────────────
router.post("/orgs/:id/suspend", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new HttpError(400, "Invalid org id");
    const [updated] = await db
      .update(organizations)
      .set({ status: "suspended" })
      .where(eq(organizations.id, id))
      .returning({ id: organizations.id, status: organizations.status });
    if (!updated) throw new HttpError(404, "Organization not found");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/super/orgs/:id/activate ────────────────────────────────────────
router.post("/orgs/:id/activate", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new HttpError(400, "Invalid org id");
    const [updated] = await db
      .update(organizations)
      .set({ status: "active" })
      .where(eq(organizations.id, id))
      .returning({ id: organizations.id, status: organizations.status });
    if (!updated) throw new HttpError(404, "Organization not found");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
