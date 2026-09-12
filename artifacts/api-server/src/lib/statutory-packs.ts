import type { StatutoryConfig } from "./statutory-types.js";
import { toCents } from "./money.js";

const K = (n: number) => toCents(n);

export const KE_2022: StatutoryConfig = {
  countryCode: "KE", currencyCode: "KES",
  name: "Kenya FY2022/23 (pre-Finance Act 2023)",
  effectiveFrom: "2021-01-01",
  payeBands: [
    { upTo: K(24_000), bps: 1000 },
    { upTo: K(32_333), bps: 2500 },
    { upTo: null,      bps: 3000 },
  ],
  personalRelief: K(2_400),
  insuranceRelief: { bps: 1500, cap: K(5_000) },
  mortgageInterestCap: K(25_000),
  pensionDeductibleCap: K(20_000),
  disabilityExemption: K(150_000),
  socialSecurity: {
    code: "NSSF", lowerEarningsLimit: K(0), upperEarningsLimit: K(18_000),
    employeeBps: 600, employerBps: 600, taxDeductible: true,
  },
  health: { code: "NHIF", bps: 0, minimum: K(150), maximum: K(1_700), taxDeductible: false },
  levies: [
    { code: "NITA", employeeBps: 0, employerBps: 0, employerFlatPerEmployee: K(50), cap: null, taxDeductible: false },
  ],
  fringeBenefit: { deemedRateBps: 900, taxBps: 3000 },
  nonResident: { flatBps: 3000, reliefsApply: false },
  overtime: { normalBps: 15000, holidayBps: 20000 },
  standardMonthlyHours: 195, standardMonthlyDays: 26,
};

export const KE_2025: StatutoryConfig = {
  countryCode: "KE", currencyCode: "KES",
  name: "Kenya FY2025/26 (Finance Act 2025 / TLAA 2024)",
  effectiveFrom: "2024-12-27",
  payeBands: [
    { upTo: K(24_000),  bps: 1000 },
    { upTo: K(32_333),  bps: 2500 },
    { upTo: K(500_000), bps: 3000 },
    { upTo: K(800_000), bps: 3250 },
    { upTo: null,       bps: 3500 },
  ],
  personalRelief: K(2_400),
  insuranceRelief: { bps: 1500, cap: K(5_000) },
  mortgageInterestCap: K(30_000),
  pensionDeductibleCap: K(30_000),
  disabilityExemption: K(150_000),
  socialSecurity: {
    code: "NSSF", lowerEarningsLimit: K(8_000), upperEarningsLimit: K(72_000),
    employeeBps: 600, employerBps: 600, taxDeductible: true,
  },
  health: { code: "SHIF", bps: 275, minimum: K(300), maximum: null, taxDeductible: true },
  levies: [
    { code: "AHL", employeeBps: 150, employerBps: 150, cap: null, taxDeductible: true },
    { code: "NITA", employeeBps: 0, employerBps: 0, employerFlatPerEmployee: K(50), cap: null, taxDeductible: false },
  ],
  fringeBenefit: { deemedRateBps: 1300, taxBps: 3000 },
  nonResident: { flatBps: 3000, reliefsApply: false },
  overtime: { normalBps: 15000, holidayBps: 20000 },
  standardMonthlyHours: 195, standardMonthlyDays: 26,
};

/**
 * NSSF Year Four, effective 1 February 2026.
 *
 * A NEW pack rather than an edit to KE_2025, for two reasons. KE_2025 stays
 * correct for periods before February 2026 and a payroll run from January must
 * still recompute to what it produced then. And seedStatutoryConfigs() is
 * idempotent on (country_code, effective_from) — it skips a row that already
 * exists — so editing KE_2025 in code would never reach the database at all.
 *
 * Only the NSSF earnings limits move. The phased schedule in the NSSF Act 2013
 * raises them each year; the 6% employee and 6% employer rates are unchanged,
 * as are the PAYE bands, reliefs, SHIF, the Housing Levy and NITA.
 *
 *   Tier I  limit  8 000 -> 9 000    employee 480   -> 540
 *   Tier II limit 72 000 -> 108 000  employee 3 840 -> 5 940 at the cap
 *
 * So an employee at or above the upper limit now contributes 6 480 rather than
 * 4 320, matched by the employer: 12 960 combined.
 */
export const KE_2026: StatutoryConfig = {
  ...KE_2025,
  name: "Kenya FY2026/27 (NSSF Year 4 limits)",
  effectiveFrom: "2026-02-01",
  socialSecurity: {
    code: "NSSF", lowerEarningsLimit: K(9_000), upperEarningsLimit: K(108_000),
    employeeBps: 600, employerBps: 600, taxDeductible: true,
  },
};

export const TZ_2025: StatutoryConfig = {
  countryCode: "TZ", currencyCode: "TZS",
  name: "Tanzania FY2025/26",
  effectiveFrom: "2025-07-01",
  payeBands: [
    { upTo: K(270_000),   bps: 0 },
    { upTo: K(520_000),   bps: 800 },
    { upTo: K(760_000),   bps: 2000 },
    { upTo: K(1_000_000), bps: 2500 },
    { upTo: null,         bps: 3000 },
  ],
  personalRelief: 0,
  insuranceRelief: { bps: 0, cap: 0 },
  mortgageInterestCap: 0,
  pensionDeductibleCap: K(1_000_000),
  disabilityExemption: 0,
  socialSecurity: {
    code: "NSSF", lowerEarningsLimit: 0, upperEarningsLimit: K(100_000_000),
    employeeBps: 1000, employerBps: 1000, taxDeductible: true,
  },
  health: { code: "NHIF", bps: 300, minimum: 0, maximum: null, taxDeductible: false },
  levies: [{ code: "SDL", employeeBps: 0, employerBps: 350, cap: null, taxDeductible: false }],
  fringeBenefit: { deemedRateBps: 0, taxBps: 0 },
  nonResident: { flatBps: 1500, reliefsApply: false },
  overtime: { normalBps: 15000, holidayBps: 20000 },
  standardMonthlyHours: 195, standardMonthlyDays: 26,
};

export const UG_2025: StatutoryConfig = {
  countryCode: "UG", currencyCode: "UGX",
  name: "Uganda FY2025/26",
  effectiveFrom: "2025-07-01",
  payeBands: [
    { upTo: K(235_000),    bps: 0 },
    { upTo: K(335_000),    bps: 1000 },
    { upTo: K(410_000),    bps: 2000 },
    { upTo: K(10_000_000), bps: 3000 },
    { upTo: null,          bps: 4000 },
  ],
  personalRelief: 0,
  insuranceRelief: { bps: 0, cap: 0 },
  mortgageInterestCap: 0,
  pensionDeductibleCap: K(1_000_000),
  disabilityExemption: 0,
  socialSecurity: {
    code: "NSSF", lowerEarningsLimit: 0, upperEarningsLimit: K(100_000_000),
    employeeBps: 500, employerBps: 1000, taxDeductible: false,
  },
  health: { code: "NONE", bps: 0, minimum: 0, maximum: null, taxDeductible: false },
  levies: [],
  fringeBenefit: { deemedRateBps: 0, taxBps: 0 },
  nonResident: { flatBps: 3000, reliefsApply: false },
  overtime: { normalBps: 15000, holidayBps: 20000 },
  standardMonthlyHours: 195, standardMonthlyDays: 26,
};

export const ALL_PACKS: StatutoryConfig[] = [KE_2022, KE_2025, KE_2026, TZ_2025, UG_2025];
