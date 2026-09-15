/**
 * Access is worth what was paid for it.
 *
 * The regression these exist for: `extendAccessUntil()` moved the window a
 * whole cycle no matter the amount, and the amount was controlled by the payer
 * from two directions — `/mpesa/initiate` read it out of the request body, and
 * a Paybill payer types their own figure at the till. KES 1 bought a month; on
 * an annual cycle, a year.
 */
import { describe, it, expect } from "vitest";
import { extendAccessForPayment, extendAccessUntil } from "../lib/pricing.js";

const K = 100; // KES -> cents
const MONTHLY = 4_000 * K; // Growth, monthly
const DAY = 24 * 60 * 60 * 1000;

/** Whole days between two dates, rounded to the nearest day. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

const NOW = new Date(2026, 8, 15, 12, 0, 0); // 15 Sept 2026, midday

describe("the exploit is closed", () => {
  it("does not buy a month for KES 1", () => {
    const { until, cyclesPaid, shortfallCents } =
      extendAccessForPayment(NOW, "monthly", MONTHLY, 1 * K);

    expect(cyclesPaid).toBeCloseTo(1 / 4000, 5);
    expect(shortfallCents).toBe(MONTHLY - 1 * K);
    // Less than a day of access, not a month.
    expect(daysBetween(NOW, until)).toBe(0);
    expect(until.getTime()).toBeGreaterThan(NOW.getTime());
    // And emphatically not what the old code did.
    expect(until.getTime()).toBeLessThan(extendAccessUntil(NOW, "monthly").getTime());
  });

  it("does not buy a year for KES 1 on an annual cycle", () => {
    const annualOwed = MONTHLY * 10; // annual bills 10 months for 12
    const { until } = extendAccessForPayment(NOW, "annual", annualOwed, 1 * K);
    expect(until.getFullYear()).toBe(2026);
    expect(daysBetween(NOW, until)).toBeLessThan(2);
  });

  it("buys half a month for half the bill", () => {
    const { until, cyclesPaid } = extendAccessForPayment(NOW, "monthly", MONTHLY, MONTHLY / 2);
    expect(cyclesPaid).toBe(0.5);
    // Sept 15 -> Oct 15 is 30 days, so half is ~15.
    expect(daysBetween(NOW, until)).toBe(15);
  });
});

describe("paying in full still works exactly as before", () => {
  it("grants a whole cycle for the exact amount", () => {
    const { until, cyclesPaid, shortfallCents } =
      extendAccessForPayment(NOW, "monthly", MONTHLY, MONTHLY);
    expect(cyclesPaid).toBe(1);
    expect(shortfallCents).toBe(0);
    expect(until.getTime()).toBe(extendAccessUntil(NOW, "monthly").getTime());
  });

  it("grants a whole year for a full annual payment", () => {
    const annualOwed = MONTHLY * 10;
    const { until } = extendAccessForPayment(NOW, "annual", annualOwed, annualOwed);
    expect(until.getTime()).toBe(extendAccessUntil(NOW, "annual").getTime());
  });

  it("extends from the existing window, not today, when paying early", () => {
    const future = new Date(2026, 10, 1); // access already runs to 1 Nov
    const { until } = extendAccessForPayment(future, "monthly", MONTHLY, MONTHLY);
    expect(until.getMonth()).toBe(11); // 1 Dec — the month already owned is not wasted
  });
});

describe("real payments are not punished for being a few shillings out", () => {
  it("treats a bank fee shaved off a transfer as payment in full", () => {
    // KES 3,970 against a 4,000 bill — within the KES 50 tolerance.
    const { until, cyclesPaid } = extendAccessForPayment(NOW, "monthly", MONTHLY, 3_970 * K);
    expect(cyclesPaid).toBe(1);
    expect(until.getTime()).toBe(extendAccessUntil(NOW, "monthly").getTime());
  });

  it("uses 1% instead when that is more forgiving than KES 50", () => {
    const big = 100_000 * K;           // a large negotiated bill
    const paid = big - 900 * K;        // KES 900 short, under 1%
    expect(extendAccessForPayment(NOW, "monthly", big, paid).cyclesPaid).toBe(1);
  });

  it("but a genuinely short payment is still short", () => {
    // KES 3,000 of 4,000 is 25% short — well outside any tolerance.
    const { cyclesPaid } = extendAccessForPayment(NOW, "monthly", MONTHLY, 3_000 * K);
    expect(cyclesPaid).toBe(0.75);
  });
});

describe("overpayment and edge cases", () => {
  it("lets somebody pay three months up front", () => {
    const { until, cyclesPaid } = extendAccessForPayment(NOW, "monthly", MONTHLY, MONTHLY * 3);
    expect(cyclesPaid).toBe(3);
    expect(until.getMonth()).toBe(11); // Sept -> Dec
  });

  it("caps a fat-fingered extra zero at 12 cycles", () => {
    const { cyclesPaid } = extendAccessForPayment(NOW, "monthly", MONTHLY, MONTHLY * 1000);
    expect(cyclesPaid).toBe(12);
  });

  it("grants a full cycle when nothing is owed", () => {
    // Trial or Free: there is no bill to fall short of, so a payment that
    // arrives anyway must not be read as a 0-length extension.
    for (const owed of [0, -1]) {
      const { until, cyclesPaid } = extendAccessForPayment(NOW, "monthly", owed, 500 * K);
      expect(cyclesPaid).toBe(1);
      expect(until.getTime()).toBe(extendAccessUntil(NOW, "monthly").getTime());
    }
  });

  it("never moves the window backwards on a zero payment", () => {
    const { until } = extendAccessForPayment(NOW, "monthly", MONTHLY, 0);
    expect(until.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });

  it("measures a part-cycle against the month that actually follows", () => {
    // February is short. Half of Feb must be ~14 days, not a flat 15.
    const feb = new Date(2027, 1, 1);
    const { until } = extendAccessForPayment(feb, "monthly", MONTHLY, MONTHLY / 2);
    expect(daysBetween(feb, until)).toBe(14);
  });
});
