/**
 * requireActiveAccess() gates whole feature routers on an org's access
 * window. Found /filings missing from the mounted list in routes/index.ts —
 * a lapsed org could still confirm and submit statutory filings (P10, NSSF,
 * SHIF, AHL), the same kind of core paid-for work /payroll is already
 * blocked from doing. This covers the middleware itself; the fix is the
 * one-line addition in routes/index.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { getPrincipal } = vi.hoisted(() => ({
  getPrincipal: vi.fn(),
}));

vi.mock("../../lib/session.js", () => ({ getPrincipal }));

const { requireActiveAccess } = await import("../require-auth.js");

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res as Response;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res as Response;
  });
  return res as Response & { statusCode?: number; body?: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireActiveAccess", () => {
  it("blocks with 402 ACCESS_EXPIRED once accessUntil has passed", async () => {
    getPrincipal.mockResolvedValue({ accessUntil: new Date(Date.now() - 1000) });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveAccess()({} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect((res as unknown as { body: { code: string } }).body.code).toBe("ACCESS_EXPIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a current org through", async () => {
    getPrincipal.mockResolvedValue({ accessUntil: new Date(Date.now() + 1000) });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveAccess()({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("treats a null accessUntil as unlimited access", async () => {
    getPrincipal.mockResolvedValue({ accessUntil: null });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveAccess()({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("leaves an unauthenticated request to the route's own requireAuth() for the 401", async () => {
    getPrincipal.mockResolvedValue(null);
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveAccess()({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
