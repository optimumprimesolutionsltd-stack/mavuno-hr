import {
  type Cents, mulBps, mulRatio, zeroFloor, clampMax, clampMin, assertCents,
} from "./money.js";
import type { StatutoryConfig } from "./statutory-types.js";

export type { StatutoryConfig };

export interface PayInput {
  basicSalary: Cents;
  houseAllowance: Cents;
  transportAllowance: Cents;
  otherAllowance: Cents;
  nonCashBenefit: Cents;
  insurancePremium: Cents;
  pensionEmployee: Cents;
  pensionEmployer: Cents;
  mortgageInterest: Cents;
  helbMonthly: Cents;
  saccoMonthly: Cents;
  loanInstallment: Cents;
  adjustmentEarningsTaxable: Cents;
  adjustmentEarningsNonTaxable: Cents;
  adjustmentDeductions: Cents;
  overtimeHours: number;
  holidayHours: number;
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
  gross: Cents;
  cashGross: Cents;
  nssfEmployee: Cents;
  nssfEmployer: Cents;
  nssfTier1: Cents;
  nssfTier2: Cents;
  nssfTier1Employer: Cents;
  nssfTier2Employer: Cents;
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
  insurancePremium: Cents;
  totalDeductions: Cents;
  netPay: Cents;
  employerCost: Cents;
  bands: { band: string; amount: Cents; bps: number; tax: Cents }[];
  warnings: string[];
}

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

export function computeSocialSecurity(gross: Cents, cfg: StatutoryConfig) {
  const { lowerEarningsLimit: lel, upperEarningsLimit: uel, employeeBps, employerBps } = cfg.socialSecurity;
  const tier1Base = Math.min(gross, lel) as Cents;
  const tier2Base = gross > lel ? (Math.min(gross, uel) - lel) as Cents : 0;
  const tier1 = mulBps(tier1Base, employeeBps);
  const tier2 = mulBps(tier2Base, employeeBps);
  const employee = (tier1 + tier2) as Cents;
  const tier1Employer = mulBps(tier1Base, employerBps);
  const tier2Employer = mulBps(tier2Base, employerBps);
  const employer = (tier1Employer + tier2Employer) as Cents;
  return { tier1, tier2, employee, tier1Employer, tier2Employer, employer };
}

export function computePayslip(e: PayInput, cfg: StatutoryConfig): PayResult {
  const warnings: string[] = [];

  const proratable = (e.basicSalary + e.houseAllowance + e.transportAllowance + e.otherAllowance) as Cents;
  const isCasual = e.employmentType === "casual";
  const fullMonth = e.daysPayable >= e.daysInPeriod;

  let earned: Cents;
  if (isCasual) {
    const dailyRate = mulRatio(proratable, 1, cfg.standardMonthlyDays);
    earned = (dailyRate * e.daysPayable) as Cents;
  } else if (fullMonth) {
    earned = proratable;
  } else {
    earned = mulRatio(proratable, e.daysPayable, e.daysInPeriod);
    warnings.push(`Prorated: ${e.daysPayable}/${e.daysInPeriod} days`);
  }

  const basic = proratable === 0 ? 0 : mulRatio(earned, e.basicSalary, proratable);
  const allowances = (earned - basic) as Cents;

  const hourly = mulRatio(e.basicSalary, 1, cfg.standardMonthlyHours);
  const otNormal = mulBps((hourly * Math.max(0, e.overtimeHours)) as Cents, cfg.overtime.normalBps);
  const otHoliday = mulBps((hourly * Math.max(0, e.holidayHours)) as Cents, cfg.overtime.holidayBps);
  const overtime = (otNormal + otHoliday) as Cents;

  const adjustmentEarnings = (e.adjustmentEarningsTaxable + e.adjustmentEarningsNonTaxable) as Cents;
  const gross = (earned + overtime + e.adjustmentEarningsTaxable + e.nonCashBenefit) as Cents;
  const cashGross = (earned + overtime + adjustmentEarnings) as Cents;

  const ss = isCasual
    ? {
        tier1: 0 as Cents, tier2: 0 as Cents, employee: 0 as Cents,
        tier1Employer: 0 as Cents, tier2Employer: 0 as Cents, employer: 0 as Cents,
      }
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
    if (l.employerFlatPerEmployee && (gross > 0 || e.daysPayable > 0)) {
      er = (er + l.employerFlatPerEmployee) as Cents;
    }
    levyEmployee = (levyEmployee + emp) as Cents;
    levyEmployer = (levyEmployer + er) as Cents;
    if (l.taxDeductible) levyTaxDeductible = (levyTaxDeductible + emp) as Cents;
  }

  const pension = clampMax(e.pensionEmployee, cfg.pensionDeductibleCap);
  if (e.pensionEmployee > cfg.pensionDeductibleCap) {
    warnings.push("Pension contribution exceeds deductible cap; excess is not tax-deductible");
  }
  const mortgage = clampMax(e.mortgageInterest, cfg.mortgageInterestCap);

  let allowable: Cents = 0;
  if (cfg.socialSecurity.taxDeductible) allowable = (allowable + ss.employee) as Cents;
  if (cfg.health.taxDeductible) allowable = (allowable + health) as Cents;
  allowable = (allowable + levyTaxDeductible + pension + mortgage) as Cents;

  let taxableIncome = zeroFloor((gross - allowable) as Cents);
  if (e.disabilityExemption && cfg.disabilityExemption > 0) {
    taxableIncome = zeroFloor((taxableIncome - cfg.disabilityExemption) as Cents);
  }

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

  const totalDeductions = (paye + ss.employee + health + levyEmployee + pension +
    e.helbMonthly + e.saccoMonthly + e.loanInstallment + e.adjustmentDeductions +
    e.insurancePremium) as Cents;

  let netPay = (cashGross - totalDeductions) as Cents;
  if (netPay < 0) {
    warnings.push(`NEGATIVE NET PAY — deductions exceed cash earnings by ${-netPay / 100}`);
  }

  const employerCost = (cashGross + ss.employer + levyEmployer + e.pensionEmployer) as Cents;

  return {
    basic, allowances, overtime, adjustmentEarnings, nonCashBenefit: e.nonCashBenefit,
    gross, cashGross,
    nssfEmployee: ss.employee, nssfEmployer: ss.employer,
    nssfTier1: ss.tier1, nssfTier2: ss.tier2,
    nssfTier1Employer: ss.tier1Employer, nssfTier2Employer: ss.tier2Employer,
    shif: health,
    housingLevyEmployee: levyEmployee, housingLevyEmployer: levyEmployer,
    pension, pensionEmployer: e.pensionEmployer, mortgageInterest: mortgage,
    taxableIncome, payeBeforeRelief, personalRelief, insuranceRelief, paye,
    helb: e.helbMonthly, sacco: e.saccoMonthly,
    loanDeduction: e.loanInstallment, adjustmentDeductions: e.adjustmentDeductions,
    insurancePremium: e.insurancePremium,
    totalDeductions, netPay, employerCost,
    bands, warnings,
  };
}

export const emptyPayInput = (): PayInput => ({
  basicSalary: 0, houseAllowance: 0, transportAllowance: 0, otherAllowance: 0,
  nonCashBenefit: 0, insurancePremium: 0, pensionEmployee: 0, pensionEmployer: 0,
  mortgageInterest: 0, helbMonthly: 0, saccoMonthly: 0, loanInstallment: 0,
  adjustmentEarningsTaxable: 0, adjustmentEarningsNonTaxable: 0, adjustmentDeductions: 0,
  overtimeHours: 0, holidayHours: 0,
  daysInPeriod: 30, daysPayable: 30,
  employmentType: "permanent", residentStatus: "resident", disabilityExemption: false,
});

export function solveGrossForNet(
  targetNet: Cents,
  template: Omit<PayInput, "basicSalary">,
  cfg: StatutoryConfig,
  opts: { maxIterations?: number } = {},
): { basicSalary: Cents; result: PayResult; iterations: number } {
  const maxIter = opts.maxIterations ?? 60;
  const netFor = (basic: Cents) => computePayslip({ ...template, basicSalary: basic }, cfg);

  let lo: Cents = 0;
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
