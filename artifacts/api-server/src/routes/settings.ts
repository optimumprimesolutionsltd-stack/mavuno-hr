import { Router } from "express";
import { z } from "zod";
import { eq, ne, and, gte, desc, isNull, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations, statutoryConfigs, payrollRuns } from "@workspace/db/schema";
import { requireAuth, getIp, type AuthRequest } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { accountReferenceFor } from "../lib/mpesa.js";
import { HttpError } from "../lib/http-error.js";
import { DELETION_GRACE_DAYS, deletionDateFrom } from "../lib/org-purge.js";

const router = Router();

// ── GET /api/settings ─────────────────────────────────────────────────────────
// Returns org profile + active statutory config info
router.get("/", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, p.orgId))
      .limit(1);

    if (!org) throw new HttpError(404, "Organization not found");

    // Use resolveConfig — it enforces (orgId IS NULL OR orgId = current),
    // effectiveFrom <= today, effectiveTo coverage, and org-override priority.
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    let resolved: { id: number; config: any } | null = null;
    try {
      resolved = await resolveConfig(db as any, p.orgId, org.countryCode, period);
    } catch (_) {
      // No statutory config on file — surface gracefully
    }

    // Check if an org-specific override exists (for the badge)
    const [orgOverride] = await db
      .select({ id: statutoryConfigs.id })
      .from(statutoryConfigs)
      .where(and(
        eq(statutoryConfigs.countryCode, org.countryCode),
        eq(statutoryConfigs.orgId as any, p.orgId),
      ))
      .orderBy(desc(statutoryConfigs.effectiveFrom))
      .limit(1);

    const cfg = resolved?.config as any ?? null;

    res.json({
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        countryCode: org.countryCode,
        currencyCode: org.currencyCode,
        kraPin: org.kraPin ?? "",
        nssfEmployerNo: org.nssfEmployerNo ?? "",
        shifEmployerNo: org.shifEmployerNo ?? "",
        plan: org.plan,
        status: org.status,
        billingRef: accountReferenceFor(org.id),
        requiresPayrollApproval: org.requiresPayrollApproval,
        payrollStartPeriod: org.payrollStartPeriod,
        autoGeneratePayoutOnPay: org.autoGeneratePayoutOnPay,
        autoEmailPayslipsOnPay: org.autoEmailPayslipsOnPay,
      },
      activeConfig: cfg,
      tier2Provider: cfg?.socialSecurity?.tier2Provider ?? "nssf",
      tier2ProviderName: cfg?.socialSecurity?.tier2ProviderName ?? "",
      hasOrgOverride: !!orgOverride,
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/settings/org ───────────────────────────────────────────────────
const updateOrgSchema = z.object({
  name:           z.string().min(1).max(200).optional(),
  kraPin:         z.string().max(20).nullable().optional(),
  nssfEmployerNo: z.string().max(50).nullable().optional(),
  shifEmployerNo: z.string().max(50).nullable().optional(),
  requiresPayrollApproval: z.boolean().optional(),
  payrollStartPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
  autoGeneratePayoutOnPay: z.boolean().optional(),
  autoEmailPayslipsOnPay: z.boolean().optional(),
});

router.patch("/org", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = updateOrgSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const body = parsed.data;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, p.orgId))
      .limit(1);

    if (!org) throw new HttpError(404, "Organization not found");

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined)           updates.name = body.name;
    if (body.kraPin !== undefined)         updates.kraPin = body.kraPin ?? null;
    if (body.nssfEmployerNo !== undefined) updates.nssfEmployerNo = body.nssfEmployerNo ?? null;
    if (body.shifEmployerNo !== undefined) updates.shifEmployerNo = body.shifEmployerNo ?? null;
    if (body.requiresPayrollApproval !== undefined) updates.requiresPayrollApproval = body.requiresPayrollApproval;
    if (body.autoGeneratePayoutOnPay !== undefined) updates.autoGeneratePayoutOnPay = body.autoGeneratePayoutOnPay;
    if (body.autoEmailPayslipsOnPay !== undefined) updates.autoEmailPayslipsOnPay = body.autoEmailPayslipsOnPay;

    if (body.payrollStartPeriod !== undefined) {
      const next = body.payrollStartPeriod ?? null;
      if (next) {
        // A historical run for a month >= the new cutover would be nonsense
        // ("migrated" data for a month Mavuno supposedly owns). Block it.
        const [clash] = await db.select({ period: payrollRuns.period }).from(payrollRuns).where(and(
          eq(payrollRuns.orgId, p.orgId),
          eq(payrollRuns.runType, "historical"),
          ne(payrollRuns.status, "reversed"),
          gte(payrollRuns.period, next),
        )).limit(1);
        if (clash) {
          throw new HttpError(
            422,
            `Cannot set the payroll start month to ${next}: a historical run already exists for ${clash.period}. ` +
              `Reverse it first, or choose an earlier month.`,
            "HISTORICAL_RUNS_AFTER_CUTOFF",
          );
        }
      }
      updates.payrollStartPeriod = next;
    }

    if (Object.keys(updates).length === 0) return void res.json({ ok: true });

    await db.transaction(async (tx) => {
      await tx.update(organizations).set(updates as any).where(eq(organizations.id, p.orgId));
      await writeAudit(tx as any, {
        orgId: p.orgId,
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        action: "ORG_UPDATED",
        entity: "organization",
        entityId: String(p.orgId),
        detail: `Updated: ${Object.keys(updates).join(", ")}`,
        before: {
          name: org.name,
          kraPin: org.kraPin,
          nssfEmployerNo: org.nssfEmployerNo,
          shifEmployerNo: org.shifEmployerNo,
          requiresPayrollApproval: org.requiresPayrollApproval,
          payrollStartPeriod: org.payrollStartPeriod,
          autoGeneratePayoutOnPay: org.autoGeneratePayoutOnPay,
          autoEmailPayslipsOnPay: org.autoEmailPayslipsOnPay,
        },
        after: updates,
      });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/settings/statutory-override ────────────────────────────────────
const statutoryOverrideSchema = z.object({
  tier2Provider:    z.enum(["nssf", "private"]),
  tier2ProviderName: z.string().max(200).optional(),
});

router.post("/statutory-override", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = statutoryOverrideSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const body = parsed.data;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, p.orgId))
      .limit(1);

    if (!org) throw new HttpError(404, "Organization not found");

    const today = new Date().toISOString().slice(0, 10);

    if (body.tier2Provider === "nssf") {
      // Remove any existing org override
      await db
        .delete(statutoryConfigs)
        .where(and(
          eq(statutoryConfigs.countryCode, org.countryCode),
          eq(statutoryConfigs.orgId as any, p.orgId),
        ));

      await db.transaction(async (tx) => {
        await writeAudit(tx as any, {
          orgId: p.orgId,
          actorUserId: p.userId,
          actorEmail: p.email,
          actorIp: getIp(req),
          action: "STATUTORY_OVERRIDE_REMOVED",
          entity: "statutory_config",
          detail: "Removed org override; reverted to standard NSSF Tier II",
        });
      });

      return void res.json({ ok: true, tier2Provider: "nssf" });
    }

    // Get the global base config to clone
    const [globalRow] = await db
      .select()
      .from(statutoryConfigs)
      .where(and(
        eq(statutoryConfigs.countryCode, org.countryCode),
        isNull(statutoryConfigs.orgId),
        lte(statutoryConfigs.effectiveFrom, today),
      ))
      .orderBy(desc(statutoryConfigs.effectiveFrom))
      .limit(1);

    if (!globalRow) throw new HttpError(422, "No statutory configuration found for this country");

    const baseCfg = globalRow.config as any;
    const patchedConfig = {
      ...baseCfg,
      socialSecurity: {
        ...baseCfg.socialSecurity,
        tier2Provider: body.tier2Provider,
        tier2ProviderName: body.tier2ProviderName ?? "Private Pension Fund",
      },
    };

    // Upsert org-specific override
    const [existing] = await db
      .select({ id: statutoryConfigs.id })
      .from(statutoryConfigs)
      .where(and(
        eq(statutoryConfigs.countryCode, org.countryCode),
        eq(statutoryConfigs.orgId as any, p.orgId),
      ))
      .limit(1);

    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(statutoryConfigs)
          .set({ config: patchedConfig })
          .where(eq(statutoryConfigs.id, existing.id));
      } else {
        await tx.insert(statutoryConfigs).values({
          orgId: p.orgId,
          countryCode: org.countryCode,
          name: `${baseCfg.name} [org override]`,
          effectiveFrom: baseCfg.effectiveFrom ?? globalRow.effectiveFrom,
          config: patchedConfig,
        });
      }

      await writeAudit(tx as any, {
        orgId: p.orgId,
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        action: "STATUTORY_OVERRIDE_SET",
        entity: "statutory_config",
        detail: `Tier II provider set to "${body.tier2Provider}"${body.tier2ProviderName ? ` — ${body.tier2ProviderName}` : ""}`,
      });
    });

    res.json({ ok: true, tier2Provider: body.tier2Provider, tier2ProviderName: body.tier2ProviderName });
  } catch (err) { next(err); }
});


// ── Account deletion ──────────────────────────────────────────────────────────
// The Data Protection Act gives a right to erasure and the privacy policy
// promises it. Before this, honouring a request meant someone running SQL by
// hand, so the policy had to admit deletion was manual. This makes it the
// customer's to schedule and theirs to reverse.
//
// Scheduled rather than immediate, for a reason specific to payroll: the data
// is not recreatable. An employer who deletes and then needs a P9 for a former
// employee has no second copy, and Kenyan tax law still expects them to produce
// records for years afterwards. The grace period is the window to change their
// mind or get an export out.

// GET /api/settings/deletion — is one scheduled?
router.get("/deletion", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const [org] = await db
      .select({
        requestedAt: organizations.deletionRequestedAt,
        scheduledFor: organizations.deletionScheduledFor,
        requestedBy: organizations.deletionRequestedBy,
      })
      .from(organizations)
      .where(eq(organizations.id, p.orgId))
      .limit(1);

    if (!org) throw new HttpError(404, "Organization not found");

    res.json({
      scheduled: org.scheduledFor !== null,
      requestedAt: org.requestedAt,
      scheduledFor: org.scheduledFor,
      requestedByUserId: org.requestedBy,
      graceDays: DELETION_GRACE_DAYS,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/deletion — schedule it.
router.post("/deletion", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = z.object({ confirmName: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(422, "Type the company name to confirm");
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, p.orgId))
      .limit(1);
    if (!org) throw new HttpError(404, "Organization not found");

    // Typing the name is the whole safeguard. It is not security — an admin is
    // already authenticated — it is friction, so that deleting every payroll
    // record the company has cannot happen on a misclick.
    if (parsed.data.confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
      throw new HttpError(422, "The name entered does not match this company's name");
    }

    if (org.deletionScheduledFor) {
      throw new HttpError(409, "Deletion is already scheduled for this organisation");
    }

    const requestedAt = new Date();
    const scheduledFor = deletionDateFrom(requestedAt);

    // One transaction: a scheduled deletion with no audit entry, or an entry
    // with nothing scheduled, would both be worse than failing outright.
    await db.transaction(async (tx) => {
      await tx
        .update(organizations)
        .set({
          deletionRequestedAt: requestedAt,
          deletionScheduledFor: scheduledFor,
          deletionRequestedBy: p.userId,
        })
        .where(eq(organizations.id, p.orgId));

      // The audit log is itself inside the cascade and will not survive the
      // purge. Until then it is the record of who asked and when.
      await writeAudit(tx as any, {
        orgId: p.orgId,
        action: "ORG_DELETION_REQUESTED",
        entity: "organization",
        entityId: String(p.orgId),
        detail: `Deletion scheduled for ${scheduledFor.toISOString()}`,
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        before: null,
        after: { deletionScheduledFor: scheduledFor },
      });
    });

    res.json({ scheduled: true, requestedAt, scheduledFor, graceDays: DELETION_GRACE_DAYS });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/settings/deletion — call it off.
router.delete("/deletion", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const [org] = await db
      .select({ scheduledFor: organizations.deletionScheduledFor })
      .from(organizations)
      .where(eq(organizations.id, p.orgId))
      .limit(1);
    if (!org) throw new HttpError(404, "Organization not found");
    if (!org.scheduledFor) throw new HttpError(409, "No deletion is scheduled");

    await db.transaction(async (tx) => {
      await tx
        .update(organizations)
        .set({
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          deletionRequestedBy: null,
        })
        .where(eq(organizations.id, p.orgId));

      await writeAudit(tx as any, {
        orgId: p.orgId,
        action: "ORG_DELETION_CANCELLED",
        entity: "organization",
        entityId: String(p.orgId),
        detail: "Scheduled deletion cancelled",
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        before: { deletionScheduledFor: org.scheduledFor },
        after: null,
      });
    });

    res.json({ scheduled: false });
  } catch (err) {
    next(err);
  }
});

export default router;
