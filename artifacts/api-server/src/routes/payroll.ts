import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees, payoutBatches, statutoryFilings } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { calculateRun, recalculateRun, applyLoanRepayments } from "../lib/payroll-run.js";
import { canApproveRun } from "../lib/rbac.js";
import { HttpError } from "../lib/http-error.js";
import { createHash } from "crypto";

const router = Router();

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const calculateRunSchema = z.object({
  period,
  runType: z.enum(["regular","off_cycle","bonus","final"]).default("regular"),
  employeeIds: z.array(z.number().int().positive()).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

const runActionSchema = z.object({
  action: z.enum(["submit","approve","reject","pay","reverse"]),
  note: z.string().max(500).optional(),
});

router.get("/", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runs = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.orgId, p.orgId))
      .orderBy(desc(payrollRuns.period), desc(payrollRuns.id));
    res.json(runs);
  } catch (err) { next(err); }
});

router.post("/", requireAuth("payroll:calculate"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = calculateRunSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const started = Date.now();
    const { run, warnings } = await db.transaction(async (tx) =>
      calculateRun(tx as any, p, parsed.data, getIp(req))
    );

    res.status(201).json({ run, warnings, durationMs: Date.now() - started });
  } catch (err) { next(err); }
});

router.get("/:id", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) { res.status(404).json({ error: "Payroll run not found" }); return; }

    const slips = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    res.json({ run, payslips: slips });
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth("payroll:submit"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = runActionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const { action, note } = parsed.data;

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) { res.status(404).json({ error: "Payroll run not found" }); return; }

    let update: Record<string, unknown> = {};
    const now = new Date();

    switch (action) {
      case "submit": {
        if (run.status !== "draft") throw new HttpError(409, "Run is not in draft status");
        update = { status: "pending_approval", submittedByUserId: p.userId, submittedAt: now };
        break;
      }
      case "approve": {
        if (run.status !== "pending_approval") throw new HttpError(409, "Run is not pending approval");
        const check = canApproveRun(p.role, p.userId, run);
        if (!check.ok) throw new HttpError(403, check.reason);
        update = { status: "approved", approvedByUserId: p.userId, approvedAt: now };
        break;
      }
      case "reject": {
        if (!["pending_approval"].includes(run.status)) throw new HttpError(409, "Run cannot be rejected in current status");
        update = { status: "draft" };
        break;
      }
      case "pay": {
        if (run.status !== "approved") throw new HttpError(409, "Run must be approved before paying");
        await db.transaction(async (tx) => {
          await applyLoanRepayments(tx as any, p.orgId, id);
        });
        update = { status: "paid", paidByUserId: p.userId, paidAt: now };
        break;
      }
      case "reverse": {
        if (!["paid", "approved"].includes(run.status)) throw new HttpError(409, "Run cannot be reversed in current status");
        update = { status: "reversed", reversedAt: now };
        break;
      }
      default: throw new HttpError(400, "Invalid action");
    }

    const [updated] = await db.update(payrollRuns).set(update).where(eq(payrollRuns.id, id)).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: `PAYROLL_${action.toUpperCase()}`, entity: "payroll_runs", entityId: id,
        detail: note ?? null, actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: run.status }, after: { status: updated.status },
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

router.post("/:id/recalculate", requireAuth("payroll:calculate"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const started = Date.now();
    const { run, warnings } = await db.transaction(async (tx) =>
      recalculateRun(tx as any, p, id, getIp(req))
    );
    res.json({ run, warnings, durationMs: Date.now() - started });
  } catch (err) { next(err); }
});

router.delete("/:id", requireAuth("payroll:calculate"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) { res.status(404).json({ error: "Payroll run not found" }); return; }
    if (run.status !== "draft") throw new HttpError(409, "Only draft runs can be deleted");

    await db.delete(payrollRuns).where(eq(payrollRuns.id, id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Payout batches
router.get("/:id/payouts", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const batches = await db.select().from(payoutBatches)
      .where(and(eq(payoutBatches.runId, id), eq(payoutBatches.orgId, p.orgId)));
    res.json(batches);
  } catch (err) { next(err); }
});

router.post("/:id/payouts", requireAuth("payroll:disburse"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) { res.status(404).json({ error: "Payroll run not found" }); return; }
    if (!["approved","paid"].includes(run.status)) throw new HttpError(409, "Run must be approved to generate payouts");

    const slips = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const channel = req.body?.channel ?? "bank_eft";
    const format = req.body?.format ?? "csv";

    const lines = slips.map((r) => `${r.emp.empNo},${r.emp.firstName} ${r.emp.lastName},${r.emp.bankAccount ?? ""},${r.slip.netPay}`).join("\n");
    const checksum = createHash("sha256").update(lines).digest("hex");
    const totalAmount = slips.reduce((a, r) => a + r.slip.netPay, 0);

    const [batch] = await db.insert(payoutBatches).values({
      orgId: p.orgId, runId: id, channel, format,
      itemCount: slips.length, totalAmount, checksum,
      generatedByUserId: p.userId, status: "generated",
    }).returning();

    res.status(201).json(batch);
  } catch (err) { next(err); }
});

// Statutory filings
router.get("/:id/filings", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const filings = await db.select().from(statutoryFilings)
      .where(and(eq(statutoryFilings.runId, id), eq(statutoryFilings.orgId, p.orgId)));
    res.json(filings);
  } catch (err) { next(err); }
});

router.post("/:id/filings", requireAuth("payroll:submit"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) { res.status(404).json({ error: "Payroll run not found" }); return; }

    const kind = req.body?.kind ?? "P10";
    const [filing] = await db.insert(statutoryFilings).values({
      orgId: p.orgId, runId: id, kind, period: run.period,
      itemCount: run.employeeCount, totalAmount: run.payeTotal, status: "generated",
    }).returning();

    res.status(201).json(filing);
  } catch (err) { next(err); }
});

export default router;
