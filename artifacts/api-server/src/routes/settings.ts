import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, isNull, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations, statutoryConfigs } from "@workspace/db/schema";
import { requireAuth, getIp, type AuthRequest } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { HttpError } from "../lib/http-error.js";

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
});

router.patch("/org", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const body = updateOrgSchema.parse(req.body);

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
    const body = statutoryOverrideSchema.parse(req.body);

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

export default router;
