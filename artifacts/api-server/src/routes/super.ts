import { Router } from "express";
import { z } from "zod";
import { eq, count, max, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations, employees, payrollRuns, users } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
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

// ── GET /api/super/orgs ───────────────────────────────────────────────────────
router.get("/orgs", ...requireSuperAdmin(), async (_req, res, next) => {
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
      orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        plan: o.plan,
        status: o.status,
        seatLimit: o.seatLimit,
        monthlyCharge: o.monthlyCharge ?? 0,
        countryCode: o.countryCode,
        currencyCode: o.currencyCode,
        trialEndsAt: o.trialEndsAt,
        createdAt: o.createdAt,
        activeEmployees: empMap[o.id] ?? 0,
        payrollRuns: runMap[o.id]?.cnt ?? 0,
        lastPayrollRun: runMap[o.id]?.lastRun ?? null,
        admins: adminMap[o.id] ?? [],
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/super/orgs/:id ─────────────────────────────────────────────────
const patchOrgSchema = z.object({
  plan: z.enum(["trial", "starter", "growth", "enterprise"]).optional(),
  seatLimit: z.number().int().min(1).max(10_000_000).optional(),
  monthlyCharge: z.number().int().min(0).optional(), // stored as cents (KES)
  status: z.enum(["active", "suspended"]).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
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
    if (d.status !== undefined) updates.status = d.status;
    if (d.trialEndsAt !== undefined)
      updates.trialEndsAt = d.trialEndsAt ? new Date(d.trialEndsAt) : null;

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
