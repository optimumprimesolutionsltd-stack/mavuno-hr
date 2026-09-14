/**
 * What a verified payment does, in one place.
 *
 * There are four ways a payment becomes verified — a super-admin verifying a
 * bank transfer, the STK Push callback, the fallback poller that recovers a
 * lost callback, and now a Paybill (C2B) confirmation. Each grew its own copy
 * of the same three steps, and they had already drifted: the poller reactivated
 * the org but never pushed `access_until` forward, leaving a paying customer
 * looking active and still locked out by requireActiveAccess().
 *
 * Money and access only. Receipt emails stay with the caller — each path has a
 * different set of details to hand the mailer, and a failed email must never
 * roll back a successful payment.
 */
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
import { extendAccessUntil } from "./pricing.js";
import { consumeCreditsForPayment } from "./billing-credits.js";
import { settleChargeForPayment } from "./billing-run.js";
import { writeAudit } from "./audit.js";
import { logger } from "./logger.js";

export interface SettlementActor {
  userId: number | null;
  email: string;
  ip: string | null;
}

export interface SettlementResult {
  accessUntil: Date;
  /** The charge this payment closed, if it covered one. */
  chargeId: number | null;
  chargeStatus: "paid" | "open" | null;
  shortfallCents: number;
}

/**
 * Push the org's access window forward, reactivate it, consume open credits and
 * close the period this payment settles.
 *
 * Credit consumption and charge settlement are both deliberately
 * non-blocking: neither gates the access extension. Tying access to an exact
 * expected amount would risk locking out a legitimate payment over a rounding
 * difference or a stale rate-card figure — a bigger decision than this makes.
 */
export async function applyVerifiedPayment(args: {
  orgId: number;
  paymentId: number;
  amountCents: number;
  actor: SettlementActor;
  /** Description for the audit entry, e.g. "M-Pesa payment SFC1A2B3C4". */
  detail: string;
}): Promise<SettlementResult> {
  const { orgId, paymentId, amountCents, actor, detail } = args;

  const [orgBefore] = await db
    .select({ accessUntil: organizations.accessUntil, billingCycle: organizations.billingCycle, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const accessUntil = extendAccessUntil(orgBefore?.accessUntil ?? null, orgBefore?.billingCycle ?? "monthly");

  await db.transaction(async (tx) => {
    await tx.update(organizations)
      .set({ status: "active", accessUntil })
      .where(eq(organizations.id, orgId));

    await writeAudit(tx as any, {
      orgId, action: "ORG_ACCESS_UNTIL_SET", entity: "organizations", entityId: orgId,
      actorUserId: actor.userId, actorEmail: actor.email, actorIp: actor.ip,
      detail: `Extended by ${detail}`,
      before: { accessUntil: orgBefore?.accessUntil ?? null },
      after: { accessUntil },
    });

    await consumeCreditsForPayment(tx, orgId, paymentId, amountCents, actor);
  });

  const settled = await settleChargeForPayment(orgId, paymentId, amountCents);

  logger.info(
    { orgId, paymentId, accessUntil, chargeId: settled?.chargeId ?? null },
    "payment-settlement: applied",
  );

  return {
    accessUntil,
    chargeId: settled?.chargeId ?? null,
    chargeStatus: settled?.status ?? null,
    shortfallCents: settled?.shortfallCents ?? 0,
  };
}
