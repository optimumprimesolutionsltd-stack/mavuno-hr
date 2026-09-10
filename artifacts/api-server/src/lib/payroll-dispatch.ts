/**
 * Post-pay dispatch: generate the payout batch and/or email payslips for a run.
 *
 * These run in two places:
 *  - the explicit endpoints POST /api/payroll/:id/payouts and
 *    POST /api/payroll/:id/email-payslips (manual trigger), and
 *  - automatically after a run is paid, when the org has
 *    auto_generate_payout_on_pay / auto_email_payslips_on_pay turned on.
 *
 * The auto path (runAutoOnPay) is strictly best-effort: it never throws, so a
 * failed email or bank file can't undo a paid run. Callers surface `warnings`.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees, organizations, payoutBatches } from "@workspace/db/schema";
import { writeAudit } from "./audit.js";
import { fullName } from "./employee-name.js";
import { sendPayslipEmail, getSafeResendError } from "./mailer.js";
import { logger } from "./logger.js";

export async function generatePayoutBatch(opts: {
  orgId: number;
  runId: number;
  actorUserId: number | null;
  channel?: string;
  format?: string;
}) {
  const { orgId, runId, actorUserId, channel = "bank_eft", format = "csv" } = opts;

  const slips = await db.select({ slip: payslips, emp: employees })
    .from(payslips)
    .innerJoin(employees, and(
      eq(payslips.employeeId, employees.id),
      eq(payslips.orgId, employees.orgId),
    ))
    .where(and(eq(payslips.runId, runId), eq(payslips.orgId, orgId)));

  const lines = slips
    .map((r) => `${r.emp.empNo},${fullName(r.emp)},${r.emp.bankAccount ?? ""},${r.slip.netPay}`)
    .join("\n");
  const checksum = createHash("sha256").update(lines).digest("hex");
  const totalAmount = slips.reduce((a, r) => a + r.slip.netPay, 0);

  const [batch] = await db.insert(payoutBatches).values({
    orgId, runId, channel, format,
    itemCount: slips.length, totalAmount, checksum,
    generatedByUserId: actorUserId, status: "generated",
  }).returning();

  return batch;
}

export async function emailRunPayslips(opts: {
  orgId: number;
  runId: number;
  actorUserId: number | null;
  actorEmail: string;
  actorIp: string | null;
}): Promise<{ sent: number; total: number; errors: string[] }> {
  const { orgId, runId, actorUserId, actorEmail, actorIp } = opts;

  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, orgId)));
  if (!run) return { sent: 0, total: 0, errors: ["run not found"] };
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));

  const rows = await db
    .select({ slip: payslips, emp: employees })
    .from(payslips)
    .innerJoin(employees, and(
      eq(payslips.employeeId, employees.id),
      eq(payslips.orgId, employees.orgId),
    ))
    .where(and(eq(payslips.runId, runId), eq(payslips.orgId, orgId)));

  const { generatePayslipPdf } = await import("./pdf-payslip.js");
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
      errors.push(`${emp.empNo}: ${getSafeResendError(e)}`);
    }
  }

  await db.transaction(async (tx) => {
    await writeAudit(tx as any, {
      orgId, action: "PAYROLL_EMAIL_PAYSLIPS", entity: "payroll_runs", entityId: runId,
      detail: `Emailed ${sent}/${rows.length} payslips for run ${run.name}`,
      actorUserId, actorEmail, actorIp,
    });
  });

  return { sent, total: rows.length, errors };
}

/**
 * Runs whichever post-pay side effects the org has opted into. Best-effort:
 * every failure becomes a warning string, nothing throws.
 */
export async function runAutoOnPay(opts: {
  orgId: number;
  runId: number;
  actorUserId: number | null;
  actorEmail: string;
  actorIp: string | null;
}): Promise<{ payoutBatchId?: number; payslipsSent?: number; warnings: string[] }> {
  const { orgId, runId, actorUserId, actorEmail, actorIp } = opts;
  const warnings: string[] = [];
  const result: { payoutBatchId?: number; payslipsSent?: number; warnings: string[] } = { warnings };

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return result;

  if (org.autoGeneratePayoutOnPay) {
    try {
      const batch = await generatePayoutBatch({ orgId, runId, actorUserId });
      result.payoutBatchId = batch?.id;
    } catch (e: any) {
      logger.error({ err: e, orgId, runId }, "auto-on-pay: payout batch failed");
      warnings.push(`Bank file not generated: ${e?.message ?? "unknown error"}`);
    }
  }

  if (org.autoEmailPayslipsOnPay) {
    try {
      const { sent, total, errors } = await emailRunPayslips({ orgId, runId, actorUserId, actorEmail, actorIp });
      result.payslipsSent = sent;
      if (errors.length) warnings.push(`Payslip email: ${sent}/${total} sent — ${errors.slice(0, 3).join("; ")}`);
    } catch (e: any) {
      logger.error({ err: e, orgId, runId }, "auto-on-pay: payslip email failed");
      warnings.push(`Payslips not emailed: ${e?.message ?? "unknown error"}`);
    }
  }

  return result;
}
