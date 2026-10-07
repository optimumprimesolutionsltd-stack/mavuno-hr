import type { Request, Response, NextFunction } from "express";
import { getPrincipal, type Principal } from "../lib/session.js";
import { can, type Permission } from "../lib/rbac.js";
import { HttpError } from "../lib/http-error.js";

export interface AuthRequest extends Request {
  principal: Principal;
}

export function requireAuth(permission?: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const principal = await getPrincipal(req);
      if (!principal) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (permission && !can(principal.role, permission)) {
        res.status(403).json({ error: `Your role (${principal.role}) is not permitted to do this` });
        return;
      }
      (req as AuthRequest).principal = principal;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Gates feature routers on the org's access window (docs/design/super-admin-org-lifecycle.md
 * §2). Runs independently of requireAuth() — it is mounted at the router
 * level, before requireAuth has populated req.principal on any individual
 * route — so it does its own (cheap, indexed) session lookup. An
 * unauthenticated request just falls through to the route's own requireAuth()
 * for the 401; this middleware only ever turns an authenticated request into
 * a 402 when that org's access has lapsed.
 *
 * Deliberately NOT applied to auth, billing (read + pay), settings (read), or
 * notifications — a lapsed org must still be able to log in, see what it
 * owes, and pay it.
 */
export function requireActiveAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const principal = await getPrincipal(req);
      if (principal?.accessUntil && principal.accessUntil.getTime() < Date.now()) {
        res.status(402).json({
          error: "Your organisation's access has expired. Visit Billing to renew.",
          code: "ACCESS_EXPIRED",
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * The non-payment rule: an org whose access date has passed keeps using
 * Mavuno -- employees, leave, attendance, loans, reports, past payslips -- but
 * cannot run payroll until it pays. So reads (GET) always pass; anything that
 * creates, calculates, approves, pays, edits or imports payroll (or files the
 * returns derived from it) is refused with PAYROLL_LOCKED. Deliberately not
 * ACCESS_EXPIRED: the app redirects to Billing on that code, and a locked
 * payroll must not throw people out of the page they were reading.
 */
export function requirePaidForPayroll() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") { next(); return; }
      const principal = await getPrincipal(req);
      if (principal?.accessUntil && principal.accessUntil.getTime() < Date.now()) {
        res.status(402).json({
          error: "Your subscription has expired. You can keep using Mavuno, but payroll can't be run until you pay. Go to Billing to pay.",
          code: "PAYROLL_LOCKED",
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? null;
  return req.socket?.remoteAddress ?? null;
}
