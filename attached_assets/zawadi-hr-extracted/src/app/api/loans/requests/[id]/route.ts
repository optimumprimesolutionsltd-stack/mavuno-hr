import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { loanRequests, loans, employees } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { loanDecisionSchema } from "@/lib/validation/schemas";
import { mulBps, mulRatio, type Cents } from "@/lib/money";
import { writeAudit } from "@/lib/audit";

export const PATCH = route(
  { permission: "loan:review", schema: loanDecisionSchema },
  async ({ principal, body, params, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const id = Number(params.id);

      const [request] = await tx.select().from(loanRequests)
        .where(and(eq(loanRequests.id, id), eq(loanRequests.orgId, principal.orgId)))
        .for("update");
      if (!request) throw new HttpError(404, "Loan request not found");
      if (request.status !== "pending")
        throw new HttpError(409, `This request has already been ${request.status}`);

      /* You cannot approve your own loan. */
      if (request.employeeId === principal.employeeId) {
        throw new HttpError(403, "You cannot review your own loan request");
      }

      if (body.action === "reject") {
        const [row] = await tx.update(loanRequests).set({
          status: "rejected", reviewNote: body.reviewNote ?? null,
          decidedByUserId: principal.userId, reviewedAt: new Date(),
        }).where(eq(loanRequests.id, id)).returning();

        await writeAudit(tx, {
          orgId: principal.orgId, action: "LOAN_REJECTED", entity: "loan_requests", entityId: id,
          detail: `Loan request #${id} rejected: ${body.reviewNote ?? "no reason given"}`,
          actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        });
        return NextResponse.json(row);
      }

      /* ---- Approve: create the loan ---- */
      const months = body.months ?? request.months;
      const principalCents = request.amount as Cents;

      /* Simple interest over the term, in integer basis points. The old code did
       * this in floats and rounded at the end, so the installments could fail to
       * sum to the balance and leave a few cents outstanding forever. */
      const interest = mulRatio(mulBps(principalCents, body.interestRateBps), months, 12);
      const total = (principalCents + interest) as Cents;

      /* The last installment absorbs the rounding remainder, so N installments
       * sum EXACTLY to the balance. */
      const installment = mulRatio(total, 1, months);

      const [emp] = await tx.select().from(employees).where(eq(employees.id, request.employeeId));

      /* Affordability: an installment that exceeds take-home pay produces a
       * negative payslip, which the approval gate will then block on payday.
       * Catch it here, at the point of decision, where it can still be changed. */
      const roughNet = mulBps(
        (emp.basicSalary + emp.houseAllowance + emp.transportAllowance + emp.otherAllowance) as Cents,
        6500,   // ~65% of gross after statutory deductions and PAYE
      );
      if (installment > roughNet) {
        throw new HttpError(
          409,
          `A monthly installment of ${installment / 100} exceeds this employee's estimated ` +
          `take-home pay of about ${roughNet / 100}. Extend the term or reduce the amount.`,
          "UNAFFORDABLE_INSTALLMENT",
        );
      }

      const [loan] = await tx.insert(loans).values({
        orgId: principal.orgId,
        employeeId: request.employeeId,
        type: request.type,
        principal: principalCents,
        balance: total,
        monthlyInstallment: installment,
        interestRateBps: body.interestRateBps,
        startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
      }).returning();

      const [row] = await tx.update(loanRequests).set({
        status: "approved", reviewNote: body.reviewNote ?? null, loanId: loan.id,
        decidedByUserId: principal.userId, reviewedAt: new Date(),
      }).where(eq(loanRequests.id, id)).returning();

      await writeAudit(tx, {
        orgId: principal.orgId, action: "LOAN_APPROVED", entity: "loans", entityId: loan.id,
        detail: `${emp.firstName} ${emp.lastName}: ${principalCents / 100} principal + ${interest / 100} interest = ${total / 100} over ${months} months (${installment / 100}/mo)`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        after: { loanId: loan.id, principal: principalCents, balance: total, installment },
      });

      return NextResponse.json({ request: row, loan }, { status: 201 });
    }),
);
