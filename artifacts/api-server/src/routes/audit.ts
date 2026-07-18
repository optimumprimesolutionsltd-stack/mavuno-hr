import { Router } from "express";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogs } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { verifyAuditChain } from "../lib/audit.js";

const router = Router();

router.get("/", requireAuth("audit:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);

    const rows = await db.select().from(auditLogs)
      .where(eq(auditLogs.orgId, p.orgId))
      .orderBy(desc(auditLogs.seq))
      .limit(limit).offset(offset);

    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/verify", requireAuth("audit:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const result = await db.transaction(async (tx) =>
      verifyAuditChain(tx as any, p.orgId)
    );
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
