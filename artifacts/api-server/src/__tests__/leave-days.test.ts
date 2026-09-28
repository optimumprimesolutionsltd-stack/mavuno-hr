import { describe, it, expect } from "vitest";
import { countLeaveDays } from "../lib/leave-days.js";

// 2026-10-05 is a Monday; 2026-10-10 the Saturday, 2026-10-11 the Sunday.
describe("countLeaveDays — Saturday follows the employee's own working week", () => {
  it("does not count Saturday for a Mon–Fri employee", () => {
    expect(countLeaveDays("2026-10-05", "2026-10-11", 5, false)).toBe(5);
    expect(countLeaveDays("2026-10-10", "2026-10-10", 5, false)).toBe(0);
  });

  it("counts Saturday for a Mon–Sat employee", () => {
    expect(countLeaveDays("2026-10-05", "2026-10-11", 6, false)).toBe(6);
    expect(countLeaveDays("2026-10-10", "2026-10-10", 6, false)).toBe(1);
  });

  it("never counts Sunday", () => {
    expect(countLeaveDays("2026-10-11", "2026-10-11", 6, true)).toBe(0);
  });

  it("skips public holidays unless the employee works them", () => {
    // Mashujaa Day, Tuesday 2026-10-20.
    expect(countLeaveDays("2026-10-19", "2026-10-24", 6, false)).toBe(5);
    expect(countLeaveDays("2026-10-19", "2026-10-24", 6, true)).toBe(6);
  });
});
