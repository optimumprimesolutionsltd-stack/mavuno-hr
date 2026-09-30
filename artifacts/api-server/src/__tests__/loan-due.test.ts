import { describe, it, expect } from "vitest";
import { loanDueInPeriod } from "../lib/payroll-run.js";

const advance = (startDate: string, principal: number, installment: number) =>
  ({ type: "advance", startDate, principal, monthlyInstallment: installment });

describe("loanDueInPeriod", () => {
  it("never deducts before the month it was issued", () => {
    expect(loanDueInPeriod(advance("2026-09-15", 5000, 5000), "2026-08")).toBe(false);
    expect(loanDueInPeriod({ ...advance("2026-09-15", 5000, 5000), type: "company" }, "2026-03")).toBe(false);
  });

  it("recovers a one-month advance only in its own month", () => {
    expect(loanDueInPeriod(advance("2026-03-10", 5000, 5000), "2026-03")).toBe(true);
    expect(loanDueInPeriod(advance("2026-03-10", 5000, 5000), "2026-09")).toBe(false);
  });

  it("recovers a multi-month advance over its repayment months", () => {
    const a = advance("2026-07-01", 9000, 3000); // three months: Jul, Aug, Sep
    expect(["2026-07", "2026-08", "2026-09", "2026-10"].map((p) => loanDueInPeriod(a, p)))
      .toEqual([true, true, true, false]);
  });

  it("keeps deducting other loans every month until settled", () => {
    const loan = { type: "company", startDate: "2026-01-05", principal: 60000, monthlyInstallment: 5000 };
    expect(loanDueInPeriod(loan, "2027-06")).toBe(true);
  });

  it("handles a year boundary", () => {
    expect(loanDueInPeriod(advance("2026-12-20", 4000, 2000), "2027-01")).toBe(true);
    expect(loanDueInPeriod(advance("2026-12-20", 4000, 2000), "2027-02")).toBe(false);
  });
});
