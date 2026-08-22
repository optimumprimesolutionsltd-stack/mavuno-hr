import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { solveGrossForNet, emptyPayInput, computePayslip } from "../lib/payroll.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { toCents } from "../lib/money.js";

const router = Router();

const moneyString = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

const netToGrossSchema = z.object({
  targetNet: moneyString,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

const grossToNetSchema = z.object({
  grossSalary: moneyString,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  houseAllowance: moneyString.optional(),
  transportAllowance: moneyString.optional(),
});

// POST /api/calculator/net-to-gross
router.post("/net-to-gross", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = netToGrossSchema.safeParse(req.body);
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

// POST /api/calculator/gross-to-net
router.post("/gross-to-net", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = grossToNetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));
    const period = parsed.data.period ?? new Date().toISOString().slice(0, 7);
    const { config } = await resolveConfig(db as any, p.orgId, org!.countryCode, period);

    const input = {
      ...emptyPayInput(),
      basicSalary: toCents(parsed.data.grossSalary),
      houseAllowance: parsed.data.houseAllowance ? toCents(parsed.data.houseAllowance) : 0,
      transportAllowance: parsed.data.transportAllowance ? toCents(parsed.data.transportAllowance) : 0,
    };

    const result = computePayslip(input, config);
    res.json({ result, config: config.name });
  } catch (err) { next(err); }
});

export default router;
