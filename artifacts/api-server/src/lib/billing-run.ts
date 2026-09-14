/**
 * The monthly billing run — docs/design/billing-and-repricing.md §3.
 *
 * Two jobs, once a month, in arrears:
 *
 *   1. REPRICE. `recommendPlan()` has existed since the banded rate card
 *      landed and nothing ever called it, so a Starter org that grew to 40
 *      people kept paying 2,500 + 150x20 = 5,500 — more than Growth's 4,000
 *      flat — and a shrinking org stayed stuck on its old, higher band. The
 *      run moves the plan to the cheapest band that fits, in both directions,
 *      and tells the customer it did.
 *
 *   2. FREEZE. `lib/pricing.ts` computes a price live from *today's* plan and
 *      headcount, which means "amount due" moved retroactively every time
 *      somebody was hired. The run writes one `billing_charges` row per org
 *      per period and nothing recomputes it afterwards.
 *
 * Deliberately NOT here: proration. Plan and headcount are read once per run;
 * anything that changes after it applies to the next period. That is the whole
 * reason the run is safe to re-execute — see `runBillingForPeriod`.
 */
import { and, count, desc, eq, gt, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  billingCharges, billingPayments, employees, notifications, organizations, users,
} from "@workspace/db/schema";
import {
  decideCharge, periodEnd, periodOf, planChangeMessage, previousPeriod,
  type ChargeSkipReason,
} from "./billing-policy.js";
import { writeAudit } from "./audit.js";
import { logger } from "./logger.js";

/** Roles told about a plan move. The people who see the invoice. */
const BILLING_ROLES = ["admin"];

// ── The run ──────────────────────────────────────────────────────────────────

export interface BillingRunSummary {
  period: string;
  orgsConsidered: number;
  chargesCreated: number;
  chargesAlreadyPresent: number;
  plansChanged: number;
  skipped: Record<string, number>;
  errors: number;
}

/**
 * Active employees an org had on the last day of a period.
 *
 * Reconstructed from hire/termination dates rather than today's `status`, so a
 * re-run months later bills the same number it billed the first time. Someone
 * terminated during the period drops off; someone terminated after it still
 * counts for it. A row that is inactive with no termination date at all is not
 * counted — the date is unknowable, so the benefit of the doubt goes to the
 * customer.
 */
export async function headcountAt(orgId: number, at: Date): Promise<number> {
  const asDate = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  const [row] = await db
    .select({ cnt: count() })
    .from(employees)
    .where(and(
      eq(employees.orgId, orgId),
      lte(employees.hireDate, asDate),
      or(
        gt(employees.terminationDate, asDate),
        and(isNull(employees.terminationDate), eq(employees.status, "active")),
      ),
    ));
  return row?.cnt ?? 0;
}

/** Headcount right now — what the *next* charge would be based on. */
export async function currentHeadcount(orgId: number): Promise<number> {
  const [row] = await db
    .select({ cnt: count() })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));
  return row?.cnt ?? 0;
}

async function notifyBillingAdmins(orgId: number, type: string, title: string, body: string): Promise<void> {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), inArray(users.role, BILLING_ROLES)));
  if (admins.length === 0) return;
  await db.insert(notifications).values(
    admins.map((u) => ({ orgId, userId: u.id, type, title, body, link: "/app/admin/billing" })),
  );
}

/**
 * Bill one period for every organisation. Idempotent: the unique index on
 * (org_id, period, cycle) means a second run for the same period inserts
 * nothing, so a restart, a manual catch-up and the scheduled 1st-of-the-month
 * execution are all the same operation.
 *
 * @param period 'YYYY-MM' to bill. Defaults to last month — the run bills in
 *   arrears, on the headcount the org actually finished the month with.
 */
export async function runBillingForPeriod(period?: string): Promise<BillingRunSummary> {
  const now = new Date();
  const target = period ?? previousPeriod(periodOf(now));
  const end = periodEnd(target);

  const summary: BillingRunSummary = {
    period: target,
    orgsConsidered: 0,
    chargesCreated: 0,
    chargesAlreadyPresent: 0,
    plansChanged: 0,
    skipped: {},
    errors: 0,
  };

  const orgs = await db
    .select({
      id: organizations.id,
      plan: organizations.plan,
      billingCycle: organizations.billingCycle,
      monthlyCharge: organizations.monthlyCharge,
      status: organizations.status,
      trialEndsAt: organizations.trialEndsAt,
      deletionScheduledFor: organizations.deletionScheduledFor,
    })
    .from(organizations);

  summary.orgsConsidered = orgs.length;

  for (const org of orgs) {
    try {
      const cycle = org.billingCycle === "annual" ? "annual" : "monthly";

      let lastAnnualChargePeriod: string | null = null;
      if (cycle === "annual") {
        const [last] = await db
          .select({ period: billingCharges.period })
          .from(billingCharges)
          .where(and(
            eq(billingCharges.orgId, org.id),
            eq(billingCharges.cycle, "annual"),
            ne(billingCharges.status, "void"),
          ))
          .orderBy(desc(billingCharges.period))
          .limit(1);
        lastAnnualChargePeriod = last?.period ?? null;
      }

      const headcount = await headcountAt(org.id, end);
      const decision = decideCharge({
        org: { ...org, monthlyCharge: org.monthlyCharge ?? 0 },
        headcount,
        period: target,
        now,
        lastAnnualChargePeriod,
      });

      // The plan move is applied even on a run that writes no charge (a trial
      // that has just elapsed), so the customer's plan is right before their
      // first bill rather than after it.
      if (decision.planChanged) {
        await db.transaction(async (tx) => {
          await tx.update(organizations)
            .set({ plan: decision.planAfter })
            .where(eq(organizations.id, org.id));
          await writeAudit(tx as any, {
            orgId: org.id,
            action: decision.planChangeReason === "trial_ended" ? "PLAN_AUTO_ASSIGNED" : "PLAN_AUTO_ADJUSTED",
            entity: "organization",
            entityId: String(org.id),
            actorUserId: null,
            actorEmail: "billing-run@system",
            actorIp: null,
            detail: `${decision.planBefore} -> ${decision.planAfter} (${headcount} active employees, period ${target})`,
            before: { plan: decision.planBefore },
            after: { plan: decision.planAfter, headcount, period: target },
          });
        });
        const msg = planChangeMessage(decision, headcount);
        await notifyBillingAdmins(
          org.id,
          decision.planChangeReason === "trial_ended" ? "PLAN_AUTO_ASSIGNED" : "PLAN_AUTO_ADJUSTED",
          msg.title,
          msg.body,
        );
        summary.plansChanged += 1;
        logger.info({ orgId: org.id, from: decision.planBefore, to: decision.planAfter, headcount, period: target },
          "billing-run: plan changed");
      }

      if (decision.skip) {
        summary.skipped[decision.skip] = (summary.skipped[decision.skip] ?? 0) + 1;
        continue;
      }

      const inserted = await db.insert(billingCharges).values({
        orgId: org.id,
        period: target,
        cycle,
        plan: decision.planAfter,
        activeEmployees: headcount,
        amountCents: decision.amountCents,
        cycleAmountCents: decision.cycleAmountCents,
        source: decision.source,
        status: "open",
      }).onConflictDoNothing().returning({ id: billingCharges.id });

      if (inserted.length > 0) {
        summary.chargesCreated += 1;
        logger.info({ orgId: org.id, period: target, cycle, amount: decision.cycleAmountCents }, "billing-run: charge created");
      } else {
        summary.chargesAlreadyPresent += 1;
      }
    } catch (err) {
      // One org must not stop the rest. The next run retries it — nothing has
      // been written for it, and the insert is idempotent either way.
      summary.errors += 1;
      logger.error({ err, orgId: org.id, period: target }, "billing-run: org failed, will retry next run");
    }
  }

  logger.info(summary, "billing-run: finished");
  return summary;
}

/**
 * What the next run will bill this org, at today's headcount — design §4's
 * `nextChargeProjection`. Read-only: it changes nothing, it just stops the
 * price change being a surprise on the invoice.
 */
export async function projectNextCharge(orgId: number): Promise<{
  period: string;
  plan: string;
  changingFrom: string | null;
  activeEmployees: number;
  amountCents: number;
  cycleAmountCents: number;
  cycle: string;
  source: "rate_card" | "override";
  /** Null when there is nothing to project — a trial still running, a suspended org. */
  skip: ChargeSkipReason | null;
} | null> {
  const [org] = await db
    .select({
      id: organizations.id,
      plan: organizations.plan,
      billingCycle: organizations.billingCycle,
      monthlyCharge: organizations.monthlyCharge,
      status: organizations.status,
      trialEndsAt: organizations.trialEndsAt,
      deletionScheduledFor: organizations.deletionScheduledFor,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const now = new Date();
  // The next run happens on the 1st of next month and bills this month.
  const target = periodOf(now);
  const cycle = org.billingCycle === "annual" ? "annual" : "monthly";

  let lastAnnualChargePeriod: string | null = null;
  if (cycle === "annual") {
    const [last] = await db
      .select({ period: billingCharges.period })
      .from(billingCharges)
      .where(and(
        eq(billingCharges.orgId, orgId),
        eq(billingCharges.cycle, "annual"),
        ne(billingCharges.status, "void"),
      ))
      .orderBy(desc(billingCharges.period))
      .limit(1);
    lastAnnualChargePeriod = last?.period ?? null;
  }

  const headcount = await currentHeadcount(orgId);
  const d = decideCharge({
    org: { ...org, monthlyCharge: org.monthlyCharge ?? 0 },
    headcount,
    period: target,
    now,
    lastAnnualChargePeriod,
  });

  return {
    period: target,
    plan: d.planAfter,
    changingFrom: d.planChanged ? d.planBefore : null,
    activeEmployees: headcount,
    amountCents: d.amountCents,
    cycleAmountCents: d.cycleAmountCents,
    cycle,
    source: d.source,
    skip: d.skip,
  };
}

/**
 * Settle a verified payment against the org's oldest open charge.
 *
 * Deliberately best-effort and non-blocking, like credit consumption: it never
 * gates the payment or the access extension. A payment that covers the charge
 * closes it; a short payment leaves it open with the shortfall still visible.
 * Partial payments are not accumulated across rows in this version — the
 * charge closes only when one payment covers it.
 */
export async function settleChargeForPayment(
  orgId: number,
  paymentId: number,
  paymentCents: number,
): Promise<{ chargeId: number; status: "paid" | "open"; shortfallCents: number } | null> {
  try {
    const [charge] = await db
      .select()
      .from(billingCharges)
      .where(and(eq(billingCharges.orgId, orgId), eq(billingCharges.status, "open")))
      .orderBy(billingCharges.period)
      .limit(1);
    if (!charge) return null;

    const covers = paymentCents >= charge.cycleAmountCents;
    const now = new Date();

    await db.transaction(async (tx) => {
      if (covers) {
        await tx.update(billingCharges)
          .set({ status: "paid", paidAt: now })
          .where(eq(billingCharges.id, charge.id));
      }
      await tx.update(billingPayments)
        .set({ chargeId: charge.id })
        .where(eq(billingPayments.id, paymentId));
    });

    return {
      chargeId: charge.id,
      status: covers ? "paid" : "open",
      shortfallCents: Math.max(0, charge.cycleAmountCents - paymentCents),
    };
  } catch (err) {
    logger.error({ err, orgId, paymentId }, "billing-run: settling charge failed (non-fatal)");
    return null;
  }
}

/**
 * Run at startup (catch-up, in case the process was down on the 1st) and then
 * hourly, self-gating on "have we already billed last month?" — the same shape
 * as scheduleFilingReminders / scheduleOrgPurge. The idempotent insert means an
 * extra execution costs a query, not a second bill.
 */
export function scheduleBillingRun(): void {
  const tick = () =>
    runBillingForPeriod().catch((err) =>
      logger.error({ err }, "billing-run: scheduled execution failed (non-fatal)"),
    );
  tick();
  setInterval(tick, 60 * 60 * 1000);
}
