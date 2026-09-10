/**
 * Mavuno HR rate card and billing math — front-end copy.
 *
 * Hand-synced mirror of artifacts/api-server/src/lib/pricing.ts (the server is
 * the source of truth). Used for live previews in the super-admin and customer
 * billing screens; the authoritative charge always comes from the API.
 *
 * All amounts are KES *cents*.
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
  /** Per active employee above includedSeats (grace buffer) — KES cents. */
  overageCents: number;
  /** Above this headcount, recommendPlan points to the next plan. null = no cap. */
  softCapSeats: number | null;
  /** Display-only band. */
  bestFor: string;
}

const K = 100;

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

export const PLAN_COLORS: Record<string, string> = {
  trial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  free: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  lite: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  starter: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  growth: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  business: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  enterprise: "bg-primary/15 text-primary border-primary/30",
};

export function isPlanId(v: string): v is PlanId {
  return (PLAN_IDS as readonly string[]).includes(v);
}

export function overageSeats(plan: string, activeEmployees: number): number {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  return Math.max(0, Math.floor(activeEmployees || 0) - rate.includedSeats);
}

export function standardMonthlyCents(plan: string, activeEmployees: number): number {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  return rate.minCents + rate.overageCents * overageSeats(plan, activeEmployees);
}

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

export function effectiveMonthlyCents(args: {
  plan: string;
  activeEmployees: number;
  overrideCents?: number | null;
}): number {
  if (args.overrideCents && args.overrideCents > 0) return args.overrideCents;
  return standardMonthlyCents(args.plan, args.activeEmployees);
}

export function cycleChargeCents(monthlyCents: number, cycle: string): number {
  return cycle === "annual" ? monthlyCents * ANNUAL_MONTHS_CHARGED : monthlyCents;
}

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
