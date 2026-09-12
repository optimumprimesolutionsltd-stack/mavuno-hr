import { describe, expect, it } from "vitest";
import { computePayslip, emptyPayInput } from "../lib/payroll.js";
import { KE_2025, KE_2026, ALL_PACKS } from "../lib/statutory-packs.js";
import { toCents } from "../lib/money.js";

/**
 * NSSF Year Four, effective 1 February 2026: the Tier I limit moves 8 000 ->
 * 9 000 and the Tier II limit 72 000 -> 108 000. The rates do not change.
 *
 * This was live and wrong for months — production computed Tier I as 480 and
 * capped the employee total at 4 320 — so these numbers are pinned rather than
 * derived, and KE_2025 is asserted unchanged so a future edit cannot quietly
 * rewrite what January's payroll runs recompute to.
 */

const K = (n: number) => toCents(n);
const at = (gross: number, cfg: typeof KE_2026) =>
  computePayslip({ ...emptyPayInput(), basicSalary: K(gross) }, cfg);

describe("NSSF Year 4 limits (KE_2026)", () => {
  it("charges the Tier I minimum on 9 000, not 8 000", () => {
    // The reported symptom: Tier I showing 480 when it should be 540.
    expect(at(50_000, KE_2026).nssfTier1).toBe(K(540));
    expect(at(50_000, KE_2025).nssfTier1).toBe(K(480));
  });

  it("caps Tier II at the new 108 000 upper limit", () => {
    const capped = at(150_000, KE_2026);
    expect(capped.nssfTier2).toBe(K(5_940)); // (108 000 - 9 000) * 6%
    expect(capped.nssfEmployee).toBe(K(6_480)); // 540 + 5 940
  });

  it("matches the employer contribution, for 12 960 combined at the cap", () => {
    const capped = at(150_000, KE_2026);
    expect(capped.nssfEmployer).toBe(K(6_480));
    expect(capped.nssfEmployee + capped.nssfEmployer).toBe(K(12_960));
  });

  it("splits an uncapped salary at the new Tier I boundary", () => {
    // 100 000 is below the upper limit, so Tier II is on the balance above 9 000.
    const r = at(100_000, KE_2026);
    expect(r.nssfTier1).toBe(K(540));
    expect(r.nssfTier2).toBe(K(5_460)); // (100 000 - 9 000) * 6%
    expect(r.nssfEmployee).toBe(K(6_000));
  });

  it("leaves an earner below the Tier I limit paying 6% of actual pay", () => {
    const r = at(7_000, KE_2026);
    expect(r.nssfTier1).toBe(K(420)); // 7 000 * 6%, not the 540 minimum
    expect(r.nssfTier2).toBe(0);
  });

  it("does not disturb KE_2025, which January still computes against", () => {
    expect(KE_2025.socialSecurity.lowerEarningsLimit).toBe(K(8_000));
    expect(KE_2025.socialSecurity.upperEarningsLimit).toBe(K(72_000));
    expect(at(150_000, KE_2025).nssfEmployee).toBe(K(4_320));
  });

  it("changes only NSSF — PAYE, SHIF and the Housing Levy are untouched", () => {
    // A new pack copied from the old one could silently carry an edit
    // elsewhere; this pins that it did not.
    const a = at(100_000, KE_2025);
    const b = at(100_000, KE_2026);
    expect(b.shif).toBe(a.shif);
    expect(b.housingLevyEmployee).toBe(a.housingLevyEmployee);
    expect(KE_2026.payeBands).toEqual(KE_2025.payeBands);
    expect(KE_2026.personalRelief).toBe(KE_2025.personalRelief);
  });

  it("is registered for seeding, or it never reaches the database", () => {
    // seedStatutoryConfigs() iterates ALL_PACKS. A pack missing from it exists
    // in code and nowhere else, which is indistinguishable from not fixing the
    // bug at all.
    expect(ALL_PACKS).toContain(KE_2026);
  });

  it("takes effect from February 2026 and not before", () => {
    expect(KE_2026.effectiveFrom).toBe("2026-02-01");
    // resolveConfig picks the latest effective_from <= the period, so the new
    // pack must sort after the old one.
    expect(KE_2026.effectiveFrom > KE_2025.effectiveFrom).toBe(true);
  });
});
