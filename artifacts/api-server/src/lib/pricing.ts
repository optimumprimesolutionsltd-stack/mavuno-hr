/**
 * Mavuno HR rate card and billing math.
 *
 * SERVER SOURCE OF TRUTH. The front-end keeps a hand-synced copy at
 * artifacts/mavuno-hr/src/lib/pricing.ts for live previews — keep the two in
 * step when the numbers change.
 *
 * Model: banded flat fee + grace overage.
 *   monthly charge = plan flat fee
 *                  + overage rate x (active employees over the plan's included seats)
 * The overage only bites in the small buffer between a plan's included seats and
 * its soft cap; past the soft cap the customer moves to the next plan
 * (recommendPlan picks the cheapest that still fits). A positive per-org
 * override (organizations.monthly_charge) wins over the rate card — that is the
 * negotiated Enterprise / bespoke price. Annual billing charges 10 months for 12
 * (~16.7% off).
 *
 * All amounts are KES *cents* to match the money() convention in the schema.
 */

export const PLAN_IDS = ["trial", "free", "lite", "starter", "growth", "business", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Annual billing charges this many months for a full year. */
export const ANNUAL_MONTHS_CHARGED = 10;

export interface PlanRate {
  label: string;
  /** Flat monthly fee — KES cents. */
  minCents: number;
  /** Active employees the flat fee covers. */
  includedSeats: number;
  /** Per active employee above includedSeats (the grace buffer) — KES cents. */
  overageCents: number;
  /** Above this headcount, recommendPlan points to the next plan. null = no cap. */
  softCapSeats: number | null;
  /** Marketing "best for" band, e.g. "11–20 employees". Display only. */
  bestFor: string;
}

const K = 100; // KES -> cents

export const PLAN_RATES: Record<PlanId, PlanRate> = {
  trial:      { label: "Trial",      minCents: 0,          includedSeats: 25,  overageCents: 0,       softCapSeats: 25,   bestFor: "Up to 25 employees, 30 days" },
  free:       { label: "Free",       minCents: 0,          includedSeats: 5,   overageCents: 0,       softCapSeats: 5,    bestFor: "1–5 employees" },
  lite:       { label: "Lite",       minCents: 1_500 * K,  includedSeats: 10,  overageCents: 150 * K, softCapSeats: 13,   bestFor: "6–10 employees" },
  starter:    { label: "Starter",    minCents: 2_500 * K,  includedSeats: 20,  overageCents: 150 * K, softCapSeats: 25,   bestFor: "11–20 employees" },
  growth:     { label: "Growth",     minCents: 4_000 * K,  includedSeats: 50,  overageCents: 130 * K, softCapSeats: 60,   bestFor: "21–50 employees" },
  business:   { label: "Business",   minCents: 7_000 * K,  includedSeats: 150, overageCents: 90 * K,  softCapSeats: 180,  bestFor: "51–150 employees" },
  enterprise: { label: "Enterprise", minCents: 10_000 * K, includedSeats: 250, overageCents: 70 * K,  softCapSeats: null, bestFor: "150+ employees" },
};

export const PLAN_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_IDS.map((id) => [id, PLAN_RATES[id].label]),
);

export function isPlanId(v: string): v is PlanId {
  return (PLAN_IDS as readonly string[]).includes(v);
}

export function isBillingCycle(v: string): v is BillingCycle {
  return (BILLING_CYCLES as readonly string[]).includes(v);
}

/** How many employees over the plan's included seats. */
export function overageSeats(plan: string, activeEmployees: number): number {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  return Math.max(0, Math.floor(activeEmployees || 0) - rate.includedSeats);
}

/** Flat fee + overage, before any per-org negotiated override. KES cents. */
export function standardMonthlyCents(plan: string, activeEmployees: number): number {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  return rate.minCents + rate.overageCents * overageSeats(plan, activeEmployees);
}

/** Breakdown for display: flat fee, chargeable overage count, overage total. */
export function priceBreakdown(plan: string, activeEmployees: number): {
  flatCents: number;
  overageCount: number;
  overageRateCents: number;
  overageTotalCents: number;
  totalCents: number;
} {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  const overageCount = overageSeats(plan, activeEmployees);
  const overageTotalCents = rate.overageCents * overageCount;
  return {
    flatCents: rate.minCents,
    overageCount,
    overageRateCents: rate.overageCents,
    overageTotalCents,
    totalCents: rate.minCents + overageTotalCents,
  };
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

/** Cheapest paid plan that fits a headcount (ignores Trial). */
export function recommendPlan(activeEmployees: number): PlanId {
  const seats = Math.max(0, Math.floor(activeEmployees || 0));
  const candidates: PlanId[] = ["free", "lite", "starter", "growth", "business", "enterprise"];
  let best: PlanId = "enterprise";
  let bestCost = Number.POSITIVE_INFINITY;
  for (const p of candidates) {
    const cap = PLAN_RATES[p].softCapSeats;
    if (cap !== null && seats > cap) continue;
    const c = standardMonthlyCents(p, seats);
    if (c < bestCost) {
      bestCost = c;
      best = p;
    }
  }
  return best;
}
