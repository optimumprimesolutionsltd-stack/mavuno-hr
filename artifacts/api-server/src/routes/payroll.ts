import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees, loans, payoutBatches, statutoryFilings, organizations, departments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { calculateRun, recalculateRun, applyLoanRepayments } from "../lib/payroll-run.js";
import { computePayslip } from "../lib/payroll.js";
import { resolveConfig } from "../lib/statutory-resolve.js";
import { canApproveRun, can } from "../lib/rbac.js";
import { HttpError } from "../lib/http-error.js";
import { getSafeMailError, sendPayslipEmail, sendStatutoryRemittanceEmail } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import { createHash } from "crypto";
import { fullName } from "../lib/employee-name.js";
import { generateP9Pdf } from "../lib/pdf-p9.js";
import { generateP10Pdf, type P10CardData } from "../lib/pdf-p10.js";

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

    const slips = await db.select({ slip: payslips, emp: employees, dept: departments })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .leftJoin(departments, and(
        eq(employees.departmentId, departments.id),
        eq(employees.orgId, departments.orgId),
      ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const filings = await db.select().from(statutoryFilings)
      .where(and(eq(statutoryFilings.runId, id), eq(statutoryFilings.orgId, p.orgId)));

    res.json({ run, payslips: slips, filings });
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
      res.status(403).json({ error: `Your role (${p.role}) is not permitted to perform action '${action}'` });
      return;
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

    const [updated] = await db.update(payrollRuns).set(update)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)))
      .returning();

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

// ── GET /:id/readiness — pre-flight check before submitting for approval ──────
router.get("/:id/readiness", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");

    // Join payslips → employees to find those missing statutory numbers
    const rows = await db
      .select({ emp: employees })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const missing = rows
      .filter(({ emp }) => !emp.nssfNo || !emp.shifNo)
      .map(({ emp }) => ({
        id: emp.id,
        name: fullName(emp),
        employeeNo: emp.empNo,
        missingFields: [
          ...(!emp.nssfNo ? ["NSSF No"] : []),
          ...(!emp.shifNo ? ["SHIF No"] : []),
        ],
      }));

    res.json({ ok: missing.length === 0, missing });
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

// ── POST /:id/apply-insurance-deductions — repair paid historical runs ───────
// Insurance premiums are employee deductions, but older runs were calculated
// before that line was included. This correction only changes total deductions
// and net pay, preserving the already-filed statutory amounts.
router.post("/:id/apply-insurance-deductions", requireAuth("payroll:calculate"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runId = Number(req.params.id);

    const result = await db.transaction(async (tx) => {
      const [run] = await tx.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
      if (!run) throw new HttpError(404, "Payroll run not found");
      if (!["approved", "paid"].includes(run.status)) {
        throw new HttpError(409, `Insurance correction is only available for approved or paid runs (current status: '${run.status}')`);
      }

      const rows = await tx.select({ slip: payslips, emp: employees })
        .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
        .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));

      let appliedCount = 0;
      let appliedAmount = 0;
      let alreadyAppliedCount = 0;

      for (const { slip, emp } of rows) {
        const premium = emp.insurancePremium;
        const breakdown = (slip.breakdown ?? {}) as Record<string, any>;
        if (breakdown.insurancePremiumCorrectionApplied === true || breakdown.insurancePremiumDeducted === true) {
          alreadyAppliedCount++;
          continue;
        }
        if (premium <= 0) continue;

        const updatedBreakdown = {
          ...breakdown,
          insurancePremium: premium,
          insurancePremiumDeducted: true,
          insurancePremiumCorrectionApplied: true,
          insurancePremiumCorrectionNote: "Applied to historical run",
        };
        await tx.update(payslips).set({
          totalDeductions: slip.totalDeductions + premium,
          netPay: slip.netPay - premium,
          breakdown: updatedBreakdown,
        }).where(and(eq(payslips.id, slip.id), eq(payslips.orgId, p.orgId)));

        appliedCount++;
        appliedAmount += premium;
      }

      if (appliedCount > 0) {
        await tx.update(payrollRuns).set({
          netTotal: run.netTotal - appliedAmount,
        }).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
      }

      await writeAudit(tx as any, {
        orgId: p.orgId,
        action: "PAYROLL_INSURANCE_DEDUCTIONS_APPLIED",
        entity: "payroll_runs",
        entityId: runId,
        detail: `Applied ${appliedCount} insurance premium deduction${appliedCount === 1 ? "" : "s"} totalling ${appliedAmount / 100} to ${run.name}`,
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        after: { runId, appliedCount, appliedAmount, alreadyAppliedCount },
      });

      return { appliedCount, appliedAmount, alreadyAppliedCount };
    });

    res.json({
      ...result,
      message: result.appliedCount > 0
        ? `Applied ${result.appliedAmount / 100} in insurance premium deductions.`
        : "No unapplied insurance premiums were found for this run.",
    });
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
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
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

      const { basicSalary: _storedSalary, ...netTemplate } = pin;
      const r = emp.salaryBasis === "net"
        ? (await import("../lib/payroll.js")).solveGrossForNet(pin.basicSalary, netTemplate, config).result
        : computePayslip(pin, config);

      const newBreakdown = {
        bands: r.bands, nssfTier1: r.nssfTier1, nssfTier2: r.nssfTier2,
        tier2Provider: config.socialSecurity.tier2Provider ?? "nssf",
        tier2ProviderName: config.socialSecurity.tier2ProviderName ?? "NSSF",
        warnings: r.warnings, overrides: merged,
        insurancePremium: r.insurancePremium,
        insurancePremiumDeducted: true,
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
      }).where(and(eq(payslips.id, slipId), eq(payslips.orgId, p.orgId))).returning();

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
      }).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId))).returning();

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

    await db.delete(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
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
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const channel = req.body?.channel ?? "bank_eft";
    const format = req.body?.format ?? "csv";

    const lines = slips.map((r) => `${r.emp.empNo},${fullName(r.emp)},${r.emp.bankAccount ?? ""},${r.slip.netPay}`).join("\n");
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

// ── PDF payslip download ────────────────────────────────────────────────────
router.get("/:id/payslips/:slipId/pdf", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const slipId = Number(req.params.slipId);

    const [{ slip, emp, org, run }] = await db
      .select({ slip: payslips, emp: employees, org: organizations, run: payrollRuns })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .innerJoin(organizations, eq(payslips.orgId, organizations.id))
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.id, slipId), eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const bd = (slip.breakdown ?? {}) as { nssfTier1?: number; nssfTier2?: number; tier2Provider?: string; tier2ProviderName?: string; nssfTier1Employer?: number; nssfTier2Employer?: number; insurancePremium?: number };
    const { generatePayslipPdf } = await import("../lib/pdf-payslip.js");

    const pdfBuffer = await generatePayslipPdf({
      orgName: org.name,
      orgKraPin: org.kraPin ?? undefined,
      orgNssfNo: org.nssfEmployerNo ?? undefined,
      period: run.period,
      runName: run.name,
      empNo: emp.empNo,
      empName: fullName(emp),
      position: emp.position ?? "",
      employmentType: emp.employmentType ?? "permanent",
      nationalId: emp.nationalId ?? undefined,
      kraPin: emp.kraPin ?? undefined,
      nssfNo: emp.nssfNo ?? undefined,
      shifNo: emp.shifNo ?? undefined,
      bankName: emp.bankName ?? undefined,
      bankAccount: emp.bankAccount ?? undefined,
      mpesaPhone: emp.mpesaPhone ?? undefined,
      daysPayable: slip.daysPayable ?? 0,
      daysInPeriod: slip.daysInPeriod ?? 30,
      basic: slip.basic,
      allowances: slip.allowances,
      overtime: slip.overtime,
      adjustmentEarnings: slip.adjustmentEarnings,
      nonCashBenefit: slip.nonCashBenefit,
      gross: slip.gross,
      cashGross: slip.cashGross,
      paye: slip.paye,
      nssfEmployee: slip.nssfEmployee,
      nssfTier1: bd.nssfTier1 ?? 0,
      nssfTier2: bd.nssfTier2 ?? 0,
      tier2Label: bd.tier2Provider === "private" ? `${bd.tier2ProviderName ?? "Private Pension Fund"} — Tier II` : "NSSF — Tier II",
      shif: slip.shif,
      housingLevyEmployee: slip.housingLevyEmployee,
      pension: slip.pension,
      helb: slip.helb,
      sacco: slip.sacco,
      loanDeduction: slip.loanDeduction,
      insurancePremium: bd.insurancePremium ?? 0,
      adjustmentDeductions: slip.adjustmentDeductions,
      totalDeductions: slip.totalDeductions,
      netPay: slip.netPay,
      nssfEmployer: slip.nssfEmployer,
      housingLevyEmployer: slip.housingLevyEmployer,
      pensionEmployer: slip.pensionEmployer,
    });

    const filename = `${emp.empNo}_${emp.firstName}_${emp.lastName}_${run.period}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── GET /:id/compare — month-on-month variance report ───────────────────────
router.get("/:id/compare", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Run not found");

    // All runs for org ordered by period desc
    const allRuns = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.orgId, p.orgId))
      .orderBy(desc(payrollRuns.period), desc(payrollRuns.id));

    // Find the immediately previous run (period < current period)
    const previousRun = allRuns.find((r) => r.period < run.period && r.id !== run.id) ?? null;

    if (!previousRun) {
      res.json({ current: run, previous: null, rows: [], totals: { currentGross: 0, previousGross: 0, currentNet: 0, previousNet: 0, currentPaye: 0, previousPaye: 0 } });
      return;
    }

    // Fetch payslips for both runs
    const [currentSlips, previousSlips] = await Promise.all([
      db.select({ slip: payslips, emp: employees })
        .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
        .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId))),
      db.select({ slip: payslips, emp: employees })
        .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
        .where(and(eq(payslips.runId, previousRun.id), eq(payslips.orgId, p.orgId))),
    ]);

    const prevMap = new Map(previousSlips.map((r) => [r.emp.id, r]));
    const currMap = new Map(currentSlips.map((r) => [r.emp.id, r]));

    const rows: any[] = [];

    // Current employees
    for (const { slip, emp } of currentSlips) {
      const prev = prevMap.get(emp.id);
      rows.push({
        empNo: emp.empNo,
        empName: fullName(emp),
        currentGross: slip.gross,
        previousGross: prev?.slip.gross ?? 0,
        currentPaye: slip.paye,
        previousPaye: prev?.slip.paye ?? 0,
        currentNssf: slip.nssfEmployee,
        previousNssf: prev?.slip.nssfEmployee ?? 0,
        currentShif: slip.shif,
        previousShif: prev?.slip.shif ?? 0,
        currentNet: slip.netPay,
        previousNet: prev?.slip.netPay ?? 0,
        isNew: !prev,
        isRemoved: false,
      });
    }

    // Employees in previous but not in current
    for (const { slip, emp } of previousSlips) {
      if (!currMap.has(emp.id)) {
        rows.push({
          empNo: emp.empNo,
          empName: fullName(emp),
          currentGross: 0,
          previousGross: slip.gross,
          currentPaye: 0,
          previousPaye: slip.paye,
          currentNssf: 0,
          previousNssf: slip.nssfEmployee,
          currentShif: 0,
          previousShif: slip.shif,
          currentNet: 0,
          previousNet: slip.netPay,
          isNew: false,
          isRemoved: true,
        });
      }
    }

    const totals = {
      currentGross: rows.reduce((s, r) => s + r.currentGross, 0),
      previousGross: rows.reduce((s, r) => s + r.previousGross, 0),
      currentNet: rows.reduce((s, r) => s + r.currentNet, 0),
      previousNet: rows.reduce((s, r) => s + r.previousNet, 0),
      currentPaye: rows.reduce((s, r) => s + r.currentPaye, 0),
      previousPaye: rows.reduce((s, r) => s + r.previousPaye, 0),
    };

    res.json({ current: run, previous: previousRun, rows, totals });
  } catch (err) { next(err); }
});

// ── GET /:id/payslips/bulk-pdf — merged PDF of all payslips ─────────────────
router.get("/:id/payslips/bulk-pdf", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Run not found");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const rows = await db
      .select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const { generatePayslipPdf } = await import("../lib/pdf-payslip.js");
    const { PDFDocument } = await import("pdf-lib");

    const merged = await PDFDocument.create();

    for (const { slip, emp } of rows) {
      const bd = (slip.breakdown ?? {}) as { nssfTier1?: number; nssfTier2?: number; tier2Provider?: string; tier2ProviderName?: string; insurancePremium?: number };
      const pdfBuffer = await generatePayslipPdf({
        orgName: org.name, orgKraPin: org.kraPin ?? undefined, orgNssfNo: org.nssfEmployerNo ?? undefined,
        period: run.period, runName: run.name,
        empNo: emp.empNo, empName: fullName(emp),
        position: emp.position ?? "", employmentType: emp.employmentType ?? "permanent",
        nationalId: emp.nationalId ?? undefined, kraPin: emp.kraPin ?? undefined,
        nssfNo: emp.nssfNo ?? undefined, shifNo: emp.shifNo ?? undefined,
        bankName: emp.bankName ?? undefined, bankAccount: emp.bankAccount ?? undefined,
        mpesaPhone: emp.mpesaPhone ?? undefined,
        daysPayable: slip.daysPayable ?? 0, daysInPeriod: slip.daysInPeriod ?? 30,
        basic: slip.basic, allowances: slip.allowances, overtime: slip.overtime,
        adjustmentEarnings: slip.adjustmentEarnings, nonCashBenefit: slip.nonCashBenefit,
        gross: slip.gross, cashGross: slip.cashGross,
        paye: slip.paye, nssfEmployee: slip.nssfEmployee,
        nssfTier1: bd.nssfTier1 ?? 0, nssfTier2: bd.nssfTier2 ?? 0,
         tier2Label: bd.tier2Provider === "private" ? `${bd.tier2ProviderName ?? "Private Pension Fund"} — Tier II` : "NSSF — Tier II",
        shif: slip.shif, housingLevyEmployee: slip.housingLevyEmployee,
        pension: slip.pension, helb: slip.helb, sacco: slip.sacco,
        loanDeduction: slip.loanDeduction, adjustmentDeductions: slip.adjustmentDeductions,
         insurancePremium: bd.insurancePremium ?? 0,
        totalDeductions: slip.totalDeductions, netPay: slip.netPay,
        nssfEmployer: slip.nssfEmployer, housingLevyEmployer: slip.housingLevyEmployer,
        pensionEmployer: slip.pensionEmployer,
      });

      const srcDoc = await PDFDocument.load(pdfBuffer);
      const copiedPages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const page of copiedPages) merged.addPage(page);
    }

    const mergedBytes = await merged.save();
    const filename = `Payslips_${run.period}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", mergedBytes.length);
    res.send(Buffer.from(mergedBytes));
  } catch (err) { next(err); }
});

// ── GET /:id/muster-roll.csv — payroll register for one run ─────────────────
router.get("/:id/muster-roll.csv", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runId = Number(req.params.id);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");
    if (run.status === "reversed") {
      throw new HttpError(422, "A muster roll is not available for a reversed payroll run");
    }

    const rows = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)))
      .orderBy(employees.empNo);
    if (rows.length === 0) throw new HttpError(404, "No payslips found for this payroll run");

    const headers = [
      "Employee No", "Employee", "Position", "Days Payable",
      "Basic Pay", "Allowances", "Gross Pay",
      "PAYE", "NSSF", "SHIF", "Housing Levy",
      "Pension", "HELB", "SACCO", "Loan", "Insurance Premium", "Other Deductions",
      "Total Deductions", "Net Pay",
    ];
    const toKes = (cents: number) => (cents / 100).toFixed(2);
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, "\"\"")}"`;
    const extractInsurancePremium = (slip: typeof payslips.$inferSelect) =>
      ((slip.breakdown ?? {}) as { insurancePremium?: number }).insurancePremium ?? 0;
    const totals = rows.reduce((sum, { slip }) => {
      const insurancePremium = extractInsurancePremium(slip);
      return {
        days: sum.days + slip.daysPayable,
        basic: sum.basic + slip.basic,
        allowances: sum.allowances + slip.allowances,
        gross: sum.gross + slip.gross,
        paye: sum.paye + slip.paye,
        nssf: sum.nssf + slip.nssfEmployee,
        shif: sum.shif + slip.shif,
        housingLevy: sum.housingLevy + slip.housingLevyEmployee,
        pension: sum.pension + slip.pension,
        helb: sum.helb + slip.helb,
        sacco: sum.sacco + slip.sacco,
        loan: sum.loan + slip.loanDeduction,
        insurancePremium: sum.insurancePremium + insurancePremium,
        otherDeductions: sum.otherDeductions + slip.adjustmentDeductions,
        totalDeductions: sum.totalDeductions + slip.totalDeductions,
        netPay: sum.netPay + slip.netPay,
      };
    }, {
      days: 0, basic: 0, allowances: 0, gross: 0, paye: 0, nssf: 0, shif: 0,
      housingLevy: 0, pension: 0, helb: 0, sacco: 0, loan: 0, insurancePremium: 0,
      otherDeductions: 0, totalDeductions: 0, netPay: 0,
    });

    const dataRows = rows.map(({ slip, emp }) => {
      const insurancePremium = extractInsurancePremium(slip);
      return [
        emp.empNo, fullName(emp), emp.position ?? "", slip.daysPayable,
        toKes(slip.basic), toKes(slip.allowances), toKes(slip.gross),
        toKes(slip.paye), toKes(slip.nssfEmployee), toKes(slip.shif), toKes(slip.housingLevyEmployee),
        toKes(slip.pension), toKes(slip.helb), toKes(slip.sacco), toKes(slip.loanDeduction),
        toKes(insurancePremium), toKes(slip.adjustmentDeductions),
        toKes(slip.totalDeductions), toKes(slip.netPay),
      ];
    });
    dataRows.push([
      "", `TOTAL — ${rows.length} employee${rows.length === 1 ? "" : "s"}`, "", totals.days,
      toKes(totals.basic), toKes(totals.allowances), toKes(totals.gross),
      toKes(totals.paye), toKes(totals.nssf), toKes(totals.shif), toKes(totals.housingLevy),
      toKes(totals.pension), toKes(totals.helb), toKes(totals.sacco), toKes(totals.loan),
      toKes(totals.insurancePremium), toKes(totals.otherDeductions),
      toKes(totals.totalDeductions), toKes(totals.netPay),
    ]);
    const csv = [headers, ...dataRows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Muster_Roll_${run.period}.csv"`);
    res.send(`\ufeff${csv}`);
  } catch (err) { next(err); }
});

// ── GET /:id/employees/:employeeId/p9-pdf — annual P9 for one employee ─────
router.get("/:id/employees/:employeeId/p9-pdf", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runId = Number(req.params.id);
    const employeeId = Number(req.params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new HttpError(422, "A valid employeeId is required");
    }

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");
    if (run.status !== "paid") {
      throw new HttpError(422, "P9 certificates are available after payroll has been paid");
    }

    const year = run.period.slice(0, 4);

    // Confirm the requested employee belongs to this payroll run and organisation.
    const [selected] = await db.select({ emp: employees })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .where(and(
        eq(payslips.runId, runId),
        eq(payslips.employeeId, employeeId),
        eq(payslips.orgId, p.orgId),
      ))
      .limit(1);
    if (!selected) throw new HttpError(404, "Employee is not part of this payroll run");

    const paidRuns = await db.select({ id: payrollRuns.id, period: payrollRuns.period })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, p.orgId), eq(payrollRuns.status, "paid")));
    const yearRunIds = paidRuns
      .filter((candidate) => candidate.period.startsWith(year))
      .map((candidate) => candidate.id);
    if (yearRunIds.length === 0) throw new HttpError(404, `No paid payroll runs found for ${year}`);

    const annualSlips = await db.select({ slip: payslips })
      .from(payslips)
      .where(and(
        eq(payslips.orgId, p.orgId),
        eq(payslips.employeeId, employeeId),
        inArray(payslips.runId, yearRunIds),
      ));
    if (annualSlips.length === 0) throw new HttpError(404, `No paid payslips found for this employee in ${year}`);

    const totals = annualSlips.reduce((sum, { slip }) => ({
      gross: sum.gross + slip.gross,
      benefits: sum.benefits + slip.nonCashBenefit,
      mortgageInterest: sum.mortgageInterest + slip.mortgageInterest,
      definedContribution: sum.definedContribution + slip.nssfEmployee + slip.pension,
      chargeablePay: sum.chargeablePay + slip.taxableIncome,
      taxChargeable: sum.taxChargeable + slip.payeBeforeRelief,
      personalRelief: sum.personalRelief + slip.personalRelief,
      insuranceRelief: sum.insuranceRelief + slip.insuranceRelief,
      netPaye: sum.netPaye + slip.paye,
    }), {
      gross: 0,
      benefits: 0,
      mortgageInterest: 0,
      definedContribution: 0,
      chargeablePay: 0,
      taxChargeable: 0,
      personalRelief: 0,
      insuranceRelief: 0,
      netPaye: 0,
    });

    const [org] = await db.select().from(organizations)
      .where(eq(organizations.id, p.orgId));
    const employeeRow = {
      empNo: selected.emp.empNo,
      kraPin: selected.emp.kraPin ?? "",
      name: fullName(selected.emp),
      annualGross: totals.gross,
      benefits: totals.benefits,
      quarters: 0,
      annualTotalGross: totals.gross,
      annualMortgageInterest: totals.mortgageInterest,
      annualDefinedContribution: totals.definedContribution,
      annualChargeablePay: totals.chargeablePay,
      annualTaxChargeable: totals.taxChargeable,
      annualPersonalRelief: totals.personalRelief,
      annualInsuranceRelief: totals.insuranceRelief,
      annualNetPaye: totals.netPaye,
    };
    const pdfBuffer = await generateP9Pdf({
      orgName: org?.name ?? "",
      orgKraPin: org?.kraPin ?? undefined,
      year,
      rows: [employeeRow],
      totalPaye: employeeRow.annualNetPaye,
      totalGross: employeeRow.annualGross,
      totalChargeablePay: employeeRow.annualChargeablePay,
    });
    const safeEmployeeName = `${employeeRow.empNo}_${employeeRow.name}`
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100) || "employee";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="P9_${year}_${safeEmployeeName}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── GET /:id/p10-pdf — annual P10 tax deduction cards for all employees ──────
router.get("/:id/p10-pdf", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runId = Number(req.params.id);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");
    if (run.status !== "paid") {
      throw new HttpError(422, "Annual P10 cards are available after payroll has been paid");
    }

    const year = run.period.slice(0, 4);
    const paidRuns = await db.select({ id: payrollRuns.id, period: payrollRuns.period })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, p.orgId), eq(payrollRuns.status, "paid")));
    const yearRuns = paidRuns.filter((candidate) => candidate.period.startsWith(year));
    if (yearRuns.length === 0) throw new HttpError(404, `No paid payroll runs found for ${year}`);

    const runPeriodMap = new Map(yearRuns.map((candidate) => [candidate.id, candidate.period]));
    const allSlips = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, and(
        eq(payslips.employeeId, employees.id),
        eq(payslips.orgId, employees.orgId),
      ))
      .where(and(
        eq(payslips.orgId, p.orgId),
        inArray(payslips.runId, yearRuns.map((candidate) => candidate.id)),
      ));
    if (allSlips.length === 0) throw new HttpError(404, `No paid payslips found for ${year}`);

    type MonthlyTotals = Omit<P10CardData["totals"], "month">;
    type EmployeeCards = {
      emp: typeof allSlips[number]["emp"];
      months: Map<string, MonthlyTotals>;
    };
    const byEmployee = new Map<number, EmployeeCards>();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    for (const { slip, emp } of allSlips) {
      const period = runPeriodMap.get(slip.runId);
      const month = period ? Number(period.slice(5, 7)) : 1;
      const monthName = monthNames[month - 1] ?? monthNames[0];
      let employee = byEmployee.get(emp.id);
      if (!employee) {
        employee = { emp, months: new Map() };
        byEmployee.set(emp.id, employee);
      }
      let totals = employee.months.get(monthName);
      if (!totals) {
        totals = {
          basic: 0, benefits: 0, quarters: 0, grossPay: 0,
          definedContribution: 0, affordableHousingLevy: 0, shif: 0,
          postRetirementMedical: 0, ownerOccupiedInterest: 0, totalDeductions: 0,
          chargeablePay: 0, taxCharged: 0, personalRelief: 0,
          insuranceRelief: 0, payeTax: 0,
        };
        employee.months.set(monthName, totals);
      }
      totals.basic += slip.basic;
      totals.benefits += slip.nonCashBenefit;
      totals.grossPay += slip.gross;
      totals.definedContribution += slip.nssfEmployee + slip.pension;
      totals.affordableHousingLevy += slip.housingLevyEmployee;
      totals.shif += slip.shif;
      totals.ownerOccupiedInterest += slip.mortgageInterest;
      totals.totalDeductions += slip.nssfEmployee + slip.pension
        + slip.housingLevyEmployee + slip.shif + slip.mortgageInterest;
      totals.chargeablePay += slip.taxableIncome;
      totals.taxCharged += slip.payeBeforeRelief;
      totals.personalRelief += slip.personalRelief;
      totals.insuranceRelief += slip.insuranceRelief;
      totals.payeTax += slip.paye;
    }

    const [org] = await db.select().from(organizations)
      .where(eq(organizations.id, p.orgId));
    const cards: P10CardData[] = Array.from(byEmployee.values()).map(({ emp, months }) => {
      const monthlyRows = monthNames.map((month) => ({
        month,
        ...(months.get(month) ?? {
          basic: 0, benefits: 0, quarters: 0, grossPay: 0,
          definedContribution: 0, affordableHousingLevy: 0, shif: 0,
          postRetirementMedical: 0, ownerOccupiedInterest: 0, totalDeductions: 0,
          chargeablePay: 0, taxCharged: 0, personalRelief: 0,
          insuranceRelief: 0, payeTax: 0,
        }),
      }));
      const totals = monthlyRows.reduce<P10CardData["totals"]>((sum, row) => ({
        month: "TOTAL",
        basic: sum.basic + row.basic,
        benefits: sum.benefits + row.benefits,
        quarters: sum.quarters + row.quarters,
        grossPay: sum.grossPay + row.grossPay,
        definedContribution: sum.definedContribution + row.definedContribution,
        affordableHousingLevy: sum.affordableHousingLevy + row.affordableHousingLevy,
        shif: sum.shif + row.shif,
        postRetirementMedical: sum.postRetirementMedical + row.postRetirementMedical,
        ownerOccupiedInterest: sum.ownerOccupiedInterest + row.ownerOccupiedInterest,
        totalDeductions: sum.totalDeductions + row.totalDeductions,
        chargeablePay: sum.chargeablePay + row.chargeablePay,
        taxCharged: sum.taxCharged + row.taxCharged,
        personalRelief: sum.personalRelief + row.personalRelief,
        insuranceRelief: sum.insuranceRelief + row.insuranceRelief,
        payeTax: sum.payeTax + row.payeTax,
      }), {
        month: "TOTAL", basic: 0, benefits: 0, quarters: 0, grossPay: 0,
        definedContribution: 0, affordableHousingLevy: 0, shif: 0,
        postRetirementMedical: 0, ownerOccupiedInterest: 0, totalDeductions: 0,
        chargeablePay: 0, taxCharged: 0, personalRelief: 0,
        insuranceRelief: 0, payeTax: 0,
      });

      return {
        orgName: org?.name ?? "",
        orgKraPin: org?.kraPin ?? undefined,
        year,
        employee: {
          empNo: emp.empNo,
          firstName: emp.firstName,
          lastName: emp.lastName,
          otherNames: emp.middleName ?? undefined,
          kraPin: emp.kraPin ?? undefined,
        },
        months: monthlyRows,
        totals,
      };
    });

    const pdfBuffer = await generateP10Pdf(cards);
    const orgPin = (org?.kraPin ?? "ORG").replace(/[^A-Z0-9]/gi, "") || "ORG";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="P10_${year}_${orgPin}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── Email all payslips for a run ────────────────────────────────────────────
router.post("/:id/email-payslips", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Run not found");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const rows = await db
      .select({ slip: payslips, emp: employees })
      .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const { generatePayslipPdf } = await import("../lib/pdf-payslip.js");
    let sent = 0;
    const errors: string[] = [];

    for (const { slip, emp } of rows) {
      const email = emp.email;
      if (!email) { errors.push(`${emp.empNo}: no email`); continue; }
      try {
        const bd = (slip.breakdown ?? {}) as { nssfTier1?: number; nssfTier2?: number; insurancePremium?: number };
        const pdfBuffer = await generatePayslipPdf({
          orgName: org.name, orgKraPin: org.kraPin ?? undefined, orgNssfNo: org.nssfEmployerNo ?? undefined,
          period: run.period, runName: run.name,
          empNo: emp.empNo, empName: fullName(emp),
          position: emp.position ?? "", employmentType: emp.employmentType ?? "permanent",
          nationalId: emp.nationalId ?? undefined, kraPin: emp.kraPin ?? undefined,
          nssfNo: emp.nssfNo ?? undefined, shifNo: emp.shifNo ?? undefined,
          bankName: emp.bankName ?? undefined, bankAccount: emp.bankAccount ?? undefined,
          mpesaPhone: emp.mpesaPhone ?? undefined,
          daysPayable: slip.daysPayable ?? 0, daysInPeriod: slip.daysInPeriod ?? 30,
          basic: slip.basic, allowances: slip.allowances, overtime: slip.overtime,
          adjustmentEarnings: slip.adjustmentEarnings, nonCashBenefit: slip.nonCashBenefit,
          gross: slip.gross, cashGross: slip.cashGross,
          paye: slip.paye, nssfEmployee: slip.nssfEmployee,
          nssfTier1: bd.nssfTier1 ?? 0, nssfTier2: bd.nssfTier2 ?? 0,
          shif: slip.shif, housingLevyEmployee: slip.housingLevyEmployee,
          pension: slip.pension, helb: slip.helb, sacco: slip.sacco,
          loanDeduction: slip.loanDeduction, adjustmentDeductions: slip.adjustmentDeductions,
           insurancePremium: bd.insurancePremium ?? 0,
          totalDeductions: slip.totalDeductions, netPay: slip.netPay,
          nssfEmployer: slip.nssfEmployer, housingLevyEmployer: slip.housingLevyEmployer,
          pensionEmployer: slip.pensionEmployer,
        });
        await sendPayslipEmail({ to: email, empName: fullName(emp), period: run.period, orgName: org.name, pdfBuffer });
        sent++;
      } catch (e: any) {
        logger.warn({ err: e, employeeNo: emp.empNo }, "payslip: failed to send email");
        errors.push(`${emp.empNo}: ${getSafeMailError(e)}`);
      }
    }

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "PAYROLL_EMAIL_PAYSLIPS", entity: "payroll_runs", entityId: id,
        detail: `Emailed ${sent}/${rows.length} payslips for run ${run.name}`,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
      });
    });

    res.json({ sent, total: rows.length, errors });
  } catch (err) { next(err); }
});

// Statutory filings
// ── GET /:id/itax/p10 — KRA iTax P10 monthly return data + record filing ───
router.get("/:id/itax/p10", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const rows = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const warnings: string[] = [];
    const p10Rows = rows.map(({ slip, emp }) => {
      const name = fullName(emp);
      if (!emp.kraPin) warnings.push(`${emp.empNo} — ${name}: missing KRA PIN (row will be rejected by iTax)`);
      return {
        empNo: emp.empNo,
        kraPin: emp.kraPin ?? "",
        name,
        residentStatus: emp.residentStatus === "resident" ? "Resident" : "Non-Resident",
        employeeType: emp.disabilityExemption ? "Disabled" : "Primary Employee",
        pwd: emp.disabilityExemption ? "Yes" : "No",
        exemptionCertificateNumber: "",
        totalCashPay: slip.cashGross,
        carBenefit: 0,
        mealsBenefit: 0,
        nonCashBenefits: slip.nonCashBenefit,
        housingType: slip.nonCashBenefit > 0 ? "Benefit given" : "Benefit not given",
        housingBenefit: 0,
        otherBenefits: 0,
        gross: slip.gross,
        shif: slip.shif,
        nssf: slip.nssfEmployee,
        otherPension: slip.pension,
        postRetirementMedical: 0,
        mortgageInterest: slip.mortgageInterest,
        affordableHousingLevy: slip.housingLevyEmployee,
        taxablePay: slip.taxableIncome,
        personalRelief: slip.personalRelief,
        insuranceRelief: slip.insuranceRelief,
        paye: slip.paye,
        selfAssessedPaye: 0,
        missingPin: !emp.kraPin,
      };
    });

    const totalPaye = rows.reduce((s, r) => s + r.slip.paye, 0);

    // Upsert filing record
    const [existing] = await db.select({ id: statutoryFilings.id }).from(statutoryFilings)
      .where(and(
        eq(statutoryFilings.orgId, p.orgId),
        eq(statutoryFilings.runId, id),
        eq(statutoryFilings.kind, "P10"),
      )).limit(1);

    const now = new Date();
    if (existing) {
      await db.update(statutoryFilings)
        .set({ status: "downloaded", filedAt: now, itemCount: rows.length, totalAmount: totalPaye })
        .where(and(
          eq(statutoryFilings.id, existing.id),
          eq(statutoryFilings.orgId, p.orgId),
        ));
    } else {
      await db.insert(statutoryFilings).values({
        orgId: p.orgId, runId: id, kind: "P10", period: run.period,
        itemCount: rows.length, totalAmount: totalPaye, status: "downloaded", filedAt: now,
      });
    }

    res.json({
      rows: p10Rows,
      warnings,
      orgKraPin: org?.kraPin ?? "",
      orgName: org?.name ?? "",
      period: run.period,
      runName: run.name,
      totalPaye,
      p10FiledAt: now.toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /:id/itax/nssf — NSSF eCitizen bulk-upload CSV data + record filing ─
router.get("/:id/itax/nssf", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const rows = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const warnings: string[] = [];
    const nssfRows = rows.map(({ slip, emp }) => {
      const name = fullName(emp);
      if (!emp.nssfNo) warnings.push(`${emp.empNo} — ${name}: missing NSSF number`);
      const bd = (slip.breakdown ?? {}) as { nssfTier1?: number; nssfTier2?: number };
      const tier1Employee = bd.nssfTier1 ?? 0;
      const tier2Employee = bd.nssfTier2 ?? 0;
      // Employer mirrors employee contributions for both tiers
      const tier1Employer = tier1Employee;
      const tier2Employer = tier2Employee;
      // The reference NSSF workbook is the employee contribution schedule:
      // TOTAL AMOUNT is Tier I + Tier II employee contributions. Employer
      // mirrors are retained in the API response for the existing summary UI.
      const total = tier1Employee + tier2Employee;
      return {
        empNo: emp.empNo,
        nssfNo: emp.nssfNo ?? "",
        name,
        firstName: emp.firstName,
        lastName: [emp.middleName, emp.lastName].filter(Boolean).join(" "),
        nationalId: emp.nationalId ?? "",
        employerNo: org?.nssfEmployerNo ?? "",
        period: run.period,
        tier1Employee,
        tier1Employer,
        tier2Employee,
        tier2Employer,
        total,
        missingNssfNo: !emp.nssfNo,
      };
    });

    const totalNssf = rows.reduce((s, r) => s + r.slip.nssfEmployee + r.slip.nssfEmployer, 0);

    // Upsert filing record
    const [existing] = await db.select({ id: statutoryFilings.id }).from(statutoryFilings)
      .where(and(
        eq(statutoryFilings.orgId, p.orgId),
        eq(statutoryFilings.runId, id),
        eq(statutoryFilings.kind, "NSSF"),
      )).limit(1);

    const now = new Date();
    if (existing) {
      await db.update(statutoryFilings)
        .set({ status: "downloaded", filedAt: now, itemCount: rows.length, totalAmount: totalNssf })
        .where(and(
          eq(statutoryFilings.id, existing.id),
          eq(statutoryFilings.orgId, p.orgId),
        ));
    } else {
      await db.insert(statutoryFilings).values({
        orgId: p.orgId, runId: id, kind: "NSSF", period: run.period,
        itemCount: rows.length, totalAmount: totalNssf, status: "downloaded", filedAt: now,
      });
    }

    // Send confirmation email to the HR user who triggered the download
    let emailSent = false;
    let emailError: string | undefined;
    try {
      await sendStatutoryRemittanceEmail({
        to: p.email,
        orgName: org?.name ?? "",
        kind: "NSSF",
        period: run.period,
        employeeCount: rows.length,
        totalAmountKes: totalNssf,
        filedAt: now,
      });
      emailSent = true;
    } catch (mailErr: any) {
      emailError = getSafeMailError(mailErr);
      logger.warn({ err: mailErr }, "nssf: failed to send remittance confirmation email");
    }

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "NSSF_DOWNLOAD", entity: "statutory_filings", entityId: id,
        detail: emailSent ? "Remittance confirmation email sent" : `Email not sent: ${emailError}`,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { period: run.period, totalNssf, employeeCount: rows.length, emailSent },
      });
    });

    res.json({
      rows: nssfRows,
      warnings,
      orgNssfEmployerNo: org?.nssfEmployerNo ?? "",
      orgName: org?.name ?? "",
      period: run.period,
      runName: run.name,
      totalNssf,
      nssfFiledAt: now.toISOString(),
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) { next(err); }
});

// ── GET /:id/itax/shif — SHIF SHA portal bulk-upload CSV data + record filing ─
router.get("/:id/itax/shif", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const rows = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const warnings: string[] = [];
    const shifRows = rows.map(({ slip, emp }) => {
      const name = fullName(emp);
      if (!emp.shifNo) warnings.push(`${emp.empNo} — ${name}: missing SHIF number`);
      return {
        empNo: emp.empNo,
        firstName: emp.firstName,
        lastName: emp.lastName,
        phone: emp.phone ?? emp.mpesaPhone ?? "",
        kraPin: emp.kraPin ?? "",
        shifNo: emp.shifNo ?? "",
        nationalId: emp.nationalId ?? "",
        name,
        shifAmount: slip.shif,
        missingShifNo: !emp.shifNo,
      };
    });

    const totalShif = rows.reduce((s, r) => s + r.slip.shif, 0);

    // Upsert filing record
    const [existing] = await db.select({ id: statutoryFilings.id }).from(statutoryFilings)
      .where(and(
        eq(statutoryFilings.orgId, p.orgId),
        eq(statutoryFilings.runId, id),
        eq(statutoryFilings.kind, "SHIF"),
      )).limit(1);

    const now = new Date();
    if (existing) {
      await db.update(statutoryFilings)
        .set({ status: "downloaded", filedAt: now, itemCount: rows.length, totalAmount: totalShif })
        .where(and(
          eq(statutoryFilings.id, existing.id),
          eq(statutoryFilings.orgId, p.orgId),
        ));
    } else {
      await db.insert(statutoryFilings).values({
        orgId: p.orgId, runId: id, kind: "SHIF", period: run.period,
        itemCount: rows.length, totalAmount: totalShif, status: "downloaded", filedAt: now,
      });
    }

    // Send confirmation email to the HR user who triggered the download
    let emailSent = false;
    let emailError: string | undefined;
    try {
      await sendStatutoryRemittanceEmail({
        to: p.email,
        orgName: org?.name ?? "",
        kind: "SHIF",
        period: run.period,
        employeeCount: rows.length,
        totalAmountKes: totalShif,
        filedAt: now,
      });
      emailSent = true;
    } catch (mailErr: any) {
      emailError = getSafeMailError(mailErr);
      logger.warn({ err: mailErr }, "shif: failed to send remittance confirmation email");
    }

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "SHIF_DOWNLOAD", entity: "statutory_filings", entityId: id,
        detail: emailSent ? "Remittance confirmation email sent" : `Email not sent: ${emailError}`,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { period: run.period, totalShif, employeeCount: rows.length, emailSent },
      });
    });

    res.json({
      rows: shifRows,
      warnings,
      orgName: org?.name ?? "",
      period: run.period,
      runName: run.name,
      totalShif,
      shifFiledAt: now.toISOString(),
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) { next(err); }
});

// ── GET /:id/itax/ahl — AHL bulk-upload CSV data + record filing ─────────────
router.get("/:id/itax/ahl", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const rows = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
        .innerJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
      .where(and(eq(payslips.runId, id), eq(payslips.orgId, p.orgId)));

    const warnings: string[] = [];
    const ahlRows = rows.map(({ slip, emp }) => {
      const name = fullName(emp);
      if (!emp.kraPin) warnings.push(`${emp.empNo} — ${name}: missing KRA PIN`);
      const employeeAhl = slip.housingLevyEmployee;
      const employerAhl = slip.housingLevyEmployer;
      return {
        empNo: emp.empNo,
        kraPin: emp.kraPin ?? "",
        nationalId: emp.nationalId ?? "",
        name,
        employeeAhl,
        employerAhl,
        totalAhl: employeeAhl + employerAhl,
        missingPin: !emp.kraPin,
      };
    });

    const totalAhl = rows.reduce((s, r) => s + r.slip.housingLevyEmployee + r.slip.housingLevyEmployer, 0);

    // Upsert filing record
    const [existing] = await db.select({ id: statutoryFilings.id }).from(statutoryFilings)
      .where(and(
        eq(statutoryFilings.orgId, p.orgId),
        eq(statutoryFilings.runId, id),
        eq(statutoryFilings.kind, "AHL"),
      )).limit(1);

    const now = new Date();
    if (existing) {
      await db.update(statutoryFilings)
        .set({ status: "downloaded", filedAt: now, itemCount: rows.length, totalAmount: totalAhl })
        .where(and(
          eq(statutoryFilings.id, existing.id),
          eq(statutoryFilings.orgId, p.orgId),
        ));
    } else {
      await db.insert(statutoryFilings).values({
        orgId: p.orgId, runId: id, kind: "AHL", period: run.period,
        itemCount: rows.length, totalAmount: totalAhl, status: "downloaded", filedAt: now,
      });
    }

    // Send confirmation email
    let emailSent = false;
    let emailError: string | undefined;
    try {
      await sendStatutoryRemittanceEmail({
        to: p.email,
        orgName: org?.name ?? "",
        kind: "AHL",
        period: run.period,
        employeeCount: rows.length,
        totalAmountKes: totalAhl,
        filedAt: now,
      });
      emailSent = true;
    } catch (mailErr: any) {
      emailError = getSafeMailError(mailErr);
      logger.warn({ err: mailErr }, "ahl: failed to send remittance confirmation email");
    }

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "AHL_DOWNLOAD", entity: "statutory_filings", entityId: id,
        detail: emailSent ? "Remittance confirmation email sent" : `Email not sent: ${emailError}`,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { period: run.period, totalAhl, employeeCount: rows.length, emailSent },
      });
    });

    res.json({
      rows: ahlRows,
      warnings,
      orgName: org?.name ?? "",
      period: run.period,
      runName: run.name,
      totalAhl,
      ahlFiledAt: now.toISOString(),
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) { next(err); }
});

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
