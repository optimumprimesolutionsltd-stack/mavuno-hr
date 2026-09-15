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
import { demoRequests, newsletterSubscribers } from "@workspace/db/schema";
import { computePayslip, emptyPayInput, solveGrossForNet } from "../lib/payroll.js";
import { resolveCountryConfig } from "../lib/statutory-resolve.js";
import { toCents } from "../lib/money.js";
import { sendDemoRequestNotification, sendDemoRequestAcknowledgement } from "../lib/mailer.js";
import { pushLeadToOptimumCrm, notifyOptimumCrmOfDemoLead } from "../lib/optimum-crm.js";
import { logger } from "../lib/logger.js";

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

/**
 * POST /api/public/calculator/net-to-gross
 *
 * The inverse of the above: "what do I have to put on the contract so this
 * person takes home 80,000?" There is no closed form for it — PAYE is
 * progressive and NSSF, SHIF and the Housing Levy all reduce taxable income —
 * so solveGrossForNet binary-searches the gross that produces the target net.
 *
 * Same statutory pack and the same rate limit as the gross-to-net route. The
 * search is bounded (60 iterations, doubling to bracket) and runs on cached
 * config, so it is not meaningfully more expensive than a single payslip.
 */
router.post("/calculator/net-to-gross", rateLimit, async (req, res, next) => {
  try {
    const parsed = z.object({ targetNet: moneyString }).safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }

    const targetNet = toCents(parsed.data.targetNet);
    if (targetNet <= 0) {
      res.status(422).json({ error: "Enter a take-home amount greater than zero" });
      return;
    }

    const period = new Date().toISOString().slice(0, 7);
    const { config } = await resolveCountryConfig(db as never, "KE", period);

    const template = emptyPayInput() as Omit<ReturnType<typeof emptyPayInput>, "basicSalary"> & {
      basicSalary?: number;
    };
    delete template.basicSalary;

    let solved;
    try {
      solved = solveGrossForNet(targetNet, template, config);
    } catch {
      // solveGrossForNet throws when it cannot bracket the target, which in
      // practice means an amount far outside any real salary. A 422 says "that
      // input is not workable" rather than surfacing a 500 for bad input.
      res.status(422).json({ error: "That take-home figure is outside the range this can solve" });
      return;
    }

    const r = solved.result;
    res.json({
      period,
      config: config.name,
      currency: config.currencyCode,
      targetNet,
      // The solver lands on the smallest gross whose net is >= the target, so
      // the achieved net can be a cent or two over. Return it rather than
      // echoing the request, so the page can show what will actually be paid.
      achievedNet: r.netPay,
      result: {
        gross: r.gross,
        taxableIncome: r.taxableIncome,
        payeBeforeRelief: r.payeBeforeRelief,
        personalRelief: r.personalRelief,
        paye: r.paye,
        nssfEmployee: r.nssfEmployee,
        shif: r.shif,
        housingLevyEmployee: r.housingLevyEmployee,
        totalDeductions: r.totalDeductions,
        netPay: r.netPay,
        employerCost: r.employerCost,
        nssfEmployer: r.nssfEmployer,
        housingLevyEmployer: r.housingLevyEmployer,
        bands: r.bands,
        warnings: r.warnings,
      },
    });
  } catch (err) {
    next(err);
  }
});

// --- Demo request (marketing site "Request Demo" form) ---------------------
// Replaces the old mailto: handoff, which silently did nothing on a device
// with no mail client configured. The row in demo_requests is the record of
// the request; the notification email below is best-effort on top of it, not
// a requirement for the submission to succeed.

const DEMO_NOTIFY_TO = process.env.DEMO_REQUEST_NOTIFY_EMAIL?.trim() || "info@mavunohr.co.ke";

const demoRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^[0-9+()\s-]{9,20}$/, "Enter a valid phone number"),
  email: z.string().email().max(255),
  company: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  // The slot they'd prefer, in the shapes the CRM stores: YYYY-MM-DD and
  // 24-hour HH:MM. Optional -- the form does not insist, and a request
  // without one is still a request.
  demoDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional(),
  demoTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time").optional(),
  sourcePath: z.string().trim().max(200).optional(),
});

router.post("/demo-requests", rateLimit, async (req, res, next) => {
  try {
    const parsed = demoRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Enter your name, phone number, and a valid work email address." });
      return;
    }
    const { name, phone, email, company, message, demoDate, demoTime, sourcePath } = parsed.data;
    // A time on its own says nothing — "2pm" which day? — so it is only kept
    // when a date came with it.
    const slotDate = demoDate || null;
    const slotTime = slotDate ? demoTime || null : null;

    await db.insert(demoRequests).values({
      name,
      phone,
      email: email.toLowerCase(),
      company: company || null,
      message: message || null,
      demoDate: slotDate,
      demoTime: slotTime,
      sourcePath: sourcePath || null,
    });

    const crmLead = {
      name,
      email,
      phone,
      company: company || null,
      message: message || null,
      demoDate: slotDate,
      demoTime: slotTime,
    };

    // Both best-effort, in parallel — a lost notification or CRM sync is a
    // nuisance, a lost lead is not. The row above already exists regardless
    // of what happens to either of these.
    const [emailResult, crmResult, waResult, ackResult] = await Promise.allSettled([
      sendDemoRequestNotification({ to: DEMO_NOTIFY_TO, name, phone, email, company: company || null, message: message || null, demoDate: slotDate, demoTime: slotTime, sourcePath: sourcePath || null }),
      pushLeadToOptimumCrm(crmLead),
      notifyOptimumCrmOfDemoLead(crmLead),
      // The requester's own copy. Best-effort like the rest: the row above
      // is the record, and nobody filling in a form has a stake in whether
      // our mail provider is having a good day.
      sendDemoRequestAcknowledgement({
        to: email,
        name,
        company: company || null,
        demoDate: slotDate,
        demoTime: slotTime,
      }),
    ]);
    if (emailResult.status === "rejected") logger.warn({ err: emailResult.reason, email }, "public: demo request saved but the internal notification email failed");
    if (crmResult.status === "rejected") logger.warn({ err: crmResult.reason, email }, "public: demo request saved but writing it into the Optimum CRM failed");
    if (waResult.status === "rejected") logger.warn({ err: waResult.reason, email }, "public: demo request saved but the CRM WhatsApp/email lead notification failed");
    // Logged like the others rather than left off the end of the destructure:
    // an acknowledgement that quietly fails is a person who thinks nobody
    // received their request.
    if (ackResult.status === "rejected") logger.warn({ err: ackResult.reason, email }, "public: demo request saved but the requester's acknowledgement email failed");

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Newsletter signup (marketing site footer) -----------------------------
// Answers 200 to anything that parses. A visitor filling in a form has no
// stake in our storage layer, and a failure here must never look like a reason
// to give up on the product — so the row is best-effort and the reply is
// reassuring either way. Failures are logged, not surfaced.

const email = z.string().email().max(254);

/** POST /api/public/newsletter */
router.post("/newsletter", rateLimit, async (req, res) => {
  const parsed = z
    .object({
      email,
      name: z.string().max(120).optional(),
      pagePath: z.string().max(200).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: "That does not look like an email address." });
    return;
  }

  try {
    // Re-subscribing is not an error and must not 500 on the unique index. It
    // also un-unsubscribes: someone typing their address into the box again is
    // asking to receive the thing.
    await db
      .insert(newsletterSubscribers)
      .values({
        email: parsed.data.email.trim().toLowerCase(),
        name: parsed.data.name?.trim() || null,
        pagePath: parsed.data.pagePath?.trim() || null,
      })
      .onConflictDoUpdate({
        target: newsletterSubscribers.email,
        set: { status: "active", name: parsed.data.name?.trim() || null },
      });
  } catch (err) {
    logger.error({ err }, "newsletter: could not store");
  }

  res.json({ received: true });
});

export default router;
