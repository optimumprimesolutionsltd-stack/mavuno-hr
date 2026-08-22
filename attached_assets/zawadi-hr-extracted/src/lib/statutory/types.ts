import type { Cents } from "@/lib/money";

/**
 * A country's payroll law, as data.
 *
 * Nothing in the engine hardcodes Kenya. Adding Tanzania means inserting a row
 * in `statutory_configs` and (if its rule *shapes* differ) adding a small
 * country module — not editing the engine.
 *
 * MONEY FIELDS ARE IN CENTS. RATES ARE IN BASIS POINTS (1bp = 0.01%).
 */
export interface StatutoryConfig {
  countryCode: string;
  currencyCode: string;
  name: string;
  effectiveFrom: string;  // YYYY-MM-DD

  /** Progressive tax bands. `upTo` is the monthly cumulative ceiling in cents;
   *  the final band must have upTo: null. */
  payeBands: { upTo: Cents | null; bps: number }[];

  personalRelief: Cents;
  insuranceRelief: { bps: number; cap: Cents };
  /** Owner-occupier mortgage interest is deductible up to a cap (KE: 30k/mo). */
  mortgageInterestCap: Cents;
  /** Registered pension contribution deductible up to a cap (KE: 30k/mo). */
  pensionDeductibleCap: Cents;
  /** Persons with a disability exemption certificate: first N/mo tax-free. */
  disabilityExemption: Cents;

  /** Social security. Tiered (KE NSSF) or flat-rate (most others). */
  socialSecurity: {
    code: string;                 // "NSSF"
    lowerEarningsLimit: Cents;
    upperEarningsLimit: Cents;
    employeeBps: number;
    employerBps: number;
    /** Is the employee contribution deductible from taxable income? */
    taxDeductible: boolean;
  };

  /** Health insurance levy (KE SHIF; TZ NHIF; etc). */
  health: {
    code: string;                 // "SHIF"
    bps: number;
    minimum: Cents;
    maximum: Cents | null;
    taxDeductible: boolean;
  };

  /** Housing / training / other payroll levies. Rate-based (AHL) and/or a
   *  FLAT per-employee amount (NITA: KES 50/employee/month, employer-paid). */
  levies: {
    code: string;                 // "AHL" | "NITA" | "SDL"
    employeeBps: number;
    employerBps: number;
    employerFlatPerEmployee?: Cents;  // flat monthly amount per employee
    cap: Cents | null;
    taxDeductible: boolean;
  }[];

  /** Fringe Benefit Tax on low-interest employee loans: the benefit is
   *  balance x (deemedRate - loanRate)/12, taxed at taxBps, payable by the
   *  EMPLOYER. deemedRateBps is the KRA-prescribed market rate, revised
   *  quarterly — which is exactly why it lives in effective-dated config. */
  fringeBenefit: { deemedRateBps: number; taxBps: number };

  nonResident: { flatBps: number; reliefsApply: boolean };

  overtime: { normalBps: number; holidayBps: number }; // 15000 = 1.5x, 20000 = 2.0x
  standardMonthlyHours: number;
  standardMonthlyDays: number;
}
