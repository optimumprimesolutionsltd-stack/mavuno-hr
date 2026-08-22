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

export function getIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? null;
  return req.socket?.remoteAddress ?? null;
}
