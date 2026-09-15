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
import { and, count, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { billingCharges, employees, organizations } from "@workspace/db/schema";
import { cycleChargeCents, effectiveMonthlyCents, extendAccessForPayment } from "./pricing.js";
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
  /** How much of a billing cycle this payment actually bought. */
  cyclesPaid: number;
  /** The charge this payment closed, if it covered one. */
  chargeId: number | null;
  chargeStatus: "paid" | "open" | null;
  shortfallCents: number;
}

/**
 * What one billing cycle costs this org, in KES cents — the server's own
 * figure, never the client's.
 *
 * The oldest open charge wins when there is one: that is the frozen bill the
 * billing run wrote, and it is what the customer actually owes. Falling back to
 * the live rate card covers an org the run has not reached yet (a new signup,
 * a trial that just ended) and returns 0 for anyone on Trial or Free, which
 * extendAccessForPayment() reads as "nothing to fall short of".
 */
export async function cycleAmountOwed(orgId: number): Promise<number> {
  const [charge] = await db
    .select({ cycleAmountCents: billingCharges.cycleAmountCents })
    .from(billingCharges)
    .where(and(eq(billingCharges.orgId, orgId), eq(billingCharges.status, "open")))
    .orderBy(billingCharges.period)
    .limit(1);
  if (charge) return charge.cycleAmountCents;

  const [org] = await db
    .select({ plan: organizations.plan, billingCycle: organizations.billingCycle, monthlyCharge: organizations.monthlyCharge })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return 0;

  const [{ cnt: activeEmployees }] = await db
    .select({ cnt: count() })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));

  const monthly = effectiveMonthlyCents({
    plan: org.plan,
    activeEmployees,
    overrideCents: org.monthlyCharge ?? 0,
  });
  return cycleChargeCents(monthly, org.billingCycle ?? "monthly");
}

/**
 * Push the org's access window forward, reactivate it, consume open credits and
 * close the period this payment settles.
 *
 * How far the window moves is decided by the amount, not by the fact that a
 * payment happened. It used to be the latter, and the amount was attacker-
 * controlled from two directions — /mpesa/initiate read it out of the request
 * body, and a Paybill payer types their own figure — so KES 1 bought a whole
 * month. See extendAccessForPayment().
 *
 * Credit consumption and charge settlement remain non-blocking: they record
 * what the payment covered, they do not gate it.
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

  const cycle = orgBefore?.billingCycle ?? "monthly";
  const owedCents = await cycleAmountOwed(orgId);
  const { until: accessUntil, cyclesPaid, shortfallCents } =
    extendAccessForPayment(orgBefore?.accessUntil ?? null, cycle, owedCents, amountCents);

  await db.transaction(async (tx) => {
    await tx.update(organizations)
      .set({ status: "active", accessUntil })
      .where(eq(organizations.id, orgId));

    await writeAudit(tx as any, {
      orgId, action: "ORG_ACCESS_UNTIL_SET", entity: "organizations", entityId: orgId,
      actorUserId: actor.userId, actorEmail: actor.email, actorIp: actor.ip,
      detail: shortfallCents > 0
        ? `Extended by ${detail} — short ${shortfallCents} cents of ${owedCents}, so ${cyclesPaid.toFixed(2)} of a cycle`
        : `Extended by ${detail}`,
      before: { accessUntil: orgBefore?.accessUntil ?? null },
      after: { accessUntil, owedCents, paidCents: amountCents, cyclesPaid },
    });

    await consumeCreditsForPayment(tx, orgId, paymentId, amountCents, actor);
  });

  const settled = await settleChargeForPayment(orgId, paymentId, amountCents);

  if (shortfallCents > 0) {
    logger.warn(
      { orgId, paymentId, owedCents, paidCents: amountCents, shortfallCents, cyclesPaid, accessUntil },
      "payment-settlement: short payment — access extended proportionally",
    );
  }
  logger.info(
    { orgId, paymentId, accessUntil, cyclesPaid, chargeId: settled?.chargeId ?? null },
    "payment-settlement: applied",
  );

  return {
    accessUntil,
    cyclesPaid,
    chargeId: settled?.chargeId ?? null,
    chargeStatus: settled?.status ?? null,
    // The charge row's own shortfall when there is one, else what this payment
    // fell short of the cycle price.
    shortfallCents: settled?.shortfallCents ?? shortfallCents,
  };
}
