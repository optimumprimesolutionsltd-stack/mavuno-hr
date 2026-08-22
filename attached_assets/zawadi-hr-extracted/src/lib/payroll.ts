/**
 * PAYROLL ENGINE — pure, deterministic, integer-only.
 *
 * Contract:
 *   - Input and output are entirely in integer CENTS.
 *   - The engine is a PURE FUNCTION of (input, statutoryConfig). No DB, no
 *     clock, no globals. That is what makes it testable and what makes a run
 *     reproducible years later from its snapshotted config.
 *   - Nothing about Kenya is hardcoded. Country behaviour is data.
 *
 * Ordering of operations matters and is deliberate:
 *   1. Build gross (incl. proration, overtime, adjustments, non-cash benefits)
 *   2. Compute statutory contributions off gross
 *   3. Subtract *allowable deductions* to get taxable income
 *   4. Apply progressive bands -> PAYE before relief
 *   5. Subtract reliefs -> PAYE
 *   6. Subtract all deductions from CASH gross -> net pay
 *
 * Note step 6: non-cash benefits are TAXABLE but never PAID. Adding them to
 * the amount you disburse (as the previous version effectively did by folding
 * them into allowances) overstates every net pay figure in the run.
 */
import {
  type Cents, mulBps, mulRatio, zeroFloor, clampMax, clampMin, assertCents,
} from "@/lib/money";
import type { StatutoryConfig } from "@/lib/statutory/types";

export type { StatutoryConfig };

export interface PayInput {
  basicSalary: Cents;
  houseAllowance: Cents;
  transportAllowance: Cents;
  otherAllowance: Cents;
  /** Taxable but not disbursed (car, housing, staff loan benefit). */
  nonCashBenefit: Cents;

  insurancePremium: Cents;
  pensionEmployee: Cents;
  pensionEmployer: Cents;
  mortgageInterest: Cents;
  helbMonthly: Cents;
  saccoMonthly: Cents;
  loanInstallment: Cents;

  /** One-off earnings/deductions for this period only. */
  adjustmentEarningsTaxable: Cents;
  adjustmentEarningsNonTaxable: Cents;
  adjustmentDeductions: Cents;

  /** Overtime, from an approved timesheet. */
  overtimeHours: number;
  holidayHours: number;

  /** Proration. daysPayable < daysInPeriod for mid-month joiners/leavers and
   *  for unpaid leave. Casual staff are paid daysWorked at a daily rate. */
  daysInPeriod: number;
  daysPayable: number;

  employmentType: "permanent" | "contract" | "casual";
  residentStatus: "resident" | "non_resident";
  disabilityExemption: boolean;
}

export interface PayResult {
  basic: Cents;
  allowances: Cents;
  overtime: Cents;
  adjustmentEarnings: Cents;
  nonCashBenefit: Cents;
  gross: Cents;          // taxable base, incl. non-cash
  cashGross: Cents;      // what can actually be disbursed

  nssfEmployee: Cents;
  nssfEmployer: Cents;
  nssfTier1: Cents;
  nssfTier2: Cents;
  shif: Cents;
  housingLevyEmployee: Cents;
  housingLevyEmployer: Cents;
  pension: Cents;
  pensionEmployer: Cents;
  mortgageInterest: Cents;

  taxableIncome: Cents;
  payeBeforeRelief: Cents;
  personalRelief: Cents;
  insuranceRelief: Cents;
  paye: Cents;

  helb: Cents;
  sacco: Cents;
  loanDeduction: Cents;
  adjustmentDeductions: Cents;
  totalDeductions: Cents;
  netPay: Cents;
  employerCost: Cents;

  bands: { band: string; amount: Cents; bps: number; tax: Cents }[];
  warnings: string[];
}

/** Progressive band walk. Pure integer arithmetic. */
export function computeProgressiveTax(taxable: Cents, cfg: StatutoryConfig) {
  let remaining = taxable;
  let prev = 0;
  let tax = 0;
  const bands: PayResult["bands"] = [];

  for (const b of cfg.payeBands) {
    if (remaining <= 0) break;
    const width = b.upTo === null ? Infinity : b.upTo - prev;
    const amount = Math.min(remaining, width) as Cents;
    const bandTax = mulBps(amount, b.bps);
    bands.push({
      band: b.upTo === null ? `Above ${prev / 100}` : `${prev / 100} – ${b.upTo / 100}`,
      amount, bps: b.bps, tax: bandTax,
    });
    tax += bandTax;
    remaining -= amount;
    prev = b.upTo ?? prev;
  }
  return { tax: assertCents(tax), bands };
}

/** Tiered social security (Kenya NSSF Tier I / Tier II). */
export function computeSocialSecurity(gross: Cents, cfg: StatutoryConfig) {
  const { lowerEarningsLimit: lel, upperEarningsLimit: uel, employeeBps, employerBps } =
    cfg.socialSecurity;

  const tier1Base = Math.min(gross, lel) as Cents;
  const tier2Base = gross > lel ? (Math.min(gross, uel) - lel) as Cents : 0;

  const tier1 = mulBps(tier1Base, employeeBps);
  const tier2 = mulBps(tier2Base, employeeBps);
  const employee = (tier1 + tier2) as Cents;
  const employer = (mulBps(tier1Base, employerBps) + mulBps(tier2Base, employerBps)) as Cents;

  return { tier1, tier2, employee, employer };
}

export function computePayslip(e: PayInput, cfg: StatutoryConfig): PayResult {
  const warnings: string[] = [];

  /* ---------- 1. GROSS ---------- */
  const proratable = (e.basicSalary + e.houseAllowance + e.transportAllowance + e.otherAllowance) as Cents;

  const isCasual = e.employmentType === "casual";
  const fullMonth = e.daysPayable >= e.daysInPeriod;

  let earned: Cents;
  if (isCasual) {
    // Casuals are paid per day actually worked, at a derived daily rate.
    const dailyRate = mulRatio(proratable, 1, cfg.standardMonthlyDays);
    earned = (dailyRate * e.daysPayable) as Cents;
  } else if (fullMonth) {
    earned = proratable;
  } else {
    earned = mulRatio(proratable, e.daysPayable, e.daysInPeriod);
    warnings.push(`Prorated: ${e.daysPayable}/${e.daysInPeriod} days`);
  }

  // Split the prorated total back into basic/allowances for payslip display.
  const basic = proratable === 0 ? 0 : mulRatio(earned, e.basicSalary, proratable);
  const allowances = (earned - basic) as Cents;

  // Overtime, on the hourly rate derived from basic.
  const hourly = mulRatio(e.basicSalary, 1, cfg.standardMonthlyHours);
  const otNormal = mulBps((hourly * Math.max(0, e.overtimeHours)) as Cents, cfg.overtime.normalBps);
  const otHoliday = mulBps((hourly * Math.max(0, e.holidayHours)) as Cents, cfg.overtime.holidayBps);
  const overtime = (otNormal + otHoliday) as Cents;

  const adjustmentEarnings = (e.adjustmentEarningsTaxable + e.adjustmentEarningsNonTaxable) as Cents;

  // Taxable base includes non-cash benefits; cash gross does not.
  const gross = (earned + overtime + e.adjustmentEarningsTaxable + e.nonCashBenefit) as Cents;
  const cashGross = (earned + overtime + adjustmentEarnings) as Cents;

  /* ---------- 2. STATUTORY CONTRIBUTIONS (off gross) ---------- */
  const ss = isCasual
    ? { tier1: 0 as Cents, tier2: 0 as Cents, employee: 0 as Cents, employer: 0 as Cents }
    : computeSocialSecurity(gross, cfg);

  let health: Cents = 0;
  if (cfg.health.bps > 0 || cfg.health.minimum > 0) {
    health = clampMin(mulBps(gross, cfg.health.bps), cfg.health.minimum);
    if (cfg.health.maximum !== null) health = clampMax(health, cfg.health.maximum);
  }

  let levyEmployee: Cents = 0;
  let levyEmployer: Cents = 0;
  let levyTaxDeductible: Cents = 0;
  for (const l of cfg.levies) {
    const base = l.cap === null ? gross : (Math.min(gross, l.cap) as Cents);
    const emp = mulBps(base, l.employeeBps);
    let er = mulBps(base, l.employerBps);
    /* Flat per-employee employer levies (Kenya NITA: KES 50/employee/month).
     * Applied whenever the employee is payable at all this period. */
    if (l.employerFlatPerEmployee && (gross > 0 || e.daysPayable > 0)) {
      er = (er + l.employerFlatPerEmployee) as Cents;
    }
    levyEmployee = (levyEmployee + emp) as Cents;
    levyEmployer = (levyEmployer + er) as Cents;
    if (l.taxDeductible) levyTaxDeductible = (levyTaxDeductible + emp) as Cents;
  }

  const pension = clampMax(e.pensionEmployee, cfg.pensionDeductibleCap);
  if (e.pensionEmployee > cfg.pensionDeductibleCap) {
    warnings.push(`Pension contribution exceeds deductible cap; excess is not tax-deductible`);
  }
  const mortgage = clampMax(e.mortgageInterest, cfg.mortgageInterestCap);

  /* ---------- 3. TAXABLE INCOME ---------- */
  let allowable: Cents = 0;
  if (cfg.socialSecurity.taxDeductible) allowable = (allowable + ss.employee) as Cents;
  if (cfg.health.taxDeductible) allowable = (allowable + health) as Cents;
  allowable = (allowable + levyTaxDeductible + pension + mortgage) as Cents;

  let taxableIncome = zeroFloor((gross - allowable) as Cents);

  // Disability exemption: first N of income is tax-exempt.
  if (e.disabilityExemption && cfg.disabilityExemption > 0) {
    taxableIncome = zeroFloor((taxableIncome - cfg.disabilityExemption) as Cents);
  }

  /* ---------- 4 & 5. PAYE ---------- */
  const nonResident = e.residentStatus === "non_resident";
  let payeBeforeRelief: Cents;
  let bands: PayResult["bands"];
  let personalRelief: Cents = 0;
  let insuranceRelief: Cents = 0;
  let paye: Cents;

  if (nonResident) {
    payeBeforeRelief = mulBps(taxableIncome, cfg.nonResident.flatBps);
    bands = [{ band: "Non-resident flat rate", amount: taxableIncome, bps: cfg.nonResident.flatBps, tax: payeBeforeRelief }];
    if (cfg.nonResident.reliefsApply) {
      personalRelief = cfg.personalRelief;
      insuranceRelief = clampMax(mulBps(e.insurancePremium, cfg.insuranceRelief.bps), cfg.insuranceRelief.cap);
    }
    paye = zeroFloor((payeBeforeRelief - personalRelief - insuranceRelief) as Cents);
  } else {
    const res = computeProgressiveTax(taxableIncome, cfg);
    payeBeforeRelief = res.tax;
    bands = res.bands;
    personalRelief = cfg.personalRelief;
    insuranceRelief = clampMax(mulBps(e.insurancePremium, cfg.insuranceRelief.bps), cfg.insuranceRelief.cap);
    paye = zeroFloor((payeBeforeRelief - personalRelief - insuranceRelief) as Cents);
  }

  /* ---------- 6. NET ---------- */
  const totalDeductions = (paye + ss.employee + health + levyEmployee + pension +
    e.helbMonthly + e.saccoMonthly + e.loanInstallment + e.adjustmentDeductions) as Cents;

  let netPay = (cashGross - totalDeductions) as Cents;

  /* A negative net pay is almost always a data error (loan installment larger
   * than take-home). We surface it loudly rather than silently paying nothing;
   * the run summary will refuse to be approved with unresolved warnings. */
  if (netPay < 0) {
    warnings.push(`NEGATIVE NET PAY — deductions exceed cash earnings by ${-netPay / 100}`);
  }

  const employerCost = (cashGross + ss.employer + levyEmployer + e.pensionEmployer) as Cents;

  return {
    basic, allowances, overtime, adjustmentEarnings, nonCashBenefit: e.nonCashBenefit,
    gross, cashGross,
    nssfEmployee: ss.employee, nssfEmployer: ss.employer,
    nssfTier1: ss.tier1, nssfTier2: ss.tier2,
    shif: health,
    housingLevyEmployee: levyEmployee, housingLevyEmployer: levyEmployer,
    pension, pensionEmployer: e.pensionEmployer, mortgageInterest: mortgage,
    taxableIncome, payeBeforeRelief, personalRelief, insuranceRelief, paye,
    helb: e.helbMonthly, sacco: e.saccoMonthly,
    loanDeduction: e.loanInstallment, adjustmentDeductions: e.adjustmentDeductions,
    totalDeductions, netPay, employerCost,
    bands, warnings,
  };
}

/** Convenience: an all-zero input you can spread over. */
export const emptyPayInput = (): PayInput => ({
  basicSalary: 0, houseAllowance: 0, transportAllowance: 0, otherAllowance: 0,
  nonCashBenefit: 0, insurancePremium: 0, pensionEmployee: 0, pensionEmployer: 0,
  mortgageInterest: 0, helbMonthly: 0, saccoMonthly: 0, loanInstallment: 0,
  adjustmentEarningsTaxable: 0, adjustmentEarningsNonTaxable: 0, adjustmentDeductions: 0,
  overtimeHours: 0, holidayHours: 0,
  daysInPeriod: 30, daysPayable: 30,
  employmentType: "permanent", residentStatus: "resident", disabilityExemption: false,
});

/**
 * NET-TO-GROSS solver ("pay this person exactly KES X net").
 *
 * Common in Kenya for negotiated-net contracts and expatriates: the offer
 * letter states net pay, and payroll must derive the basic salary that
 * produces it. There is no closed form — PAYE bands, NSSF tiers, the SHIF
 * floor and reliefs all kink the function — so we binary-search on basic.
 *
 * The function net(basic) is monotonically non-decreasing, which makes
 * bisection safe. We converge to the cent, then nudge to the smallest basic
 * whose net is >= the target (never underpay against a net contract).
 */
export function solveGrossForNet(
  targetNet: Cents,
  template: Omit<PayInput, "basicSalary">,
  cfg: StatutoryConfig,
  opts: { maxIterations?: number } = {},
): { basicSalary: Cents; result: PayResult; iterations: number } {
  const maxIter = opts.maxIterations ?? 60;
  const netFor = (basic: Cents) => computePayslip({ ...template, basicSalary: basic }, cfg);

  let lo: Cents = 0;
  /* Upper bound: net can never exceed cash gross, so basic = targetNet + fixed
   * deductions + generous tax headroom always overshoots. Double until it does. */
  let hi: Cents = Math.max(targetNet * 2, 100_00);
  let hiRes = netFor(hi);
  let guard = 0;
  while (hiRes.netPay < targetNet && guard++ < 40) {
    hi *= 2;
    hiRes = netFor(hi);
  }
  if (hiRes.netPay < targetNet) {
    throw new Error("Could not bracket the target net pay — check the inputs");
  }

  let iterations = 0;
  while (hi - lo > 1 && iterations < maxIter) {
    iterations++;
    const mid = Math.floor((lo + hi) / 2) as Cents;
    if (netFor(mid).netPay >= targetNet) hi = mid;
    else lo = mid;
  }

  const result = netFor(hi);
  return { basicSalary: hi, result, iterations };
}

/**
 * FRINGE BENEFIT TAX on a low-interest employee loan (employer liability).
 * benefit = balance x max(0, deemedRate - loanRate) / 12 ; FBT = benefit x taxBps.
 * Returns zero when the config has no FBT regime or the loan rate meets market.
 */
export function computeLoanFringeBenefitTax(
  balance: Cents,
  loanRateBps: number,
  cfg: StatutoryConfig,
): { monthlyBenefit: Cents; monthlyTax: Cents } {
  const spread = cfg.fringeBenefit.deemedRateBps - loanRateBps;
  if (spread <= 0 || cfg.fringeBenefit.taxBps === 0 || balance <= 0) {
    return { monthlyBenefit: 0, monthlyTax: 0 };
  }
  const annualBenefit = mulBps(balance, spread);
  const monthlyBenefit = mulRatio(annualBenefit, 1, 12);
  return { monthlyBenefit, monthlyTax: mulBps(monthlyBenefit, cfg.fringeBenefit.taxBps) };
}
