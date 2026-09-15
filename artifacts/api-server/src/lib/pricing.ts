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

/**
 * docs/design/super-admin-org-lifecycle.md §2 — a verified payment pushes
 * organizations.access_until forward by one billing cycle. Extends from the
 * later of "now" or the current access_until, so paying early never wastes
 * days already owned; a lapsed org's new window starts from today instead of
 * compounding off a stale past date.
 */
export function extendAccessUntil(current: Date | null, cycle: string): Date {
  const base = current && current.getTime() > Date.now() ? new Date(current) : new Date();
  if (isBillingCycle(cycle) && cycle === "annual") {
    base.setFullYear(base.getFullYear() + 1);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base;
}

/**
 * A payment is worth the access it paid for — no more.
 *
 * extendAccessUntil() moves the window a whole cycle regardless of amount,
 * which is only safe if something upstream guarantees the amount. Nothing did:
 * /mpesa/initiate took the amount straight from the request body, and a Paybill
 * payer types their own figure at the till. KES 1 bought a month; on an annual
 * cycle, a year.
 *
 * Paying part of what you owe now buys part of a cycle instead of all of it.
 * Deliberately proportional rather than all-or-nothing: refusing to extend on a
 * short payment would lock out a customer whose bank shaved a fee off a
 * transfer, and "we took your money and gave you nothing" is a worse failure
 * than a few days of grace. Overpayment runs the window further forward, so
 * paying three months up front works instead of being quietly pocketed.
 *
 * @param owedCents what one cycle costs. 0 — trial, Free, nothing billed yet —
 *   means there is nothing to fall short of, so a full cycle is granted.
 * @param paidCents what actually arrived.
 */
export function extendAccessForPayment(
  current: Date | null,
  cycle: string,
  owedCents: number,
  paidCents: number,
): { until: Date; cyclesPaid: number; shortfallCents: number } {
  if (!owedCents || owedCents <= 0) {
    return { until: extendAccessUntil(current, cycle), cyclesPaid: 1, shortfallCents: 0 };
  }

  const base = current && current.getTime() > Date.now() ? new Date(current) : new Date();
  const raw = Math.max(0, paidCents) / owedCents;

  // Treat a near-miss as payment in full. Safaricom deals in whole shillings
  // and banks deduct transfer fees, so an exact-to-the-cent match is not
  // something a real payment reliably achieves.
  const shortBy = owedCents - paidCents;
  const withinTolerance =
    shortBy > 0 && shortBy <= Math.max(TOLERANCE_CENTS, owedCents * TOLERANCE_FRACTION);

  const cycles = withinTolerance ? 1 : Math.min(raw, MAX_CYCLES_PER_PAYMENT);

  return {
    until: addCycles(base, cycle, cycles),
    cyclesPaid: cycles,
    shortfallCents: Math.max(0, shortBy),
  };
}

/** KES 50, or 1% of the bill — whichever is more forgiving. */
const TOLERANCE_CENTS = 50 * 100;
const TOLERANCE_FRACTION = 0.01;

/**
 * A single payment buys at most this many cycles — a guard against a typo'd
 * M-Pesa amount (one extra zero) silently granting a decade of access. The
 * full amount is still recorded on the payment, so a genuine prepayment that
 * trips this is a conversation, not a loss.
 */
const MAX_CYCLES_PER_PAYMENT = 12;

/** Move a date forward by a fractional number of billing cycles. */
function addCycles(base: Date, cycle: string, cycles: number): Date {
  const annual = isBillingCycle(cycle) && cycle === "annual";
  const whole = Math.floor(cycles);
  const out = new Date(base);
  if (annual) out.setFullYear(out.getFullYear() + whole);
  else out.setMonth(out.getMonth() + whole);

  // Measure the remainder against the cycle that actually follows: months are
  // not equal lengths, so a flat 30 days would drift.
  const remainder = cycles - whole;
  if (remainder > 0) {
    const next = new Date(out);
    if (annual) next.setFullYear(next.getFullYear() + 1);
    else next.setMonth(next.getMonth() + 1);
    out.setTime(out.getTime() + Math.round((next.getTime() - out.getTime()) * remainder));
  }
  return out;
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
