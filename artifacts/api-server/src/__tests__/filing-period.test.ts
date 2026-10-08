/**
 * The filing reminder on the 7th used to look for a payroll dated the
 * current month, so on 7 October it chased October's payroll while the
 * returns due on 9 October are September's.
 */

import { describe, it, expect } from "vitest";
import { filingPeriodFor, filingPeriodLabel } from "../lib/filing-period.js";

describe("filingPeriodFor", () => {
  it("chases last month's payroll", () => {
    expect(filingPeriodFor(new Date(2026, 9, 7))).toBe("2026-09");
  });

  it("rolls January back to December of the year before", () => {
    expect(filingPeriodFor(new Date(2027, 0, 7))).toBe("2026-12");
  });

  it("pads single-digit months", () => {
    expect(filingPeriodFor(new Date(2026, 1, 8))).toBe("2026-01");
  });
});

describe("filingPeriodLabel", () => {
  it("names the month in words", () => {
    expect(filingPeriodLabel("2026-09")).toBe("September 2026");
  });
});
