/**
 * The non-payment rule: an expired org keeps using Mavuno but cannot run
 * payroll. requirePaidForPayroll() lets every read through and refuses
 * payroll writes with PAYROLL_LOCKED (not ACCESS_EXPIRED, which the app
 * answers by redirecting to Billing).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { getPrincipal } = vi.hoisted(() => ({ getPrincipal: vi.fn() }));
vi.mock("../../lib/session.js", () => ({ getPrincipal }));
const { requirePaidForPayroll } = await import("../require-auth.js");

function mockRes() {
  const res: Partial<Response> & { body?: any } = {};
  res.status = vi.fn().mockImplementation(() => res as Response);
  res.json = vi.fn().mockImplementation((b: unknown) => { res.body = b; return res as Response; });
  return res as Response & { body?: any };
}
const expired = { accessUntil: new Date(Date.now() - 1000) };
const current = { accessUntil: new Date(Date.now() + 86_400_000) };

beforeEach(() => vi.clearAllMocks());

describe("requirePaidForPayroll", () => {
  it("lets an expired org read payroll (past runs, payslips)", async () => {
    getPrincipal.mockResolvedValue(expired);
    const res = mockRes(); const next = vi.fn() as NextFunction;
    await requirePaidForPayroll()({ method: "GET" } as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH", "DELETE"])("refuses an expired org's %s with 402 PAYROLL_LOCKED", async (method) => {
    getPrincipal.mockResolvedValue(expired);
    const res = mockRes(); const next = vi.fn() as NextFunction;
    await requirePaidForPayroll()({ method } as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body.code).toBe("PAYROLL_LOCKED");
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a paid-up org run payroll", async () => {
    getPrincipal.mockResolvedValue(current);
    const res = mockRes(); const next = vi.fn() as NextFunction;
    await requirePaidForPayroll()({ method: "POST" } as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("treats no access date as unlimited", async () => {
    getPrincipal.mockResolvedValue({ accessUntil: null });
    const res = mockRes(); const next = vi.fn() as NextFunction;
    await requirePaidForPayroll()({ method: "POST" } as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
