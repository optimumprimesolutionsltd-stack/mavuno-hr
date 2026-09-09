/**
 * Mavuno HR rate card and billing math.
 *
 * SERVER SOURCE OF TRUTH. The front-end keeps a hand-synced copy at
 * artifacts/mavuno-hr/src/lib/pricing.ts for live previews — keep the two in
 * step when the numbers change.
 *
 * Model: per active employee, per month (PEPM), with a monthly minimum.
 *   monthly charge = max( plan minimum, plan rate x active employees )
 * A positive per-org override (organizations.monthly_charge) wins over the
 * rate card — that is the negotiated Enterprise / bespoke price.
 * Annual billing charges 10 months for 12 (~16.7% off).
 *
 * All amounts are KES *cents* to match the money() convention in the schema.
 */

export const PLAN_IDS = ["trial", "starter", "growth", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Annual billing charges this many months for a full year. */
export const ANNUAL_MONTHS_CHARGED = 10;

export interface PlanRate {
  label: string;
  /** Per active employee, per month — KES cents. */
  rateCents: number;
  /** Monthly minimum charge — KES cents. */
  minCents: number;
  /** Marketing "best for" band, e.g. "1–40 employees". Display only. */
  bestFor: string;
}

const K = 100; // KES -> cents

export const PLAN_RATES: Record<PlanId, PlanRate> = {
  trial: {
    label: "Trial",
    rateCents: 0,
    minCents: 0,
    bestFor: "Up to 25 employees, 30 days",
  },
  starter: {
    label: "Starter",
    rateCents: 200 * K,
    minCents: 3_500 * K,
    bestFor: "1–40 employees",
  },
  growth: {
    label: "Growth",
    rateCents: 150 * K,
    minCents: 12_000 * K,
    bestFor: "40–150 employees",
  },
  enterprise: {
    label: "Enterprise",
    rateCents: 110 * K,
    minCents: 75_000 * K,
    bestFor: "150+ employees",
  },
};

export function isPlanId(v: string): v is PlanId {
  return (PLAN_IDS as readonly string[]).includes(v);
}

export function isBillingCycle(v: string): v is BillingCycle {
  return (BILLING_CYCLES as readonly string[]).includes(v);
}

/**
 * Rate-card monthly charge for a plan at a given headcount, before any
 * per-org negotiated override. KES cents.
 */
export function standardMonthlyCents(plan: string, activeEmployees: number): number {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  const seats = Math.max(0, Math.floor(activeEmployees || 0));
  return Math.max(rate.minCents, rate.rateCents * seats);
}

/**
 * What the org actually pays per month. A positive override (its stored
 * monthly_charge) wins; otherwise the rate card applies.
 */
export function effectiveMonthlyCents(args: {
  plan: string;
  activeEmployees: number;
  overrideCents?: number | null;
}): number {
  if (args.overrideCents && args.overrideCents > 0) return args.overrideCents;
  return standardMonthlyCents(args.plan, args.activeEmployees);
}

/** Amount billed for one cycle. Annual = ANNUAL_MONTHS_CHARGED x the monthly. */
export function cycleChargeCents(monthlyCents: number, cycle: string): number {
  return isBillingCycle(cycle) && cycle === "annual"
    ? monthlyCents * ANNUAL_MONTHS_CHARGED
    : monthlyCents;
}

/** Cheapest paid plan for a headcount (ignores Trial). */
export function recommendPlan(activeEmployees: number): PlanId {
  const paid: PlanId[] = ["starter", "growth", "enterprise"];
  let best: PlanId = "starter";
  let bestCost = Number.POSITIVE_INFINITY;
  for (const p of paid) {
    const c = standardMonthlyCents(p, activeEmployees);
    if (c < bestCost) {
      bestCost = c;
      best = p;
    }
  }
  return best;
}
