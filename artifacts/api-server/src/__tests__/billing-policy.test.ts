/**
 * Billing run decisions — docs/design/billing-and-repricing.md §8.
 *
 * decideCharge() is deliberately pure: every rule the run applies (reprice up,
 * reprice down, honour an override, skip a live trial, skip a mid-annual-term
 * month) is decided here from plain arguments, so it is testable without a
 * database. These tests are that §8 checklist.
 */
import { describe, it, expect } from "vitest";
import {
  decideCharge, planChangeMessage, monthsBetween, periodOf, previousPeriod,
  periodStart, periodEnd, type OrgBillingState,
} from "../lib/billing-policy.js";
import { PLAN_RATES } from "../lib/pricing.js";

const K = 100; // KES -> cents

function org(over: Partial<OrgBillingState> = {}): OrgBillingState {
  return {
    id: 1,
    plan: "starter",
    billingCycle: "monthly",
    monthlyCharge: 0,
    status: "active",
    trialEndsAt: null,
    deletionScheduledFor: null,
    ...over,
  };
}

/** Standard call: billing 2026-08 on 1 Sept 2026. */
function decide(o: OrgBillingState, headcount: number, over: {
  period?: string; now?: Date; lastAnnualChargePeriod?: string | null;
} = {}) {
  return decideCharge({
    org: o,
    headcount,
    period: over.period ?? "2026-08",
    now: over.now ?? new Date(2026, 8, 1, 2, 0, 0), // 1 Sept 2026, 02:00 local
    lastAnnualChargePeriod: over.lastAnnualChargePeriod ?? null,
  });
}

describe("period arithmetic", () => {
  it("formats and steps periods from local date parts", () => {
    expect(periodOf(new Date(2026, 0, 15))).toBe("2026-01");
    expect(periodOf(new Date(2026, 11, 31))).toBe("2026-12");
    expect(previousPeriod("2026-01")).toBe("2025-12");
    expect(previousPeriod("2026-09")).toBe("2026-08");
  });

  it("does not shift a month because of the server's UTC offset", () => {
    // Nairobi is UTC+3: 1 Jan 2026 00:30 local is still 31 Dec in UTC. A
    // toISOString()-based periodOf would bill the wrong month here.
    expect(periodOf(new Date(2026, 0, 1, 0, 30))).toBe("2026-01");
  });

  it("bounds a period at local midnight and the last millisecond", () => {
    expect(periodStart("2026-02").getDate()).toBe(1);
    const end = periodEnd("2026-02");
    expect(end.getDate()).toBe(28);        // 2026 is not a leap year
    expect(end.getMonth()).toBe(1);
    expect(periodEnd("2024-02").getDate()).toBe(29);
  });

  it("counts whole months across year boundaries", () => {
    expect(monthsBetween("2026-01", "2027-01")).toBe(12);
    expect(monthsBetween("2026-08", "2026-08")).toBe(0);
    expect(monthsBetween("2026-08", "2027-02")).toBe(6);
  });
});

describe("repricing", () => {
  it("moves a grown Starter org up to Growth, and bills the flat fee", () => {
    // 28 employees on Starter: 2,500 + 150x8 = 3,700 of overage-laden rate
    // card, and past Starter's 25 soft cap. Growth's flat 4,000 covers them.
    const d = decide(org({ plan: "starter" }), 28);
    expect(d.skip).toBeNull();
    expect(d.planAfter).toBe("growth");
    expect(d.planChanged).toBe(true);
    expect(d.planChangeReason).toBe("grew");
    expect(d.amountCents).toBe(4_000 * K);
    expect(d.cycleAmountCents).toBe(4_000 * K);
    expect(d.source).toBe("rate_card");
  });

  it("moves a shrunk Growth org down to Lite", () => {
    const d = decide(org({ plan: "growth" }), 8);
    expect(d.planAfter).toBe("lite");
    expect(d.planChangeReason).toBe("shrank");
    expect(d.amountCents).toBe(1_500 * K);
  });

  it("leaves a correctly-banded org alone", () => {
    const d = decide(org({ plan: "starter" }), 18);
    expect(d.planChanged).toBe(false);
    expect(d.planChangeReason).toBeNull();
    expect(d.amountCents).toBe(2_500 * K);
  });

  it("bills the grace overage inside a band rather than moving early", () => {
    // 22 employees: over Starter's 20 included seats but under its 25 soft cap.
    // The buffer is the point of the band — charge 2 x 150, do not upgrade.
    const d = decide(org({ plan: "starter" }), 22);
    expect(d.planChanged).toBe(false);
    expect(d.amountCents).toBe(2_500 * K + 2 * 150 * K);
  });

  it("drops an emptied org to Free at zero", () => {
    const d = decide(org({ plan: "growth" }), 0);
    expect(d.planAfter).toBe("free");
    expect(d.amountCents).toBe(0);
    expect(d.cycleAmountCents).toBe(0);
  });
});

describe("negotiated override", () => {
  it("skips repricing entirely and bills the agreed amount", () => {
    const d = decide(org({ plan: "starter", monthlyCharge: 9_000 * K }), 200);
    expect(d.planAfter).toBe("starter");   // untouched despite 200 employees
    expect(d.planChanged).toBe(false);
    expect(d.amountCents).toBe(9_000 * K);
    expect(d.source).toBe("override");
  });

  it("multiplies the agreed amount for an annual cycle", () => {
    const d = decide(org({ billingCycle: "annual", monthlyCharge: 9_000 * K }), 200);
    expect(d.cycleAmountCents).toBe(9_000 * K * 10);
  });
});

describe("trial", () => {
  const trialOrg = (endsAt: Date | null) => org({ plan: "trial", trialEndsAt: endsAt });

  it("writes no charge for a period the trial was still running in", () => {
    // Trial ends 20 Aug; billing August on 1 Sept.
    const d = decide(trialOrg(new Date(2026, 7, 20)), 12);
    expect(d.skip).toBe("trial");
  });

  it("assigns the fitting band as soon as the trial has actually elapsed", () => {
    const d = decide(trialOrg(new Date(2026, 7, 20)), 12);
    expect(d.planAfter).toBe("lite");        // 12 employees -> Lite
    expect(d.planChanged).toBe(true);
    expect(d.planChangeReason).toBe("trial_ended");
  });

  it("charges the first full period after the trial ended", () => {
    // Trial ended 20 Aug; billing September on 1 Oct. The org has already been
    // moved off `trial` by then, but a run that missed August still bills it.
    const d = decide(trialOrg(new Date(2026, 7, 20)), 12, {
      period: "2026-09", now: new Date(2026, 9, 1, 2),
    });
    expect(d.skip).toBeNull();
    expect(d.planAfter).toBe("lite");
    // 12 employees sits 2 over Lite's 10 included seats — still inside the
    // grace buffer (soft cap 13), so it bills flat fee + 2 x 150 rather than
    // pushing them onto Starter.
    expect(d.amountCents).toBe(1_500 * K + 2 * 150 * K);
  });

  it("leaves a still-running trial on trial, with no plan assigned", () => {
    const d = decide(trialOrg(new Date(2026, 9, 15)), 12, {
      period: "2026-08", now: new Date(2026, 8, 1, 2),
    });
    expect(d.skip).toBe("trial");
    expect(d.planChanged).toBe(false);
    expect(d.planAfter).toBe("trial");
  });

  it("never auto-charges or auto-assigns an open-ended trial", () => {
    // A super-admin-provisioned org with no end date: nobody has told this
    // customer their trial is over, so the run must not decide it for them.
    const d = decide(trialOrg(null), 40);
    expect(d.skip).toBe("trial");
    expect(d.planChanged).toBe(false);
  });
});

describe("annual cycle", () => {
  it("bills a full year's amount on the first charge", () => {
    const d = decide(org({ plan: "growth", billingCycle: "annual" }), 40);
    expect(d.skip).toBeNull();
    expect(d.cycleAmountCents).toBe(4_000 * K * 10); // 10 months for 12
  });

  it("writes nothing mid-term, and does not reprice mid-term either", () => {
    // Last annual charge 2026-01; billing 2026-08 — month 7 of the term.
    const d = decide(org({ plan: "starter", billingCycle: "annual" }), 40, {
      lastAnnualChargePeriod: "2026-01",
    });
    expect(d.skip).toBe("mid_annual_term");
    expect(d.planChanged).toBe(false); // trues up at renewal, not now
  });

  it("trues up at the renewal, on the then-current headcount", () => {
    const d = decide(org({ plan: "starter", billingCycle: "annual" }), 40, {
      period: "2027-01", now: new Date(2027, 1, 1, 2), lastAnnualChargePeriod: "2026-01",
    });
    expect(d.skip).toBeNull();
    expect(d.planAfter).toBe("growth");
    expect(d.cycleAmountCents).toBe(4_000 * K * 10);
  });
});

describe("orgs the run must leave alone", () => {
  it("does not bill a suspended org", () => {
    expect(decide(org({ status: "suspended" }), 20).skip).toBe("not_active");
  });

  it("does not bill an org inside its deletion grace period", () => {
    const d = decide(org({ deletionScheduledFor: new Date(2026, 9, 1) }), 20);
    expect(d.skip).toBe("pending_deletion");
  });

  it("does not reprice either — a skipped org's plan is untouched", () => {
    const d = decide(org({ plan: "starter", status: "suspended" }), 200);
    expect(d.planChanged).toBe(false);
  });
});

describe("what the customer is told", () => {
  it("names the new band and price on an increase", () => {
    const d = decide(org({ plan: "starter" }), 28);
    const msg = planChangeMessage(d, 28);
    expect(msg.title).toContain(PLAN_RATES.growth.label);
    expect(msg.body).toContain("28");
    expect(msg.body).toContain("4,000");
  });

  it("frames a decrease as the team being smaller, not a downgrade", () => {
    const d = decide(org({ plan: "growth" }), 8);
    const msg = planChangeMessage(d, 8);
    expect(msg.title).toContain(PLAN_RATES.lite.label);
    expect(msg.body).toContain("smaller");
  });

  it("explains a trial ending rather than announcing a price rise", () => {
    const d = decide(org({ plan: "trial", trialEndsAt: new Date(2026, 7, 20) }), 12);
    const msg = planChangeMessage(d, 12);
    expect(msg.title).toContain("trial");
    expect(msg.body).toContain("change it any time");
  });
});
