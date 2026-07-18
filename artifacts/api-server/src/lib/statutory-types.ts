import type { Cents } from "./money.js";

export interface StatutoryConfig {
  countryCode: string;
  currencyCode: string;
  name: string;
  effectiveFrom: string;
  payeBands: { upTo: Cents | null; bps: number }[];
  personalRelief: Cents;
  insuranceRelief: { bps: number; cap: Cents };
  mortgageInterestCap: Cents;
  pensionDeductibleCap: Cents;
  disabilityExemption: Cents;
  socialSecurity: {
    code: string;
    lowerEarningsLimit: Cents;
    upperEarningsLimit: Cents;
    employeeBps: number;
    employerBps: number;
    taxDeductible: boolean;
    /**
     * Where Tier II contributions are remitted.
     * "nssf" (default) → included in the standard NSSF return.
     * "private" → remitted to a separate approved pension fund;
     *   NSSF return shows Tier I only; a separate Pension Fund report is generated.
     */
    tier2Provider?: "nssf" | "private";
    /** Display name of the private Tier II provider, e.g. "Jubilee Pension Fund" */
    tier2ProviderName?: string;
  };
  health: {
    code: string;
    bps: number;
    minimum: Cents;
    maximum: Cents | null;
    taxDeductible: boolean;
  };
  levies: {
    code: string;
    employeeBps: number;
    employerBps: number;
    employerFlatPerEmployee?: Cents;
    cap: Cents | null;
    taxDeductible: boolean;
  }[];
  fringeBenefit: { deemedRateBps: number; taxBps: number };
  nonResident: { flatBps: number; reliefsApply: boolean };
  overtime: { normalBps: number; holidayBps: number };
  standardMonthlyHours: number;
  standardMonthlyDays: number;
}
