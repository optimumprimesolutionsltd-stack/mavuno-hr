import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees, loans, payoutBatches, statutoryFilings } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { calculateRun, recalculateRun, applyLoanRepayments } from "../lib/payroll-run.js";
import { computePayslip } from "../lib/payroll.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { canApproveRun, can } from "../lib/rbac.js";
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

router.patch("/:id", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = runActionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const { action, note } = parsed.data;

    // Action-specific permission check — each action maps to its own permission
    const actionPerm: Record<string, string> = {
      submit: "payroll:submit",
      reject: "payroll:submit",    // rejecting goes back to draft, same authority as submit
      approve: "payroll:approve",  // approver role can approve without payroll:submit
      pay: "payroll:disburse",
      reverse: "payroll:disburse",
    };
    const requiredPerm = actionPerm[action];
    if (!can(p.role, requiredPerm as any)) {
      return res.status(403).json({ error: `Your role (${p.role}) is not permitted to perform action '${action}'` });
    }

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

// ── PATCH /:runId/payslips/:slipId — edit one payslip then refresh run totals ──
const editSlipSchema = z.object({
  overtimeHours: z.number().min(0).max(744).optional(),
  holidayHours: z.number().min(0).max(744).optional(),
  adjustmentEarningsTaxable: z.number().min(0).optional(),  // cents
  adjustmentEarningsNonTaxable: z.number().min(0).optional(),
  adjustmentDeductions: z.number().min(0).optional(),
  basicSalaryOverride: z.number().min(0).nullable().optional(), // null = use employee's base
  daysPayableOverride: z.number().min(0).max(31).nullable().optional(),
  note: z.string().max(300).optional(),
});

router.patch("/:runId/payslips/:slipId", requireAuth("payroll:calculate"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runId = Number(req.params.runId);
    const slipId = Number(req.params.slipId);

    const parsed = editSlipSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return;
    }
    const overrides = parsed.data;

    const { updatedSlip, updatedRun } = await db.transaction(async (tx) => {
      // Verify run
      const [run] = await tx.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
      if (!run) throw new HttpError(404, "Payroll run not found");
      if (!["draft", "pending_approval"].includes(run.status)) {
        throw new HttpError(409, `Cannot edit a payroll run in status '${run.status}'`);
      }

      // Load payslip + employee
      const [slipRow] = await tx.select({ slip: payslips, emp: employees })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(and(eq(payslips.id, slipId), eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));
      if (!slipRow) throw new HttpError(404, "Payslip not found");

      const { slip, emp } = slipRow;
      // Use the snapshot stored at run-creation time so historical edits don't
      // break if the statutory config table changes. Fall back to live resolve
      // only when the snapshot is missing (shouldn't happen in practice).
      const config: import("../lib/statutory-types.js").StatutoryConfig =
        (run.statutorySnapshot as any) ??
        (await resolveConfig(tx as any, p.orgId, "KE", run.period)).config;

      // Load active loans for this employee
      const empLoans = await tx.select().from(loans)
        .where(and(eq(loans.orgId, p.orgId), eq(loans.employeeId, emp.id), eq(loans.status, "active")));
      const loanInstallment = empLoans.reduce((s, l) => s + Math.min(l.monthlyInstallment, l.balance), 0) as import("../lib/money.js").Cents;

      const existingBreakdown: any = slip.breakdown ?? {};
      const existingOverrides: any = existingBreakdown.overrides ?? {};

      // Merge: request body wins over existing overrides; null clears to employee base
      const merged = {
        overtimeHours: overrides.overtimeHours ?? existingOverrides.overtimeHours ?? 0,
        holidayHours: overrides.holidayHours ?? existingOverrides.holidayHours ?? 0,
        adjustmentEarningsTaxable: (overrides.adjustmentEarningsTaxable ?? existingOverrides.adjustmentEarningsTaxable ?? 0) as import("../lib/money.js").Cents,
        adjustmentEarningsNonTaxable: (overrides.adjustmentEarningsNonTaxable ?? existingOverrides.adjustmentEarningsNonTaxable ?? 0) as import("../lib/money.js").Cents,
        adjustmentDeductions: (overrides.adjustmentDeductions ?? existingOverrides.adjustmentDeductions ?? 0) as import("../lib/money.js").Cents,
        basicSalaryOverride: "basicSalaryOverride" in overrides ? overrides.basicSalaryOverride : existingOverrides.basicSalaryOverride,
        daysPayableOverride: "daysPayableOverride" in overrides ? overrides.daysPayableOverride : existingOverrides.daysPayableOverride,
        note: overrides.note ?? existingOverrides.note,
      };

      // Payable days
      let daysInPeriod = slip.daysInPeriod;
      let daysPayable = merged.daysPayableOverride != null
        ? merged.daysPayableOverride
        : (emp.employmentType === "casual" ? 0 : slip.daysPayable);

      const pin: import("../lib/payroll.js").PayInput = {
        basicSalary: (merged.basicSalaryOverride != null ? merged.basicSalaryOverride : emp.basicSalary) as import("../lib/money.js").Cents,
        houseAllowance: emp.houseAllowance,
        transportAllowance: emp.transportAllowance,
        otherAllowance: emp.otherAllowance,
        nonCashBenefit: emp.nonCashBenefit,
        insurancePremium: emp.insurancePremium,
        pensionEmployee: emp.pensionEmployee,
        pensionEmployer: emp.pensionEmployer,
        mortgageInterest: emp.mortgageInterest,
        helbMonthly: emp.helbMonthly,
        saccoMonthly: emp.saccoMonthly,
        loanInstallment,
        adjustmentEarningsTaxable: merged.adjustmentEarningsTaxable,
        adjustmentEarningsNonTaxable: merged.adjustmentEarningsNonTaxable,
        adjustmentDeductions: merged.adjustmentDeductions,
        overtimeHours: merged.overtimeHours,
        holidayHours: merged.holidayHours,
        daysInPeriod,
        daysPayable,
        employmentType: emp.employmentType as any,
        residentStatus: emp.residentStatus as any,
        disabilityExemption: emp.disabilityExemption,
      };

      const r = computePayslip(pin, config);

      const newBreakdown = {
        bands: r.bands, nssfTier1: r.nssfTier1, nssfTier2: r.nssfTier2,
        warnings: r.warnings, overrides: merged,
      };

      const [updatedSlip] = await tx.update(payslips).set({
        basic: r.basic, allowances: r.allowances, overtime: r.overtime,
        adjustmentEarnings: r.adjustmentEarnings, nonCashBenefit: r.nonCashBenefit,
        gross: r.gross, cashGross: r.cashGross,
        nssfEmployee: r.nssfEmployee, nssfEmployer: r.nssfEmployer, shif: r.shif,
        housingLevyEmployee: r.housingLevyEmployee, housingLevyEmployer: r.housingLevyEmployer,
        pension: r.pension, pensionEmployer: r.pensionEmployer, mortgageInterest: r.mortgageInterest,
        taxableIncome: r.taxableIncome, payeBeforeRelief: r.payeBeforeRelief,
        personalRelief: r.personalRelief, insuranceRelief: r.insuranceRelief, paye: r.paye,
        helb: r.helb, sacco: r.sacco, loanDeduction: r.loanDeduction,
        adjustmentDeductions: r.adjustmentDeductions, totalDeductions: r.totalDeductions,
        netPay: r.netPay, employerCost: r.employerCost,
        daysInPeriod, daysPayable,
        breakdown: newBreakdown,
      }).where(eq(payslips.id, slipId)).returning();

      // Refresh run totals from all payslips
      const allSlips = await tx.select().from(payslips)
        .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));

      const totals = allSlips.reduce((acc, s) => ({
        gross: acc.gross + s.gross,
        net: acc.net + s.netPay,
        paye: acc.paye + s.paye,
        nssfE: acc.nssfE + s.nssfEmployee,
        nssfR: acc.nssfR + s.nssfEmployer,
        shif: acc.shif + s.shif,
        ahlE: acc.ahlE + s.housingLevyEmployee,
        ahlR: acc.ahlR + s.housingLevyEmployer,
        employerCost: acc.employerCost + s.employerCost,
      }), { gross: 0, net: 0, paye: 0, nssfE: 0, nssfR: 0, shif: 0, ahlE: 0, ahlR: 0, employerCost: 0 });

      const [updatedRun] = await tx.update(payrollRuns).set({
        // Move back to draft if it was pending so the edit is reviewed before re-approval
        status: run.status === "pending_approval" ? "draft" : run.status,
        grossTotal: totals.gross, netTotal: totals.net, payeTotal: totals.paye,
        nssfEmployeeTotal: totals.nssfE, nssfEmployerTotal: totals.nssfR,
        shifTotal: totals.shif,
        housingLevyEmployeeTotal: totals.ahlE, housingLevyEmployerTotal: totals.ahlR,
        employerCostTotal: totals.employerCost,
      }).where(eq(payrollRuns.id, runId)).returning();

      await writeAudit(tx as any, {
        orgId: p.orgId, action: "PAYSLIP_EDITED", entity: "payslips", entityId: slipId,
        detail: merged.note ?? null,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { gross: r.gross, netPay: r.netPay, overrides: merged },
      });

      return { updatedSlip, updatedRun };
    });

    res.json({ slip: updatedSlip, run: updatedRun });
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
