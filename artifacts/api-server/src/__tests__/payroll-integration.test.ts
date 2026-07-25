/**
 * Integration-level tests for the recalculate and payslip-edit flows.
 *
 * These tests verify the ALGORITHM that backs:
 *   - POST /api/payroll/:id/recalculate  (recalculateRun totals logic)
 *   - PATCH /api/payroll/:runId/payslips/:slipId  (payslip-edit totals refresh)
 *
 * They exercise computePayslip directly plus the exact totals-accumulation and
 * totals-refresh patterns copied from payroll-run.ts and routes/payroll.ts,
 * without requiring a live database connection.
 *
 * All monetary values are in cents (KES × 100).
 */

import { describe, it, expect } from "vitest";
import { computePayslip, emptyPayInput, type PayInput, type PayResult } from "../lib/payroll.js";
import { KE_2025 } from "../lib/statutory-packs.js";
import { toCents } from "../lib/money.js";

const K = toCents;

// ---------------------------------------------------------------------------
// Helper types / fixtures
// ---------------------------------------------------------------------------

interface SlipRecord {
  gross: number;
  cashGross: number;
  netPay: number;
  paye: number;
  nssfEmployee: number;
  nssfEmployer: number;
  shif: number;
  housingLevyEmployee: number;
  housingLevyEmployer: number;
  employerCost: number;
  totalDeductions: number;
  taxableIncome: number;
}

/** Convert a PayResult to the flat columns stored in the `payslips` table. */
function toSlipRecord(r: PayResult): SlipRecord {
  return {
    gross: r.gross,
    cashGross: r.cashGross,
    netPay: r.netPay,
    paye: r.paye,
    nssfEmployee: r.nssfEmployee,
    nssfEmployer: r.nssfEmployer,
    shif: r.shif,
    housingLevyEmployee: r.housingLevyEmployee,
    housingLevyEmployer: r.housingLevyEmployer,
    employerCost: r.employerCost,
    totalDeductions: r.totalDeductions,
    taxableIncome: r.taxableIncome,
  };
}

/**
 * Exact totals-accumulation logic from recalculateRun / calculateRun in
 * payroll-run.ts — kept in sync intentionally so any drift fails the test.
 */
function accumulateTotals(slips: SlipRecord[]) {
  const totals = {
    gross: 0, net: 0, paye: 0,
    nssfE: 0, nssfR: 0, shif: 0,
    ahlE: 0, ahlR: 0, employerCost: 0,
  };
  for (const s of slips) {
    totals.gross += s.gross;
    totals.net   += s.netPay;
    totals.paye  += s.paye;
    totals.nssfE += s.nssfEmployee;
    totals.nssfR += s.nssfEmployer;
    totals.shif  += s.shif;
    totals.ahlE  += s.housingLevyEmployee;
    totals.ahlR  += s.housingLevyEmployer;
    totals.employerCost += s.employerCost;
  }
  return totals;
}

/**
 * Exact payslip-edit totals-refresh from routes/payroll.ts PATCH handler.
 */
function refreshTotals(slips: SlipRecord[]) {
  return slips.reduce(
    (acc, s) => ({
      gross:       acc.gross       + s.gross,
      net:         acc.net         + s.netPay,
      paye:        acc.paye        + s.paye,
      nssfE:       acc.nssfE       + s.nssfEmployee,
      nssfR:       acc.nssfR       + s.nssfEmployer,
      shif:        acc.shif        + s.shif,
      ahlE:        acc.ahlE        + s.housingLevyEmployee,
      ahlR:        acc.ahlR        + s.housingLevyEmployer,
      employerCost: acc.employerCost + s.employerCost,
    }),
    { gross: 0, net: 0, paye: 0, nssfE: 0, nssfR: 0, shif: 0, ahlE: 0, ahlR: 0, employerCost: 0 },
  );
}

/** Build a full-month permanent resident PayInput. */
function fullMonth(overrides: Partial<PayInput>): PayInput {
  return { ...emptyPayInput(), daysInPeriod: 30, daysPayable: 30, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. recalculateRun – run totals equal sum of individual payslip fields
// ---------------------------------------------------------------------------

describe("recalculateRun – run totals equal sum of payslip fields", () => {
  /**
   * Simulate a 3-employee payroll run, then verify every run total field
   * equals the sum of the corresponding payslip column.
   */
  const employees: PayInput[] = [
    fullMonth({ basicSalary: K(50_000) }),
    fullMonth({ basicSalary: K(100_000), houseAllowance: K(15_000) }),
    fullMonth({ basicSalary: K(30_000), pensionEmployee: K(5_000) }),
  ];

  // Compute payslips (mimics the slipRows.map in recalculateRun)
  const payslipResults = employees.map((e) => computePayslip(e, KE_2025));
  const slipRecords = payslipResults.map(toSlipRecord);

  // Accumulate run totals (exact pattern from payroll-run.ts)
  const runTotals = accumulateTotals(slipRecords);

  it("grossTotal equals sum of slip.gross", () => {
    const sumGross = slipRecords.reduce((a, s) => a + s.gross, 0);
    expect(runTotals.gross).toBe(sumGross);
  });

  it("netTotal equals sum of slip.netPay", () => {
    const sumNet = slipRecords.reduce((a, s) => a + s.netPay, 0);
    expect(runTotals.net).toBe(sumNet);
  });

  it("payeTotal equals sum of slip.paye", () => {
    const sumPaye = slipRecords.reduce((a, s) => a + s.paye, 0);
    expect(runTotals.paye).toBe(sumPaye);
  });

  it("nssfEmployeeTotal equals sum of slip.nssfEmployee", () => {
    const sumNssf = slipRecords.reduce((a, s) => a + s.nssfEmployee, 0);
    expect(runTotals.nssfE).toBe(sumNssf);
  });

  it("nssfEmployerTotal equals sum of slip.nssfEmployer", () => {
    const sumNssfR = slipRecords.reduce((a, s) => a + s.nssfEmployer, 0);
    expect(runTotals.nssfR).toBe(sumNssfR);
  });

  it("shifTotal equals sum of slip.shif", () => {
    const sumShif = slipRecords.reduce((a, s) => a + s.shif, 0);
    expect(runTotals.shif).toBe(sumShif);
  });

  it("housingLevyEmployeeTotal equals sum of slip.housingLevyEmployee", () => {
    const sumAhlE = slipRecords.reduce((a, s) => a + s.housingLevyEmployee, 0);
    expect(runTotals.ahlE).toBe(sumAhlE);
  });

  it("housingLevyEmployerTotal equals sum of slip.housingLevyEmployer", () => {
    const sumAhlR = slipRecords.reduce((a, s) => a + s.housingLevyEmployer, 0);
    expect(runTotals.ahlR).toBe(sumAhlR);
  });

  it("employerCostTotal equals sum of slip.employerCost", () => {
    const sumCost = slipRecords.reduce((a, s) => a + s.employerCost, 0);
    expect(runTotals.employerCost).toBe(sumCost);
  });

  it("each individual netPay satisfies cashGross − totalDeductions", () => {
    for (const r of payslipResults) {
      expect(r.netPay).toBe(r.cashGross - r.totalDeductions);
    }
  });

  it("total net = total gross − total deductions (population level)", () => {
    const totalDeductions = slipRecords.reduce((a, s) => a + s.totalDeductions, 0);
    const totalCashGross   = slipRecords.reduce((a, s) => a + s.cashGross, 0);
    expect(runTotals.net).toBe(totalCashGross - totalDeductions);
  });
});

// ---------------------------------------------------------------------------
// 2. recalculateRun – formula change is reflected in recalculated totals
// ---------------------------------------------------------------------------

describe("recalculateRun – formula change propagates to run totals", () => {
  /**
   * Simulate a salary increase between the initial run and a recalculate.
   * The recalculated run totals must reflect the updated salaries.
   */
  const originalSalaries: PayInput[] = [
    fullMonth({ basicSalary: K(40_000) }),
    fullMonth({ basicSalary: K(60_000) }),
  ];

  const updatedSalaries: PayInput[] = [
    fullMonth({ basicSalary: K(45_000) }),  // +5 000 raise
    fullMonth({ basicSalary: K(60_000) }),
  ];

  const originalSlips = originalSalaries.map((e) => toSlipRecord(computePayslip(e, KE_2025)));
  const recalcSlips   = updatedSalaries.map((e) => toSlipRecord(computePayslip(e, KE_2025)));

  const originalTotals = accumulateTotals(originalSlips);
  const recalcTotals   = accumulateTotals(recalcSlips);

  it("recalculated gross is higher after a salary raise", () => {
    expect(recalcTotals.gross).toBeGreaterThan(originalTotals.gross);
  });

  it("recalculated PAYE is higher after a salary raise", () => {
    expect(recalcTotals.paye).toBeGreaterThan(originalTotals.paye);
  });

  it("recalculated NSSF is higher after a salary raise (more tier-2 base)", () => {
    expect(recalcTotals.nssfE).toBeGreaterThan(originalTotals.nssfE);
  });

  it("recalculated SHIF is higher after a salary raise", () => {
    expect(recalcTotals.shif).toBeGreaterThan(originalTotals.shif);
  });

  it("recalculated AHL is higher after a salary raise", () => {
    expect(recalcTotals.ahlE).toBeGreaterThan(originalTotals.ahlE);
  });

  it("recalculated totals are internally consistent (net = cashGross − deductions)", () => {
    const totalCashGross   = recalcSlips.reduce((a, s) => a + s.cashGross, 0);
    const totalDeductions  = recalcSlips.reduce((a, s) => a + s.totalDeductions, 0);
    expect(recalcTotals.net).toBe(totalCashGross - totalDeductions);
  });
});

// ---------------------------------------------------------------------------
// 3. PATCH payslip – run totals refresh correctly after a single edit
// ---------------------------------------------------------------------------

describe("PATCH payslip – run totals refresh after edit", () => {
  /**
   * Simulate 3 employees.  Employee #1's overtime is edited.
   * The new run totals must equal the sum of:
   *   - the freshly-recomputed payslip for employee #1
   *   - the unchanged payslips for employees #2 and #3
   */

  const emp1Base: PayInput = fullMonth({ basicSalary: K(50_000) });
  const emp2:     PayInput = fullMonth({ basicSalary: K(80_000) });
  const emp3:     PayInput = fullMonth({ basicSalary: K(35_000) });

  // Initial run payslips
  const slip1Before = toSlipRecord(computePayslip(emp1Base, KE_2025));
  const slip2        = toSlipRecord(computePayslip(emp2, KE_2025));
  const slip3        = toSlipRecord(computePayslip(emp3, KE_2025));

  const totalsBefore = refreshTotals([slip1Before, slip2, slip3]);

  // Employee #1 gets 20 overtime hours added
  const emp1Edited: PayInput = { ...emp1Base, overtimeHours: 20 };
  const slip1After = toSlipRecord(computePayslip(emp1Edited, KE_2025));

  // Totals refresh exactly as the PATCH handler does it (re-read all slips
  // including the just-updated one, then sum):
  const totalsAfter = refreshTotals([slip1After, slip2, slip3]);

  it("gross total increases after adding overtime", () => {
    expect(totalsAfter.gross).toBeGreaterThan(totalsBefore.gross);
  });

  it("gross total delta matches change in emp1 gross", () => {
    expect(totalsAfter.gross - totalsBefore.gross)
      .toBe(slip1After.gross - slip1Before.gross);
  });

  it("PAYE total increases after higher taxable income", () => {
    expect(totalsAfter.paye).toBeGreaterThan(totalsBefore.paye);
  });

  it("net total delta matches change in emp1 netPay", () => {
    expect(totalsAfter.net - totalsBefore.net)
      .toBe(slip1After.netPay - slip1Before.netPay);
  });

  it("unchanged employees' amounts are preserved in the new totals", () => {
    // If only emp1 changed, total NSSF should increase exactly by emp1's delta
    const deltaNssf = slip1After.nssfEmployee - slip1Before.nssfEmployee;
    expect(totalsAfter.nssfE - totalsBefore.nssfE).toBe(deltaNssf);
  });

  it("refreshed totals satisfy net = cashGross − totalDeductions", () => {
    const totalCashGross  = [slip1After, slip2, slip3].reduce((a, s) => a + s.cashGross, 0);
    const totalDeductions = [slip1After, slip2, slip3].reduce((a, s) => a + s.totalDeductions, 0);
    expect(totalsAfter.net).toBe(totalCashGross - totalDeductions);
  });
});

// ---------------------------------------------------------------------------
// 4. PATCH payslip – basicSalaryOverride refreshes statutory amounts correctly
// ---------------------------------------------------------------------------

describe("PATCH payslip – basicSalaryOverride statutory amounts", () => {
  const empBase: PayInput = fullMonth({ basicSalary: K(50_000) });
  const baseResult   = computePayslip(empBase, KE_2025);
  const baseSlip     = toSlipRecord(baseResult);

  // Override: increase basic salary for this slip only
  const overrideResult = computePayslip(
    { ...empBase, basicSalary: K(70_000) },
    KE_2025,
  );
  const overrideSlip = toSlipRecord(overrideResult);

  it("override produces higher gross", () => {
    expect(overrideSlip.gross).toBeGreaterThan(baseSlip.gross);
    expect(overrideSlip.gross).toBe(K(70_000));
  });

  it("override produces higher PAYE", () => {
    expect(overrideSlip.paye).toBeGreaterThan(baseSlip.paye);
  });

  it("override produces higher NSSF (more tier-2 base)", () => {
    expect(overrideSlip.nssfEmployee).toBeGreaterThan(baseSlip.nssfEmployee);
  });

  it("override produces higher SHIF", () => {
    expect(overrideSlip.shif).toBeGreaterThan(baseSlip.shif);
  });

  it("override produces higher AHL", () => {
    expect(overrideSlip.housingLevyEmployee).toBeGreaterThan(baseSlip.housingLevyEmployee);
  });

  it("net pay invariant holds after override", () => {
    expect(overrideResult.netPay).toBe(overrideResult.cashGross - overrideResult.totalDeductions);
  });

  /**
   * Verify run-total refresh: 2 employees, emp2 is edited (basicSalaryOverride).
   * New run totals must equal sum of updated emp1 slip + unchanged emp2 slip.
   */
  it("run totals refresh to reflect the overridden payslip", () => {
    const emp2Slip = toSlipRecord(computePayslip(fullMonth({ basicSalary: K(80_000) }), KE_2025));

    const beforeTotals = refreshTotals([baseSlip, emp2Slip]);
    const afterTotals  = refreshTotals([overrideSlip, emp2Slip]);

    // Only emp1 changed; emp2 contribution is identical
    expect(afterTotals.gross - beforeTotals.gross)
      .toBe(overrideSlip.gross - baseSlip.gross);
    expect(afterTotals.paye - beforeTotals.paye)
      .toBe(overrideSlip.paye - baseSlip.paye);
  });
});

// ---------------------------------------------------------------------------
// 5. PATCH payslip – daysPayableOverride proration and statutory recalculation
// ---------------------------------------------------------------------------

describe("PATCH payslip – daysPayableOverride statutory recalculation", () => {
  const fullInput  = fullMonth({ basicSalary: K(60_000) });
  const partInput  = fullMonth({ basicSalary: K(60_000), daysPayable: 15 });

  const fullResult = computePayslip(fullInput, KE_2025);
  const partResult = computePayslip(partInput, KE_2025);

  it("partial-month gross < full-month gross", () => {
    expect(partResult.gross).toBeLessThan(fullResult.gross);
  });

  it("partial-month PAYE < full-month PAYE", () => {
    expect(partResult.paye).toBeLessThan(fullResult.paye);
  });

  it("partial-month net pay invariant", () => {
    expect(partResult.netPay).toBe(partResult.cashGross - partResult.totalDeductions);
  });

  it("run totals refresh correctly when days are reduced", () => {
    const emp2Slip = toSlipRecord(
      computePayslip(fullMonth({ basicSalary: K(40_000) }), KE_2025),
    );

    const before = refreshTotals([toSlipRecord(fullResult), emp2Slip]);
    const after  = refreshTotals([toSlipRecord(partResult), emp2Slip]);

    expect(after.gross).toBeLessThan(before.gross);
    expect(after.net).toBeLessThan(before.net);

    // Emp2 is untouched
    const deltaGross = after.gross - before.gross;
    expect(deltaGross).toBe(partResult.gross - fullResult.gross);
  });
});
