import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { solveGrossForNet, emptyPayInput } from "../lib/payroll.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { toCents } from "../lib/money.js";

const router = Router();

const schema = z.object({
  targetNet: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

router.post("/net-to-gross", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));
    const period = parsed.data.period ?? new Date().toISOString().slice(0, 7);
    const { config } = await resolveConfig(db as any, p.orgId, org!.countryCode, period);

    const targetNet = toCents(parsed.data.targetNet);
    const template = emptyPayInput();
    delete (template as any).basicSalary;

    const { basicSalary, result, iterations } = solveGrossForNet(targetNet, template, config);

    res.json({ basicSalary, result, iterations, config: config.name });
  } catch (err) { next(err); }
});

export default router;
