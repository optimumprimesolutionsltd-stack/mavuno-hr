/**
 * Mavuno HR rate card and billing math — front-end copy.
 *
 * Hand-synced mirror of artifacts/api-server/src/lib/pricing.ts (the server is
 * the source of truth). Used for live previews in the super-admin and customer
 * billing screens; the authoritative charge always comes from the API.
 *
 * All amounts are KES *cents*.
 */

export const PLAN_IDS = ["trial", "starter", "growth", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Annual billing charges this many months for a full year. */
export const ANNUAL_MONTHS_CHARGED = 10;

export interface PlanRate {
  label: string;
  rateCents: number; // per active employee per month
  minCents: number; // monthly minimum
  bestFor: string; // display-only band
}

const K = 100;

export const PLAN_RATES: Record<PlanId, PlanRate> = {
  trial: { label: "Trial", rateCents: 0, minCents: 0, bestFor: "Up to 25 employees, 30 days" },
  starter: { label: "Starter", rateCents: 200 * K, minCents: 3_500 * K, bestFor: "1–40 employees" },
  growth: { label: "Growth", rateCents: 150 * K, minCents: 12_000 * K, bestFor: "40–150 employees" },
  enterprise: { label: "Enterprise", rateCents: 110 * K, minCents: 75_000 * K, bestFor: "150+ employees" },
};

export const PLAN_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_IDS.map((id) => [id, PLAN_RATES[id].label]),
);

export const PLAN_COLORS: Record<string, string> = {
  trial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  starter: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  growth: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  enterprise: "bg-primary/15 text-primary border-primary/30",
};

export function isPlanId(v: string): v is PlanId {
  return (PLAN_IDS as readonly string[]).includes(v);
}

export function standardMonthlyCents(plan: string, activeEmployees: number): number {
  const rate = PLAN_RATES[isPlanId(plan) ? plan : "trial"];
  const seats = Math.max(0, Math.floor(activeEmployees || 0));
  return Math.max(rate.minCents, rate.rateCents * seats);
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
