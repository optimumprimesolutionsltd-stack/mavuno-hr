/**
 * Unauthenticated endpoints for the marketing site.
 *
 * Everything else under /api assumes a signed-in principal and a tenant. This
 * router assumes neither, so each handler has to be safe to expose to anyone:
 * no org-scoped data in, none out. It exists so the public PAYE calculator can
 * use the SAME payroll engine the product runs on, instead of the marketing
 * bundle carrying its own copy of the tax bands — a second copy would drift
 * from the real one, and the page's entire claim is that the numbers are right.
 */
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { computePayslip, emptyPayInput } from "../lib/payroll.js";
import { resolveCountryConfig } from "../lib/statutory-resolve.js";
import { toCents } from "../lib/money.js";

const router = Router();

// --- Rate limiting ---------------------------------------------------------
// Fixed window, in process. The service runs one instance (WEB_CONCURRENCY=1),
// so a shared store would be ceremony; if that changes this needs to move to
// the database or a cache, and the comment should stop being true.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  // req.ip is the Render proxy unless `trust proxy` is set app-wide, and
  // flipping that globally would change req.secure and cookie handling for
  // Clerk too. Read the forwarded chain here instead, where the blast radius
  // is this router. First hop is the client; the rest are proxies.
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0];
  return (first ?? req.ip ?? "unknown").trim();
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = clientKey(req);
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (entry.count >= MAX_PER_WINDOW) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    res.status(429).json({ error: "Too many requests", code: "RATE_LIMITED" });
    return;
  } else {
    entry.count += 1;
  }

  // Bound the map so a spray of spoofed X-Forwarded-For values cannot grow it
  // without limit. Expired entries only; nothing live is dropped.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  next();
}

// --- PAYE calculator -------------------------------------------------------

const moneyString = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);

const calcSchema = z.object({
  grossSalary: moneyString,
  // Optional extras so the page can grow without a new endpoint. All default to
  // zero, which is what emptyPayInput() already gives us.
  houseAllowance: moneyString.optional(),
  transportAllowance: moneyString.optional(),
  pensionEmployee: moneyString.optional(),
  insurancePremium: moneyString.optional(),
});

/**
 * POST /api/public/calculator
 *
 * Monthly gross -> full statutory breakdown for a resident, permanent employee
 * on a whole month, using the country default pack for the current period.
 */
router.post("/calculator", rateLimit, async (req, res, next) => {
  try {
    const parsed = calcSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }

    const period = new Date().toISOString().slice(0, 7);
    const { config } = await resolveCountryConfig(db as never, "KE", period);

    const d = parsed.data;
    const result = computePayslip(
      {
        ...emptyPayInput(),
        basicSalary: toCents(d.grossSalary),
        houseAllowance: d.houseAllowance ? toCents(d.houseAllowance) : 0,
        transportAllowance: d.transportAllowance ? toCents(d.transportAllowance) : 0,
        pensionEmployee: d.pensionEmployee ? toCents(d.pensionEmployee) : 0,
        insurancePremium: d.insurancePremium ? toCents(d.insurancePremium) : 0,
      },
      config,
    );

    // The calculator is a marketing page, not a payslip. Return only what it
    // renders, so the response is not a menu of internals for anyone probing it.
    res.json({
      period,
      config: config.name,
      currency: config.currencyCode,
      result: {
        gross: result.gross,
        taxableIncome: result.taxableIncome,
        payeBeforeRelief: result.payeBeforeRelief,
        personalRelief: result.personalRelief,
        insuranceRelief: result.insuranceRelief,
        paye: result.paye,
        nssfEmployee: result.nssfEmployee,
        nssfTier1: result.nssfTier1,
        nssfTier2: result.nssfTier2,
        shif: result.shif,
        housingLevyEmployee: result.housingLevyEmployee,
        pension: result.pension,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
        employerCost: result.employerCost,
        nssfEmployer: result.nssfEmployer,
        housingLevyEmployer: result.housingLevyEmployer,
        bands: result.bands,
        warnings: result.warnings,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
