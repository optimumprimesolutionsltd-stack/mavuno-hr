/**
 * Billing-run policy — docs/design/billing-and-repricing.md §3.
 *
 * Every rule the monthly run applies lives here, as pure functions: what band
 * an org should be on, what it owes for a period, and which periods are not
 * billable at all. No database, no clock of its own — `billing-run.ts` supplies
 * both and does the writing.
 *
 * The split is the same one payroll already uses (`payroll.ts` decides,
 * `payroll-run.ts` persists), and for the same reason: the arguable half is
 * then testable without provisioning a database.
 */
import {
  PLAN_LABELS, cycleChargeCents, effectiveMonthlyCents, recommendPlan,
} from "./pricing.js";

// ── Period arithmetic ────────────────────────────────────────────────────────
// Periods are 'YYYY-MM' strings, the same shape payroll runs already use, and
// are built from local date parts rather than toISOString() so a server running
// in Nairobi (UTC+3) does not bill December on the 1st of January.

export function periodOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** First instant of a period, local time. */
export function periodStart(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

/** Last instant of a period, local time. */
export function periodEnd(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999);
}

/** Whole months from `from` to `to`, both 'YYYY-MM'. Negative if `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// ── The decision ─────────────────────────────────────────────────────────────

export interface OrgBillingState {
  id: number;
  plan: string;
  billingCycle: string;
  /** Negotiated per-org override in KES cents. 0 = use the rate card. */
  monthlyCharge: number;
  status: string;
  trialEndsAt: Date | null;
  deletionScheduledFor: Date | null;
}

export type ChargeSkipReason =
  | "not_active"        // suspended / lapsed org — they can't use the product
  | "pending_deletion"  // asked to be deleted; don't bill them on the way out
  | "trial"             // the trial was still running during the billed period
  | "mid_annual_term";  // annual customer, not their renewal month

export interface ChargeDecision {
  /** null = write a charge. Otherwise why this org is skipped this period. */
  skip: ChargeSkipReason | null;
  planBefore: string;
  planAfter: string;
  planChanged: boolean;
  /** Why the plan moved — decides which message the customer gets. */
  planChangeReason: "trial_ended" | "grew" | "shrank" | null;
  amountCents: number;
  cycleAmountCents: number;
  source: "rate_card" | "override";
}

/**
 * Pure: given an org, its headcount for the period and the period itself, what
 * should happen? No database, no clock beyond what's passed in — everything the
 * run does that is worth arguing about is decided here, and tested here.
 */
export function decideCharge(args: {
  org: OrgBillingState;
  /** Active employees on the last day of the billed period. */
  headcount: number;
  /** The period being billed, 'YYYY-MM'. */
  period: string;
  /** When the run is happening. Only used to ask "has the trial ended yet?". */
  now: Date;
  /** Period of this org's most recent annual charge, if any. */
  lastAnnualChargePeriod: string | null;
}): ChargeDecision {
  const { org, headcount, period, now, lastAnnualChargePeriod } = args;
  const overrideCents = org.monthlyCharge ?? 0;
  const hasOverride = overrideCents > 0;
  const cycle = org.billingCycle === "annual" ? "annual" : "monthly";

  const unchanged = (skip: ChargeSkipReason | null, plan = org.plan): ChargeDecision => {
    const amountCents = effectiveMonthlyCents({ plan, activeEmployees: headcount, overrideCents });
    return {
      skip,
      planBefore: org.plan,
      planAfter: plan,
      planChanged: plan !== org.plan,
      planChangeReason: null,
      amountCents,
      cycleAmountCents: cycleChargeCents(amountCents, cycle),
      source: hasOverride ? "override" : "rate_card",
    };
  };

  if (org.status !== "active") return unchanged("not_active");
  // An org inside its deletion grace period is on its way out. Billing it for
  // the month it spent deciding to leave is the wrong last impression, and the
  // charge row would be cascaded away by the purge anyway.
  if (org.deletionScheduledFor) return unchanged("pending_deletion");

  // Annual customers are only touched in their renewal month. Headcount growth
  // during a term trues up at the renewal, using the then-current plan — no
  // mid-term overage bill, and no mid-term repricing either (design §3.4).
  if (cycle === "annual" && lastAnnualChargePeriod !== null
      && monthsBetween(lastAnnualChargePeriod, period) < 12) {
    return unchanged("mid_annual_term");
  }

  // Trial. No charge for any period the trial was still running in — the first
  // charge is the period *after* it ends. A null trialEndsAt is an open-ended
  // trial (super-admin provisioned, no end date): never auto-charged, never
  // auto-assigned a plan, because nobody has told the customer it's over.
  if (org.plan === "trial") {
    const trialEndsAt = org.trialEndsAt;
    if (!trialEndsAt) return unchanged("trial");

    const trialLiveDuringPeriod = trialEndsAt.getTime() > periodStart(period).getTime();
    // Once the trial has actually elapsed, assign the band that fits — even on
    // a run that writes no charge — so the customer sees their real plan and
    // price before the first bill lands, rather than after it.
    const assigned = trialEndsAt.getTime() <= now.getTime() && !hasOverride
      ? recommendPlan(headcount)
      : org.plan;

    if (trialLiveDuringPeriod) {
      const d = unchanged("trial", assigned);
      return { ...d, planChangeReason: d.planChanged ? "trial_ended" : null };
    }

    const amountCents = effectiveMonthlyCents({ plan: assigned, activeEmployees: headcount, overrideCents });
    return {
      skip: null,
      planBefore: org.plan,
      planAfter: assigned,
      planChanged: assigned !== org.plan,
      planChangeReason: assigned !== org.plan ? "trial_ended" : null,
      amountCents,
      cycleAmountCents: cycleChargeCents(amountCents, cycle),
      source: hasOverride ? "override" : "rate_card",
    };
  }

  // Repricing. Skipped entirely under a negotiated override: that price was
  // agreed with a human and a band move would silently contradict it.
  let planAfter = org.plan;
  let planChangeReason: ChargeDecision["planChangeReason"] = null;
  if (!hasOverride) {
    const next = recommendPlan(headcount);
    if (next !== org.plan) {
      planAfter = next;
      planChangeReason =
        effectiveMonthlyCents({ plan: next, activeEmployees: headcount, overrideCents: 0 })
          >= effectiveMonthlyCents({ plan: org.plan, activeEmployees: headcount, overrideCents: 0 })
          ? "grew"
          : "shrank";
    }
  }

  const amountCents = effectiveMonthlyCents({ plan: planAfter, activeEmployees: headcount, overrideCents });
  return {
    skip: null,
    planBefore: org.plan,
    planAfter,
    planChanged: planAfter !== org.plan,
    planChangeReason,
    amountCents,
    cycleAmountCents: cycleChargeCents(amountCents, cycle),
    source: hasOverride ? "override" : "rate_card",
  };
}

function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

/** What the customer is told when the run moves their band. */
export function planChangeMessage(d: ChargeDecision, headcount: number): { title: string; body: string } {
  const label = PLAN_LABELS[d.planAfter] ?? d.planAfter;
  const price = `${formatKes(d.amountCents)}/month`;
  if (d.planChangeReason === "trial_ended") {
    return {
      title: `Your trial has ended — you're on ${label}`,
      body: `With ${headcount} active ${headcount === 1 ? "employee" : "employees"}, ${label} (${price}) is the plan that fits. You can change it any time in Billing.`,
    };
  }
  if (d.planChangeReason === "shrank") {
    return {
      title: `Your plan moved down to ${label}`,
      body: `Your team is smaller — ${headcount} active ${headcount === 1 ? "employee" : "employees"} — so you're now on ${label} at ${price}, down from ${PLAN_LABELS[d.planBefore] ?? d.planBefore}.`,
    };
  }
  return {
    title: `Your plan moved up to ${label}`,
    body: `Your team grew to ${headcount} active ${headcount === 1 ? "employee" : "employees"}, which ${PLAN_LABELS[d.planBefore] ?? d.planBefore} no longer covers. From now you're on ${label} at ${price} — cheaper than staying put and paying per-seat overage.`,
  };
}

