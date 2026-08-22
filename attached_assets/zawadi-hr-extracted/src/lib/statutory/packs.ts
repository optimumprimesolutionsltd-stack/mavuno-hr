import type { StatutoryConfig } from "./types";
import { toCents } from "@/lib/money";

const K = (n: number) => toCents(n);   // whole shillings -> cents

/* ==========================================================================
 * KENYA — pre-Finance-Act-2023 regime.
 * Kept so that a 2023 payslip recomputes against 2023 law, not today's law.
 * This is the whole point of effective-dating: history must stay reproducible.
 * ========================================================================== */
export const KE_2022: StatutoryConfig = {
  countryCode: "KE",
  currencyCode: "KES",
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
    code: "NSSF",
    lowerEarningsLimit: K(0),
    upperEarningsLimit: K(18_000),   // old flat KES 200 era simplified
    employeeBps: 600,
    employerBps: 600,
    taxDeductible: true,
  },
  // Old NHIF was a graduated table; modelled as an effective floor/ceiling.
  health: { code: "NHIF", bps: 0, minimum: K(150), maximum: K(1_700), taxDeductible: false },
  levies: [
    { code: "NITA", employeeBps: 0, employerBps: 0, employerFlatPerEmployee: K(50), cap: null, taxDeductible: false },
  ],
  fringeBenefit: { deemedRateBps: 900, taxBps: 3000 },
  nonResident: { flatBps: 3000, reliefsApply: false },
  overtime: { normalBps: 15000, holidayBps: 20000 },
  standardMonthlyHours: 195,
  standardMonthlyDays: 26,
};

/* ==========================================================================
 * KENYA — current regime (Finance Act 2023 bands + Tax Laws (Amendment) Act
 * 2024 treatment, in force through FY2025/26).
 *
 * Key post-Dec-2024 point, which the original code got right and which most
 * competitors got wrong for months: SHIF, AHL and NSSF are ALLOWABLE
 * DEDUCTIONS from taxable income — not tax reliefs applied after the fact.
 * The difference materially changes net pay.
 * ========================================================================== */
export const KE_2025: StatutoryConfig = {
  countryCode: "KE",
  currencyCode: "KES",
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
    code: "NSSF",
    lowerEarningsLimit: K(8_000),    // Tier I ceiling
    upperEarningsLimit: K(72_000),   // Tier II ceiling (Year 3)
    employeeBps: 600,
    employerBps: 600,
    taxDeductible: true,
  },
  health: { code: "SHIF", bps: 275, minimum: K(300), maximum: null, taxDeductible: true },
  levies: [
    { code: "AHL", employeeBps: 150, employerBps: 150, cap: null, taxDeductible: true },
    /* NITA industrial training levy: employer-paid, KES 50 per employee per
     * month, remitted via the KRA unified payroll return. Missing this means
     * every employer cost figure and remittance summary is understated. */
    { code: "NITA", employeeBps: 0, employerBps: 0, employerFlatPerEmployee: K(50), cap: null, taxDeductible: false },
  ],
  /* KRA prescribes the FBT deemed interest rate quarterly; update by inserting
   * a new effective-dated config rather than editing this one. */
  fringeBenefit: { deemedRateBps: 1300, taxBps: 3000 },
  nonResident: { flatBps: 3000, reliefsApply: false },
  overtime: { normalBps: 15000, holidayBps: 20000 },
  standardMonthlyHours: 195,
  standardMonthlyDays: 26,
};

/* ==========================================================================
 * TANZANIA & UGANDA — proof that the abstraction generalises.
 * Same engine, different data. This is the East-Africa expansion path.
 * ========================================================================== */
export const TZ_2025: StatutoryConfig = {
  countryCode: "TZ",
  currencyCode: "TZS",
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
  standardMonthlyHours: 195,
  standardMonthlyDays: 26,
};

export const UG_2025: StatutoryConfig = {
  countryCode: "UG",
  currencyCode: "UGX",
  name: "Uganda FY2025/26",
  effectiveFrom: "2025-07-01",
  payeBands: [
    { upTo: K(235_000),   bps: 0 },
    { upTo: K(335_000),   bps: 1000 },
    { upTo: K(410_000),   bps: 2000 },
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
  standardMonthlyHours: 195,
  standardMonthlyDays: 26,
};

export const ALL_PACKS: StatutoryConfig[] = [KE_2022, KE_2025, TZ_2025, UG_2025];
