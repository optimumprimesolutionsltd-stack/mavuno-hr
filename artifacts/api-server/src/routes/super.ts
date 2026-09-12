import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { eq, ne, and, isNull, inArray, count, max, sql, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations, employees, payrollRuns, users, passwordResetTokens, statutoryConfigs, billingCredits, demoRequests, newsletterSubscribers } from "@workspace/db/schema";
import { requireAuth, getIp, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { writeAudit } from "../lib/audit.js";
import {
  PLAN_IDS, BILLING_CYCLES, PLAN_RATES,
  standardMonthlyCents, effectiveMonthlyCents, cycleChargeCents,
} from "../lib/pricing.js";
import { accountReferenceFor, parseAccountReference } from "../lib/mpesa.js";
import { accessStateOf } from "../lib/session.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";
import { sendOrgInviteEmail } from "../lib/mailer.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// Matches auth.ts's own APP_BASE_PATH constant — kept local rather than
// shared, consistent with this file's existing small duplication of
// requireSuperAdmin()-style helpers instead of a cross-route import.
const APP_BASE_PATH = (process.env.APP_BASE_PATH ?? "/app").replace(/\/+$/, "");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

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

// ── GET /api/super/marketing-capture ─────────────────────────────────────────
// Demo requests and newsletter signups, for the CRM to mirror. Same guard as
// /orgs: a super admin session, or the read-only CRM_SYNC_KEY.
//
// Returns everything within the window rather than tracking what has already
// been sent. The CRM keys each record deterministically (mavuno_demo_<id>,
// mavuno_sub_<id>) so a repeated pull is an upsert, which means neither side
// has to hold sync state and a missed run repairs itself on the next one.
router.get("/marketing-capture", requireSuperAdminOrSyncKey(), async (req, res, next) => {
  try {
    // Default to 30 days. Long enough that a CRM outage over a long weekend
    // loses nothing, short enough that the payload stays small forever.
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [demos, subs] = await Promise.all([
      db
        .select()
        .from(demoRequests)
        .where(gte(demoRequests.createdAt, since))
        .orderBy(demoRequests.createdAt),
      db
        .select()
        .from(newsletterSubscribers)
        .where(gte(newsletterSubscribers.createdAt, since))
        .orderBy(newsletterSubscribers.createdAt),
    ]);

    res.json({ product: "mavuno", since: since.toISOString(), demoRequests: demos, newsletterSubscribers: subs });
  } catch (err) {
    next(err);
  }
});

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
          billingRef: accountReferenceFor(o.id),
          trialEndsAt: o.trialEndsAt,
          accessUntil: o.accessUntil,
          accessState: accessStateOf(o.accessUntil),
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

// ── POST /api/super/orgs — provision an org the customer can't self-serve ───
// docs/design/super-admin-org-lifecycle.md §3 (Phase 2).
const provisionOrgSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only").optional(),
  countryCode: z.string().length(2).default("KE"),
  currencyCode: z.string().min(3).max(4).default("KES"),
  kraPin: z.string().max(20).optional(),
  plan: z.enum(PLAN_IDS).default("trial"),
  seatLimit: z.number().int().min(1).max(10_000_000).optional(),
  billingCycle: z.enum(BILLING_CYCLES).default("monthly"),
  monthlyChargeOverrideCents: z.number().int().min(0).optional(),
  accessUntil: z.string().datetime().optional(),
  admin: z.object({
    email: z.string().email().max(255),
    name: z.string().min(2).max(120),
    sendInvite: z.boolean().default(true),
  }),
});

router.post("/orgs", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = provisionOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const countryCode = d.countryCode.toUpperCase();
    const currencyCode = d.currencyCode.toUpperCase();

    // Slug: explicit > derived from name. On collision, 409 unless ?autoSlug=true
    // (then try name-2, name-3, ... until one is free).
    const autoSlug = req.query.autoSlug === "true";
    const base = d.slug ?? slugify(d.name);
    if (!base) throw new HttpError(422, "Could not derive a URL slug from the name — provide one explicitly");

    let slug = base;
    let suffix = 1;
    for (;;) {
      const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
      if (!existing) break;
      if (!autoSlug) throw new HttpError(409, `Slug "${slug}" is already taken`, "SLUG_TAKEN");
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    const rate = PLAN_RATES[d.plan];
    const seatLimit = d.seatLimit ?? rate.softCapSeats ?? 1_000_000;
    const accessUntil = d.accessUntil ? new Date(d.accessUntil) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const warnings: string[] = [];

    const [cfgExists] = await db.select({ id: statutoryConfigs.id }).from(statutoryConfigs)
      .where(and(eq(statutoryConfigs.countryCode, countryCode), isNull(statutoryConfigs.orgId)))
      .limit(1);
    if (!cfgExists) {
      warnings.push(`No statutory configuration is on file for ${countryCode} — payroll will 422 until one is loaded.`);
    }

    const adminEmail = d.admin.email.toLowerCase();
    const [adminElsewhere] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);
    if (adminElsewhere) {
      warnings.push(`${adminEmail} already has a Mavuno HR account in another organisation — this creates a separate account for this org (orgs are a hard tenancy boundary here).`);
    }

    // Unusable until the invite is redeemed — nobody knows this string.
    const placeholderHash = await hashPassword(generateTempPassword());

    const { orgId, adminUserId } = await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({
        name: d.name,
        slug,
        countryCode,
        currencyCode,
        ...(d.kraPin ? { kraPin: d.kraPin.toUpperCase() } : {}),
        plan: d.plan,
        seatLimit,
        billingCycle: d.billingCycle,
        monthlyCharge: d.monthlyChargeOverrideCents ?? 0,
        status: "active",
        payrollStartPeriod: new Date().toISOString().slice(0, 7),
        trialEndsAt: d.plan === "trial" ? accessUntil : null,
        accessUntil,
      }).returning();

      const [admin] = await tx.insert(users).values({
        orgId: org.id,
        email: adminEmail,
        name: d.admin.name,
        role: "admin",
        passwordHash: placeholderHash,
        mustChangePassword: true,
        failedLoginCount: 0,
      }).returning({ id: users.id });

      await writeAudit(tx as any, {
        orgId: org.id, action: "SUPER_ORG_CREATED", entity: "organizations", entityId: org.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { name: d.name, slug, plan: d.plan, countryCode, adminEmail },
      });
      await writeAudit(tx as any, {
        orgId: org.id, action: "SUPER_ORG_ADMIN_INVITED", entity: "users", entityId: admin.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { email: adminEmail },
      });

      return { orgId: org.id, adminUserId: admin.id };
    });

    // Set-password token — same table/flow as forgot-password, a longer TTL
    // (7 days, first-time setup) instead of the 1-hour reset window.
    const rawToken = crypto.randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      userId: adminUserId,
      token: rawToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const origin = req.headers.origin ?? `${req.protocol}://${req.headers.host}`;
    const inviteUrl = `${origin}${APP_BASE_PATH}/admin/reset-password?token=${rawToken}`;

    let inviteEmailed = false;
    if (d.admin.sendInvite) {
      try {
        await sendOrgInviteEmail(adminEmail, d.admin.name, d.name, inviteUrl);
        inviteEmailed = true;
      } catch (err) {
        warnings.push("Invite email failed to send — share the invite link below manually.");
      }
    }

    const [orgRow] = await db.select().from(organizations).where(eq(organizations.id, orgId));

    res.status(201).json({
      org: {
        ...orgRow,
        billingRef: accountReferenceFor(orgId),
        accessState: accessStateOf(orgRow.accessUntil),
      },
      admin: { id: adminUserId, email: adminEmail },
      inviteEmailed,
      // Always returned — lets the super-admin re-share the link even when
      // sendInvite was true but delivery failed.
      inviteUrl,
      warnings,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/super/resolve-ref?ref=MHR-000042K ───────────────────────────────
// Resolve a billing account number to its org — for reconciling a bank transfer
// or Paybill payment, and the seam a future M-Pesa C2B callback would call.
router.get("/resolve-ref", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const orgId = parseAccountReference(String(req.query.ref ?? ""));
    if (orgId === null) {
      throw new HttpError(422, "Not a valid billing account number", "BAD_BILLING_REF");
    }
    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        plan: organizations.plan,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new HttpError(404, "No organisation for that account number");
    res.json({ ...org, billingRef: accountReferenceFor(org.id) });
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
  accessUntil: z.string().datetime().nullable().optional(),
});

router.patch("/orgs/:id", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new HttpError(400, "Invalid org id");

    const parsed = patchOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }

    const [before] = await db.select({ accessUntil: organizations.accessUntil })
      .from(organizations).where(eq(organizations.id, id));
    if (!before) throw new HttpError(404, "Organization not found");

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
    if (d.accessUntil !== undefined)
      updates.accessUntil = d.accessUntil ? new Date(d.accessUntil) : null;

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

    if (d.accessUntil !== undefined) {
      await db.transaction(async (tx) => {
        await writeAudit(tx as any, {
          orgId: id, action: "ORG_ACCESS_UNTIL_SET", entity: "organizations", entityId: id,
          actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
          before: { accessUntil: before.accessUntil },
          after: { accessUntil: updated.accessUntil },
        });
      });
    }

    res.json({ ...updated, accessState: accessStateOf(updated.accessUntil) });
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

// ── Billing credits ───────────────────────────────────────────────────────
// docs/design/super-admin-org-lifecycle.md §4 (Phase 3). "Applied" only
// happens at payment-verification time (billing.ts, Phase 4) — these three
// endpoints just issue, list, and void.
const CREDIT_KINDS = ["sla", "goodwill", "refund", "correction", "promo"] as const;

const issueCreditSchema = z.object({
  amountCents: z.number().int().positive(),
  kind: z.enum(CREDIT_KINDS),
  reason: z.string().min(1).max(500),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM").nullable().optional(),
  note: z.string().max(1000).optional(),
});

// ── POST /api/super/orgs/:id/credits ──────────────────────────────────────
router.post("/orgs/:id/credits", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const orgId = parseInt(String(req.params.id));
    if (isNaN(orgId)) throw new HttpError(400, "Invalid org id");

    const parsed = issueCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;

    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new HttpError(404, "Organization not found");

    const [credit] = await db.transaction(async (tx) => {
      const [row] = await tx.insert(billingCredits).values({
        orgId,
        amountCents: d.amountCents,
        kind: d.kind,
        reason: d.reason,
        period: d.period ?? null,
        note: d.note ?? null,
        createdByUserId: p.userId,
      }).returning();

      await writeAudit(tx as any, {
        orgId, action: "BILLING_CREDIT_ISSUED", entity: "billing_credits", entityId: row.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        detail: `${d.kind}: KES ${(d.amountCents / 100).toLocaleString("en-KE")} — ${d.reason}`,
        after: { amountCents: d.amountCents, kind: d.kind, reason: d.reason, period: d.period ?? null },
      });

      return [row];
    });

    res.status(201).json(credit);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/super/orgs/:id/credits ───────────────────────────────────────
router.get("/orgs/:id/credits", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id));
    if (isNaN(orgId)) throw new HttpError(400, "Invalid org id");

    const rows = await db.select({ credit: billingCredits, createdBy: users.email })
      .from(billingCredits)
      .leftJoin(users, eq(billingCredits.createdByUserId, users.id))
      .where(eq(billingCredits.orgId, orgId))
      .orderBy(sql`${billingCredits.createdAt} DESC`);

    const openBalanceCents = rows
      .filter((r) => r.credit.status === "open")
      .reduce((sum, r) => sum + r.credit.amountCents, 0);

    res.json({ credits: rows.map((r) => ({ ...r.credit, createdByEmail: r.createdBy })), openBalanceCents });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/super/credits/:id/void ──────────────────────────────────────
router.post("/credits/:id/void", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new HttpError(400, "Invalid credit id");

    const [credit] = await db.select().from(billingCredits).where(eq(billingCredits.id, id));
    if (!credit) throw new HttpError(404, "Credit not found");
    if (credit.status !== "open") throw new HttpError(409, `Only an open credit can be voided (this one is '${credit.status}')`);

    const now = new Date();
    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx.update(billingCredits)
        .set({ status: "void", voidedAt: now, voidedByUserId: p.userId })
        .where(eq(billingCredits.id, id))
        .returning();

      await writeAudit(tx as any, {
        orgId: credit.orgId, action: "BILLING_CREDIT_VOID", entity: "billing_credits", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: "open" }, after: { status: "void" },
      });

      return [row];
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/super/outage-credits — bulk SLA credit across affected orgs ───
// docs/design/super-admin-org-lifecycle.md §4 "Downtime → credits" (Phase 5).
// credit = round(monthly_charge × outage_minutes ÷ minutes_in_month × multiplier).
// "One audit event per org + one summary event" per the design doesn't map
// cleanly onto audit_logs' per-org hash chain (org_id is NOT NULL, chained by
// org) — there is no org-less row to hold a cross-org summary. Instead every
// per-org row shares one runId (in its `detail`/`after`), so the whole batch
// is findable by filtering the audit log for that id; the API response itself
// is the immediate summary.
function minutesInMonthOf(d: Date): number {
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return daysInMonth * 24 * 60;
}

const outageCreditSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  multiplier: z.number().positive().max(10).default(1),
  scope: z.enum(["all_active_paid", "selected"]).default("all_active_paid"),
  orgIds: z.array(z.number().int().positive()).optional(),
  reason: z.string().max(500).optional(),
  bumpAccessUntil: z.boolean().default(false),
});

router.post("/outage-credits", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = outageCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;

    const startAt = new Date(d.startAt);
    const endAt = new Date(d.endAt);
    const outageMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
    if (outageMinutes <= 0) throw new HttpError(422, "endAt must be after startAt");

    if (d.scope === "selected" && (!d.orgIds || d.orgIds.length === 0)) {
      throw new HttpError(422, "orgIds is required when scope is 'selected'");
    }

    const minutesInMonth = minutesInMonthOf(startAt);
    const reason = d.reason?.trim() || `Service disruption ${startAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}–${endAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", timeStyle: "short" })} EAT`;
    const runId = `outage-${startAt.toISOString()}-${crypto.randomBytes(4).toString("hex")}`;

    // Candidate orgs: explicit list, or every active org (headcount/override
    // decide below whether each one actually owes anything to be pro-rated).
    const candidates = d.scope === "selected"
      ? await db.select().from(organizations).where(inArray(organizations.id, d.orgIds!))
      : await db.select().from(organizations).where(eq(organizations.status, "active"));

    const empCounts = await db.select({ orgId: employees.orgId, cnt: count() }).from(employees)
      .where(eq(employees.status, "active")).groupBy(employees.orgId);
    const empMap = new Map(empCounts.map((r) => [r.orgId, r.cnt]));

    const results: { orgId: number; orgName: string; creditCents: number; skipped?: string }[] = [];
    let totalCreditedCents = 0;

    await db.transaction(async (tx) => {
      for (const org of candidates) {
        const activeEmployees = empMap.get(org.id) ?? 0;
        const monthlyCents = effectiveMonthlyCents({
          plan: org.plan, activeEmployees, overrideCents: org.monthlyCharge ?? 0,
        });
        if (monthlyCents <= 0) {
          results.push({ orgId: org.id, orgName: org.name, creditCents: 0, skipped: "no active monthly charge" });
          continue;
        }

        const creditCents = Math.round(monthlyCents * outageMinutes / minutesInMonth * d.multiplier);
        if (creditCents <= 0) {
          results.push({ orgId: org.id, orgName: org.name, creditCents: 0, skipped: "computed credit is zero" });
          continue;
        }

        const [credit] = await tx.insert(billingCredits).values({
          orgId: org.id, amountCents: creditCents, kind: "sla", reason,
          createdByUserId: p.userId,
          note: `Outage run ${runId}: ${outageMinutes} min × KES ${(monthlyCents / 100).toLocaleString("en-KE")}/mo ÷ ${minutesInMonth} min/mo × ${d.multiplier}×`,
        }).returning();

        let accessUntilBumped: string | null = null;
        if (d.bumpAccessUntil) {
          const base = org.accessUntil && org.accessUntil.getTime() > Date.now() ? org.accessUntil : new Date();
          const bumped = new Date(base.getTime() + outageMinutes * 60_000);
          await tx.update(organizations).set({ accessUntil: bumped }).where(eq(organizations.id, org.id));
          accessUntilBumped = bumped.toISOString();
        }

        await writeAudit(tx, {
          orgId: org.id, action: "SUPER_OUTAGE_CREDIT_RUN", entity: "billing_credits", entityId: credit.id,
          actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
          detail: `${runId}: ${outageMinutes} min outage, ${d.multiplier}× — KES ${(creditCents / 100).toLocaleString("en-KE")} credit${accessUntilBumped ? `, access extended to ${accessUntilBumped}` : ""}`,
          after: { runId, creditCents, outageMinutes, multiplier: d.multiplier, accessUntilBumped },
        });

        totalCreditedCents += creditCents;
        results.push({ orgId: org.id, orgName: org.name, creditCents });
      }
    });

    res.status(201).json({
      runId, outageMinutes, minutesInMonth, multiplier: d.multiplier, reason,
      orgsConsidered: candidates.length,
      orgsCredited: results.filter((r) => r.creditCents > 0).length,
      totalCreditedCents,
      results,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
