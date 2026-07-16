import { describe, it, expect } from "vitest";
import { toCents, fromCents, mulBps, mulRatio, bankersDivide, sum } from "@/lib/money";

describe("money: parsing", () => {
  it("parses decimals exactly", () => {
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("0.01")).toBe(1);
    expect(toCents("100")).toBe(10000);
    expect(toCents("1,234.50")).toBe(123450);
  });
  it("round-trips", () => {
    for (const v of ["0.00","0.01","999.99","1234567.89"]) {
      expect(fromCents(toCents(v))).toBe(v.replace(/,/g, ""));
    }
  });
  it("rejects garbage rather than silently coercing", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("")).toThrow();
  });
});

describe("money: the float bug this module exists to prevent", () => {
  it("0.1 + 0.2 === 0.3 in cents", () => {
    expect(toCents("0.1") + toCents("0.2")).toBe(toCents("0.3"));
  });
  it("summing 10,000 payslips does not drift", () => {
    const one = toCents("1234.56");
    const total = sum(...Array(10_000).fill(one));
    expect(total).toBe(1234_56 * 10_000);
    // The float equivalent drifts:
    const float = Array(10_000).fill(1234.56).reduce((a, b) => a + b, 0);
    expect(float).not.toBe(12345600);
  });
});

describe("money: basis-point multiplication", () => {
  it("computes statutory rates exactly", () => {
    expect(mulBps(toCents("100000"), 600)).toBe(toCents("6000"));    // 6% NSSF
    expect(mulBps(toCents("50000"), 275)).toBe(toCents("1375"));     // 2.75% SHIF
    expect(mulBps(toCents("50000"), 150)).toBe(toCents("750"));      // 1.5% AHL
  });
  it("uses banker's rounding so error does not drift one way", () => {
    expect(bankersDivide(5n, 2n)).toBe(2);   // 2.5 -> 2 (even)
    expect(bankersDivide(7n, 2n)).toBe(4);   // 3.5 -> 4 (even)
    expect(bankersDivide(-5n, 2n)).toBe(-2);
  });
});

describe("money: proration", () => {
  it("prorates by served days", () => {
    expect(mulRatio(toCents("31000"), 15, 31)).toBe(toCents("15000"));
  });
});
