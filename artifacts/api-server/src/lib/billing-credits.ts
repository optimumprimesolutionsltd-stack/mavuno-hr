import { and, eq, asc, count } from "drizzle-orm";
import { organizations, employees, billingCredits } from "@workspace/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { effectiveMonthlyCents, cycleChargeCents } from "./pricing.js";
import { writeAudit } from "./audit.js";

type Tx = NodePgDatabase<typeof schema>;

export interface ExpectedForOrg {
  expectedCents: number;      // what the org owes for one cycle at its current headcount/plan
  openCreditCents: number;    // sum of all open credits
  netExpectedCents: number;   // max(0, expected - credits applied, oldest first, capped at expected)
}

/**
 * docs/design/super-admin-org-lifecycle.md §4, "How a credit gets consumed"
 * steps 1-2 — advisory only. Shown to the super-admin before they verify a
 * payment; does not write anything.
 */
export async function computeExpectedForOrg(tx: Tx, orgId: number): Promise<ExpectedForOrg> {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return { expectedCents: 0, openCreditCents: 0, netExpectedCents: 0 };

  const [{ cnt: activeEmployees }] = await tx.select({ cnt: count() }).from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));

  const monthly = effectiveMonthlyCents({
    plan: org.plan, activeEmployees, overrideCents: org.monthlyCharge ?? 0,
  });
  const expectedCents = cycleChargeCents(monthly, org.billingCycle ?? "monthly");

  const openCredits = await tx.select({ amountCents: billingCredits.amountCents }).from(billingCredits)
    .where(and(eq(billingCredits.orgId, orgId), eq(billingCredits.status, "open")));
  const openCreditCents = openCredits.reduce((s, c) => s + c.amountCents, 0);

  const netExpectedCents = Math.max(0, expectedCents - Math.min(openCreditCents, expectedCents));
  return { expectedCents, openCreditCents, netExpectedCents };
}

/**
 * docs/design/super-admin-org-lifecycle.md §4 step 3-4 — call this AFTER a
 * payment has actually been verified (never before; this never blocks or
 * gates verification, it only records which open credits that payment
 * happened to cover). Consumes open credits oldest-first up to the payment
 * amount. A credit bigger than what's left to cover is split: the consumed
 * part closes on the original row, the remainder is re-inserted as a fresh
 * open credit (the schema has no "remaining balance" column, so a split is
 * modeled as two rows rather than mutating amountCents on an open credit).
 *
 * Deliberately NOT a gate on anything else — the caller still extends
 * access_until regardless of whether the payment covered netExpectedCents.
 * Tying access to an exact expected amount would risk blocking legitimate
 * payments over a rounding difference or an old rate card figure; that's a
 * bigger, separate decision this phase does not make.
 */
export async function consumeCreditsForPayment(
  tx: Tx,
  orgId: number,
  paymentId: number,
  paymentCents: number,
  actor: { userId: number | null; email: string; ip: string | null },
): Promise<{ consumedCents: number }> {
  const openCredits = await tx.select().from(billingCredits)
    .where(and(eq(billingCredits.orgId, orgId), eq(billingCredits.status, "open")))
    .orderBy(asc(billingCredits.createdAt));

  let remaining = paymentCents;
  let consumedTotal = 0;
  const now = new Date();

  for (const c of openCredits) {
    if (remaining <= 0) break;

    if (c.amountCents <= remaining) {
      // Fully consumed.
      await tx.update(billingCredits)
        .set({ status: "applied", appliedToPaymentId: paymentId, appliedAt: now })
        .where(eq(billingCredits.id, c.id));
      remaining -= c.amountCents;
      consumedTotal += c.amountCents;

      await writeAudit(tx, {
        orgId, action: "BILLING_CREDIT_APPLIED", entity: "billing_credits", entityId: c.id,
        actorUserId: actor.userId, actorEmail: actor.email, actorIp: actor.ip,
        detail: `Fully applied to payment #${paymentId}`,
        before: { status: "open", amountCents: c.amountCents },
        after: { status: "applied", amountCents: c.amountCents, appliedToPaymentId: paymentId },
      });
    } else {
      // Split: the consumed part closes on this row, the remainder becomes a
      // new open credit so the customer keeps the rest for next time.
      const consumedPart = remaining;
      const remainderPart = c.amountCents - remaining;

      await tx.update(billingCredits)
        .set({ amountCents: consumedPart, status: "applied", appliedToPaymentId: paymentId, appliedAt: now })
        .where(eq(billingCredits.id, c.id));

      const [split] = await tx.insert(billingCredits).values({
        orgId, amountCents: remainderPart, currency: c.currency, kind: c.kind,
        reason: c.reason, period: c.period, status: "open",
        createdByUserId: c.createdByUserId,
        note: `Split from credit #${c.id} (${c.reason})`,
      }).returning({ id: billingCredits.id });

      consumedTotal += consumedPart;
      remaining = 0;

      await writeAudit(tx, {
        orgId, action: "BILLING_CREDIT_APPLIED", entity: "billing_credits", entityId: c.id,
        actorUserId: actor.userId, actorEmail: actor.email, actorIp: actor.ip,
        detail: `Partially applied to payment #${paymentId}; remaining split into credit #${split.id}`,
        before: { status: "open", amountCents: c.amountCents },
        after: { status: "applied", amountCents: consumedPart, appliedToPaymentId: paymentId, splitIntoCreditId: split.id },
      });
    }
  }

  return { consumedCents: consumedTotal };
}
