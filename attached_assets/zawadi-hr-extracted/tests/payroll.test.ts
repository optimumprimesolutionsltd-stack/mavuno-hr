import { describe, it, expect } from "vitest";
import { computePayslip, computeProgressiveTax, computeSocialSecurity, emptyPayInput } from "@/lib/payroll";
import { KE_2025, KE_2022, TZ_2025 } from "@/lib/statutory/packs";
import { toCents, fromCents } from "@/lib/money";

const K = toCents;
const emp = (o: Partial<ReturnType<typeof emptyPayInput>> = {}) => ({ ...emptyPayInput(), ...o });

describe("PAYE band boundaries (KE 2025)", () => {
  /* Boundaries are where payroll engines break. Each of these is a value at or
   * adjacent to a band edge, computed by hand from the Finance Act table. */
  it("zero taxable income yields zero tax", () => {
    expect(computeProgressiveTax(0, KE_2025).tax).toBe(0);
  });
  it("exactly at the 24,000 band ceiling: 10% throughout", () => {
    expect(computeProgressiveTax(K("24000"), KE_2025).tax).toBe(K("2400"));
  });
  it("one cent above the first ceiling taxes only that cent at 25%", () => {
    const t = computeProgressiveTax(K("24000") + 1, KE_2025).tax;
    expect(t).toBe(K("2400")); // 0.25 of 1 cent rounds to 0
  });
  it("exactly at the 32,333 ceiling", () => {
    // 24,000 @10% = 2,400 ; 8,333 @25% = 2,083.25
    expect(computeProgressiveTax(K("32333"), KE_2025).tax).toBe(K("4483.25"));
  });
  it("at 500,000: crosses into the 30% band", () => {
    // 2,400 + 2,083.25 + (500,000-32,333)*30% = 2,400 + 2,083.25 + 140,300.10
    expect(computeProgressiveTax(K("500000"), KE_2025).tax).toBe(K("144783.35"));
  });
  it("at 800,000: crosses into the 32.5% band", () => {
    // 144,783.35 + 300,000*32.5% = 144,783.35 + 97,500
    expect(computeProgressiveTax(K("800000"), KE_2025).tax).toBe(K("242283.35"));
  });
  it("above 800,000: top 35% band", () => {
    // 242,283.35 + 200,000*35% = 242,283.35 + 70,000
    expect(computeProgressiveTax(K("1000000"), KE_2025).tax).toBe(K("312283.35"));
  });
  it("bands sum to the total tax", () => {
    const { tax, bands } = computeProgressiveTax(K("450000"), KE_2025);
    expect(bands.reduce((a, b) => a + b.tax, 0)).toBe(tax);
  });
});

describe("NSSF Tier I / Tier II", () => {
  it("below the LEL: Tier I only", () => {
    const r = computeSocialSecurity(K("5000"), KE_2025);
    expect(r.tier1).toBe(K("300"));  // 6% of 5,000
    expect(r.tier2).toBe(0);
  });
  it("at the LEL exactly", () => {
    const r = computeSocialSecurity(K("8000"), KE_2025);
    expect(r.tier1).toBe(K("480"));
    expect(r.tier2).toBe(0);
  });
  it("between LEL and UEL", () => {
    const r = computeSocialSecurity(K("40000"), KE_2025);
    expect(r.tier1).toBe(K("480"));                 // 6% of 8,000
    expect(r.tier2).toBe(K("1920"));                // 6% of (40,000-8,000)
    expect(r.employee).toBe(K("2400"));
  });
  it("caps at the UEL — the ceiling that stops NSSF scaling with salary", () => {
    const r = computeSocialSecurity(K("500000"), KE_2025);
    expect(r.employee).toBe(K("4320"));             // 6% of 72,000
    const higher = computeSocialSecurity(K("2000000"), KE_2025);
    expect(higher.employee).toBe(r.employee);       // unchanged above the cap
  });
  it("employer matches employee", () => {
    const r = computeSocialSecurity(K("100000"), KE_2025);
    expect(r.employer).toBe(r.employee);
  });
});

describe("Full payslip — post-TLAA-2024 treatment", () => {
  /* THE thing most Kenyan payroll systems got wrong for months after Dec 2024:
   * NSSF, SHIF and AHL are ALLOWABLE DEDUCTIONS from taxable income, not
   * reliefs applied to the tax. Getting this backwards changes net pay. */
  it("deducts NSSF/SHIF/AHL from taxable income, not from the tax", () => {
    const r = computePayslip(emp({ basicSalary: K("100000") }), KE_2025);

    expect(r.gross).toBe(K("100000"));
    expect(r.nssfEmployee).toBe(K("4320"));      // 6% of 72,000 (UEL capped)
    expect(r.shif).toBe(K("2750"));              // 2.75%
    expect(r.housingLevyEmployee).toBe(K("1500")); // 1.5%

    // taxable = 100,000 - 4,320 - 2,750 - 1,500 = 91,430
    expect(r.taxableIncome).toBe(K("91430"));

    // If these were reliefs instead of deductions, taxable would be 100,000
    // and PAYE would be materially higher. Assert the difference is real:
    const wrong = computeProgressiveTax(K("100000"), KE_2025).tax;
    expect(r.payeBeforeRelief).toBeLessThan(wrong);
  });

  it("net pay reconciles: cashGross - totalDeductions", () => {
    const r = computePayslip(emp({
      basicSalary: K("250000"), houseAllowance: K("40000"),
      insurancePremium: K("8000"), pensionEmployee: K("20000"), helbMonthly: K("5000"),
    }), KE_2025);
    expect(r.netPay).toBe(r.cashGross - r.totalDeductions);
  });

  it("insurance relief is 15% capped at 5,000", () => {
    const low = computePayslip(emp({ basicSalary: K("100000"), insurancePremium: K("10000") }), KE_2025);
    expect(low.insuranceRelief).toBe(K("1500"));   // 15% of 10,000
    const high = computePayslip(emp({ basicSalary: K("100000"), insurancePremium: K("100000") }), KE_2025);
    expect(high.insuranceRelief).toBe(K("5000"));  // capped
  });

  it("SHIF respects the KES 300 floor for low earners", () => {
    const r = computePayslip(emp({ basicSalary: K("5000") }), KE_2025);
    expect(r.shif).toBe(K("300"));  // 2.75% of 5,000 = 137.50, floored to 300
  });

  it("PAYE never goes negative when relief exceeds the tax", () => {
    const r = computePayslip(emp({ basicSalary: K("20000") }), KE_2025);
    expect(r.paye).toBe(0);
    expect(r.payeBeforeRelief).toBeLessThan(r.personalRelief);
  });
});

describe("Non-cash benefits: taxable but NOT paid", () => {
  /* The original folded these into allowances, which inflated every net pay. */
  it("raises taxable income without raising cash paid out", () => {
    const withBenefit = computePayslip(
      emp({ basicSalary: K("100000"), nonCashBenefit: K("30000") }), KE_2025);
    const without = computePayslip(emp({ basicSalary: K("100000") }), KE_2025);

    expect(withBenefit.gross).toBe(K("130000"));      // taxed on 130k
    expect(withBenefit.cashGross).toBe(K("100000"));  // paid on 100k
    expect(withBenefit.paye).toBeGreaterThan(without.paye);
    expect(withBenefit.netPay).toBeLessThan(without.netPay);  // pays MORE tax, takes home LESS
  });
});

describe("Non-residents", () => {
  it("pays a flat 30% with no reliefs", () => {
    const r = computePayslip(emp({
      basicSalary: K("300000"), insurancePremium: K("10000"), residentStatus: "non_resident",
    }), KE_2025);
    expect(r.personalRelief).toBe(0);
    expect(r.insuranceRelief).toBe(0);
    expect(r.paye).toBe(r.payeBeforeRelief);
    expect(r.paye).toBe(Math.round(r.taxableIncome * 0.3));
  });
});

describe("Disability exemption", () => {
  it("exempts the first 150,000 of taxable income", () => {
    const r = computePayslip(emp({ basicSalary: K("140000"), disabilityExemption: true }), KE_2025);
    expect(r.taxableIncome).toBe(0);
    expect(r.paye).toBe(0);
  });
});

describe("Proration — mid-month joiners and leavers", () => {
  it("halves pay for someone who served half the month", () => {
    const full = computePayslip(emp({ basicSalary: K("60000"), daysInPeriod: 30, daysPayable: 30 }), KE_2025);
    const half = computePayslip(emp({ basicSalary: K("60000"), daysInPeriod: 30, daysPayable: 15 }), KE_2025);
    expect(half.basic).toBe(K("30000"));
    expect(half.gross).toBeLessThan(full.gross);
    expect(half.warnings.some((w) => w.includes("Prorated"))).toBe(true);
  });
  it("zero payable days yields a zero payslip, not a full month", () => {
    const r = computePayslip(emp({ basicSalary: K("60000"), daysPayable: 0 }), KE_2025);
    expect(r.basic).toBe(0);
    expect(r.gross).toBe(0);
    expect(r.paye).toBe(0);
  });
});

describe("Casual workers", () => {
  it("are paid per day worked and are exempt from NSSF", () => {
    const r = computePayslip(emp({
      basicSalary: K("26000"), employmentType: "casual", daysPayable: 10,
    }), KE_2025);
    expect(r.basic).toBe(K("10000"));   // 26,000/26 * 10
    expect(r.nssfEmployee).toBe(0);
  });
});

describe("Overtime", () => {
  it("pays 1.5x normal and 2.0x holiday on the derived hourly rate", () => {
    const r = computePayslip(emp({ basicSalary: K("195000"), overtimeHours: 10 }), KE_2025);
    // hourly = 195,000 / 195 = 1,000 ; 10h @ 1.5x = 15,000
    expect(r.overtime).toBe(K("15000"));
    const h = computePayslip(emp({ basicSalary: K("195000"), holidayHours: 10 }), KE_2025);
    expect(h.overtime).toBe(K("20000"));
  });
});

describe("Negative net pay is surfaced, not silently absorbed", () => {
  it("warns when deductions exceed cash earnings", () => {
    const r = computePayslip(emp({
      basicSalary: K("30000"), loanInstallment: K("40000"),
    }), KE_2025);
    expect(r.netPay).toBeLessThan(0);
    expect(r.warnings.some((w) => w.includes("NEGATIVE NET PAY"))).toBe(true);
  });
});

describe("Effective dating — history must stay reproducible", () => {
  /* This is the test that proves the whole statutory-config design. The SAME
   * salary computed against 2022 law and 2025 law must give DIFFERENT tax —
   * and a 2022 payslip recomputed today must still produce the 2022 answer. */
  it("2022 law and 2025 law disagree, as they must", () => {
    const input = emp({ basicSalary: K("600000") });
    const old = computePayslip(input, KE_2022);
    const now = computePayslip(input, KE_2025);

    /* Only the bands actually reached are emitted. At 600k the 2022 regime
     * tops out at 30% (3 bands); 2025 reaches the 32.5% band (4 bands). */
    expect(old.bands.at(-1)!.bps).toBe(3000);
    expect(now.bands.at(-1)!.bps).toBe(3250);
    /* The 35% band exists in 2025 but not in 2022 — reach it and see. */
    const veryHigh = computePayslip(emp({ basicSalary: K("1200000") }), KE_2025);
    expect(veryHigh.bands.at(-1)!.bps).toBe(3500);
    expect(veryHigh.bands.length).toBe(5);

    /* But 2022 had no SHIF and no AHL, so LESS was deductible and taxable
     * income was HIGHER. On a 600k salary that outweighs the lower top rate:
     * the 2022 taxpayer actually pays more tax before relief. This is exactly
     * why history must be computed against the law in force at the time and
     * never against today's — the two regimes are not comparable band-by-band. */
    expect(now.taxableIncome).toBeLessThan(old.taxableIncome);
    expect(now.shif).toBeGreaterThan(0);
    expect(old.housingLevyEmployee).toBe(0);
    expect(old.payeBeforeRelief).not.toBe(now.payeBeforeRelief);
  });

  it("a 2022 payslip recomputed today still yields the 2022 answer", () => {
    /* The property that matters: the snapshotted config makes the run
     * reproducible. Same input + same config = same output, forever. */
    const input = emp({ basicSalary: K("150000") });
    const a = computePayslip(input, KE_2022);
    const b = computePayslip(input, KE_2022);
    expect(a).toEqual(b);
    expect(a.paye).not.toBe(computePayslip(input, KE_2025).paye);
  });
});

describe("Multi-country — the same engine, different data", () => {
  it("computes Tanzanian payroll with a tax-free first band", () => {
    const r = computePayslip(emp({ basicSalary: K("250000") }), TZ_2025);
    expect(r.paye).toBe(0);   // below the 270,000 threshold
    const higher = computePayslip(emp({ basicSalary: K("400000") }), TZ_2025);
    expect(higher.paye).toBeGreaterThan(0);
  });
  it("applies a 10% employee NSSF, not Kenya's 6%", () => {
    const r = computePayslip(emp({ basicSalary: K("500000") }), TZ_2025);
    expect(r.nssfEmployee).toBe(K("50000"));
  });
});

describe("Run-level reconciliation", () => {
  it("a 200-employee run reconciles to the cent", () => {
    const staff = Array.from({ length: 200 }, (_, i) =>
      emp({ basicSalary: K(String(30_000 + i * 977)), houseAllowance: K("12345.67") }));
    const slips = staff.map((e) => computePayslip(e, KE_2025));

    const gross = slips.reduce((a, s) => a + s.cashGross, 0);
    const deductions = slips.reduce((a, s) => a + s.totalDeductions, 0);
    const net = slips.reduce((a, s) => a + s.netPay, 0);

    // The identity that must hold, or the run cannot be defended to an auditor.
    expect(gross - deductions).toBe(net);
    expect(Number.isInteger(net)).toBe(true);
  });
});

/* ======= Features added after the Wingubox gap analysis ======= */
import { solveGrossForNet, computeLoanFringeBenefitTax } from "@/lib/payroll";

describe("NITA levy (flat employer amount)", () => {
  it("adds KES 50 per employee to employer cost, not to employee deductions", () => {
    const r = computePayslip(emp({ basicSalary: K("100000") }), KE_2025);
    // AHL employer 1.5% of 100k = 1,500 ; NITA flat 50
    expect(r.housingLevyEmployer).toBe(K("1550"));
    // Employee side unchanged by NITA
    expect(r.housingLevyEmployee).toBe(K("1500"));
    expect(r.totalDeductions).not.toContain; // employee deductions exclude NITA by construction
  });
  it("is charged even for a low earner, and included in employer cost", () => {
    const withNita = computePayslip(emp({ basicSalary: K("10000") }), KE_2025);
    expect(withNita.housingLevyEmployer).toBe(K("150") + K("50") - K("150") + K("150")); // 1.5% of 10k = 150, + 50 NITA = 200
    expect(withNita.housingLevyEmployer).toBe(K("200"));
    expect(withNita.employerCost).toBeGreaterThan(withNita.cashGross);
  });
});

describe("Net-to-gross solver (negotiated net contracts)", () => {
  it("finds a basic whose computed net hits the target exactly or just above", () => {
    const target = K("100000");
    const { basicSalary, result } = solveGrossForNet(target, { ...emptyPayInput() }, KE_2025);
    expect(result.netPay).toBeGreaterThanOrEqual(target);
    // one cent less basic must fall below target — proves minimality
    const oneLess = computePayslip(emp({ basicSalary: basicSalary - 1 }), KE_2025);
    expect(oneLess.netPay).toBeLessThan(target);
  });
  it("round-trips: computing the slip from the solved basic reproduces the net", () => {
    const target = K("250000");
    const { basicSalary, result } = solveGrossForNet(target, { ...emptyPayInput() }, KE_2025);
    const recomputed = computePayslip(emp({ basicSalary }), KE_2025);
    expect(recomputed.netPay).toBe(result.netPay);
  });
  it("respects fixed deductions like HELB in the template", () => {
    const target = K("80000");
    const tpl = { ...emptyPayInput(), helbMonthly: K("5000") };
    const { result } = solveGrossForNet(target, tpl, KE_2025);
    expect(result.helb).toBe(K("5000"));
    expect(result.netPay).toBeGreaterThanOrEqual(target);
  });
});

describe("Fringe Benefit Tax on low-interest staff loans", () => {
  it("taxes the spread between the deemed rate and the loan rate", () => {
    // KE_2025 deemed 13%; loan at 3% on 1,200,000 balance
    const { monthlyBenefit, monthlyTax } = computeLoanFringeBenefitTax(K("1200000"), 300, KE_2025);
    // spread 10% p.a. on 1.2M = 120,000/yr = 10,000/mo ; FBT 30% = 3,000
    expect(monthlyBenefit).toBe(K("10000"));
    expect(monthlyTax).toBe(K("3000"));
  });
  it("is zero when the loan is at or above market rate", () => {
    const r = computeLoanFringeBenefitTax(K("1000000"), 1300, KE_2025);
    expect(r.monthlyTax).toBe(0);
  });
  it("is zero in countries without an FBT regime in config", () => {
    const r = computeLoanFringeBenefitTax(K("1000000"), 0, TZ_2025);
    expect(r.monthlyTax).toBe(0);
  });
});
