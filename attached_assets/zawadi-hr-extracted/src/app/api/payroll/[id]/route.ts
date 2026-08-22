import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { payrollRuns, payslips, employees, departments } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { canApproveRun } from "@/lib/auth/rbac";
import { applyLoanRepayments } from "@/lib/payroll-run";
import { writeAudit } from "@/lib/audit";
import { runActionSchema } from "@/lib/validation/schemas";

export const GET = route({ permission: "payroll:read" }, async ({ principal, params }) =>
  withTenant(principal.orgId, async (tx) => {
    const runId = Number(params.id);
    const [run] = await tx.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, principal.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");

    const slips = await tx
      .select({ payslip: payslips, employee: employees, department: departments })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, principal.orgId)));

    return NextResponse.json({ run, payslips: slips });
  }),
);

/**
 * RUN LIFECYCLE:  draft -> pending_approval -> approved -> paid
 *                   └────────────────────────────────────> reversed
 *
 * The state machine is enforced here, not in the UI. Each transition is
 * permission-gated, audited, and — for approval — subject to segregation of
 * duties: the person who calculated the run may not approve it.
 */
export const PATCH = route(
  { permission: "payroll:read", schema: runActionSchema },
  async ({ principal, body, params, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const runId = Number(params.id);

      /* FOR UPDATE: two approvers clicking simultaneously must serialise, or
       * the run could be approved twice and disbursed twice. */
      const [run] = await tx.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, principal.orgId)))
        .for("update");
      if (!run) throw new HttpError(404, "Payroll run not found");

      const audit = (action: string, detail: string, after?: unknown) =>
        writeAudit(tx, {
          orgId: principal.orgId, action, entity: "payroll_runs", entityId: runId, detail,
          actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
          before: { status: run.status }, after,
        });

      switch (body.action) {
        /* ---- MAKER submits for review ---- */
        case "submit": {
          if (!["payroll_officer", "admin"].includes(principal.role))
            throw new HttpError(403, "Only a payroll officer can submit a run for approval");
          if (run.status !== "draft")
            throw new HttpError(409, `Cannot submit a run that is ${run.status}`);

          const [u] = await tx.update(payrollRuns).set({
            status: "pending_approval",
            submittedByUserId: principal.userId,
            submittedAt: new Date(),
          }).where(eq(payrollRuns.id, runId)).returning();

          await audit("PAYROLL_SUBMITTED", `${run.name} submitted for approval`, { status: "pending_approval" });
          return NextResponse.json(u);
        }

        /* ---- CHECKER approves ---- */
        case "approve": {
          if (run.status !== "pending_approval")
            throw new HttpError(409, `Only a run pending approval can be approved (this one is ${run.status})`);

          const verdict = canApproveRun(principal.role, principal.userId, run);
          if (!verdict.ok) throw new HttpError(403, verdict.reason, "SEGREGATION_OF_DUTIES");

          /* A run with unresolved negative-net-pay warnings must not be
           * approved: it means someone is about to be paid a negative salary. */
          const slips = await tx.select({ netPay: payslips.netPay })
            .from(payslips).where(eq(payslips.runId, runId));
          const negatives = slips.filter((s) => s.netPay < 0).length;
          if (negatives > 0) {
            throw new HttpError(
              409,
              `${negatives} payslip(s) have a negative net pay. Fix the underlying data ` +
              `(usually a loan installment exceeding take-home pay) and recalculate.`,
              "NEGATIVE_NET_PAY",
            );
          }

          const [u] = await tx.update(payrollRuns).set({
            status: "approved",
            approvedByUserId: principal.userId,
            approvedAt: new Date(),
          }).where(eq(payrollRuns.id, runId)).returning();

          await audit("PAYROLL_APPROVED",
            `${run.name} approved by ${principal.email} (maker: user #${run.createdByUserId})`,
            { status: "approved" });
          return NextResponse.json(u);
        }

        case "reject": {
          if (run.status !== "pending_approval")
            throw new HttpError(409, `Cannot reject a run that is ${run.status}`);
          const [u] = await tx.update(payrollRuns).set({
            status: "draft", submittedByUserId: null, submittedAt: null,
          }).where(eq(payrollRuns.id, runId)).returning();
          await audit("PAYROLL_REJECTED", `${run.name} sent back to draft: ${body.note ?? "no reason given"}`, { status: "draft" });
          return NextResponse.json(u);
        }

        /* ---- Disburse ---- */
        case "pay": {
          if (run.status !== "approved")
            throw new HttpError(409, "A run must be approved before it can be disbursed");

          /* Loan repayments are applied HERE, inside the same transaction as the
           * status change, and idempotently — see applyLoanRepayments. */
          await applyLoanRepayments(tx, principal.orgId, runId);

          const [u] = await tx.update(payrollRuns).set({
            status: "paid", paidByUserId: principal.userId, paidAt: new Date(),
          }).where(eq(payrollRuns.id, runId)).returning();

          await audit("PAYROLL_DISBURSED",
            `${run.name}: ${run.employeeCount} employees, net ${run.netTotal / 100} disbursed; loan balances updated`,
            { status: "paid" });
          return NextResponse.json(u);
        }

        /* ---- Reverse a paid run ---- */
        case "reverse": {
          if (run.status !== "paid")
            throw new HttpError(409, "Only a paid run can be reversed");
          if (principal.role !== "admin")
            throw new HttpError(403, "Only an admin can reverse a disbursed payroll run");
          if (!body.note)
            throw new HttpError(422, "A reversal requires a written reason");

          /* We do NOT delete anything. The run and its payslips remain, marked
           * reversed, and the loan ledger gets compensating entries. An auditor
           * must be able to see that the run happened and was then reversed —
           * deleting it would destroy exactly the evidence they need. */
          const [u] = await tx.update(payrollRuns).set({
            status: "reversed", reversedAt: new Date(),
          }).where(eq(payrollRuns.id, runId)).returning();

          await audit("PAYROLL_REVERSED", `${run.name} REVERSED: ${body.note}`, { status: "reversed" });
          return NextResponse.json(u);
        }
      }
    }),
);

/** Draft runs can be discarded. Anything further along cannot — it is evidence. */
export const DELETE = route({ permission: "payroll:calculate" }, async ({ principal, params, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    const runId = Number(params.id);
    const [run] = await tx.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, principal.orgId)));
    if (!run) throw new HttpError(404, "Payroll run not found");
    if (run.status !== "draft")
      throw new HttpError(409, `Only a draft run can be discarded (this one is ${run.status})`);

    await tx.delete(payrollRuns).where(eq(payrollRuns.id, runId));
    await writeAudit(tx, {
      orgId: principal.orgId, action: "PAYROLL_DISCARDED", entity: "payroll_runs", entityId: runId,
      detail: `Draft run "${run.name}" discarded`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
      before: { name: run.name, status: run.status },
    });
    return NextResponse.json({ ok: true });
  }),
);
