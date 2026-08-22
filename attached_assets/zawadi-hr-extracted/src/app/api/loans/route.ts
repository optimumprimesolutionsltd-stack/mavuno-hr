import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { loans, employees, loanRepayments } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { moneyString, isoDate } from "@/lib/validation/schemas";
import { toCents, mulBps, mulRatio, type Cents } from "@/lib/money";
import { writeAudit } from "@/lib/audit";
import { computeLoanFringeBenefitTax } from "@/lib/payroll";
import { resolveConfig } from "@/lib/statutory/resolve";

export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    const isAdmin = ["hr", "payroll_officer", "approver", "admin"].includes(principal.role);

    const rows = await tx
      .select({ loan: loans, employee: employees })
      .from(loans)
      .innerJoin(employees, eq(loans.employeeId, employees.id))
      .where(and(
        eq(loans.orgId, principal.orgId),
        ...(isAdmin ? [] : [eq(loans.employeeId, principal.employeeId ?? -1)]),
      ))
      .orderBy(desc(loans.createdAt));

    /* The repayment ledger is what an employee (and an auditor) actually needs:
     * a balance alone is unverifiable. */
    const withLedger = await Promise.all(rows.map(async (r) => ({
      ...r,
      repayments: await tx.select().from(loanRepayments)
        .where(eq(loanRepayments.loanId, r.loan.id))
        .orderBy(desc(loanRepayments.createdAt)),
    })));

    /* Fringe Benefit Tax exposure: staff loans priced below the KRA deemed
     * rate create a monthly EMPLOYER tax liability that most small employers
     * discover only at audit. Surfacing it per-loan (privileged view only)
     * turns a surprise assessment into a line item Finance already accrues. */
    if (isAdmin) {
      const period = new Date().toISOString().slice(0, 7);
      const { config } = await resolveConfig(tx, principal.orgId, principal.countryCode, period);
      const enriched = withLedger.map((r) => ({
        ...r,
        fringeBenefit: r.loan.status === "active"
          ? computeLoanFringeBenefitTax(r.loan.balance, r.loan.interestRateBps, config)
          : { monthlyBenefit: 0, monthlyTax: 0 },
      }));
      return NextResponse.json(enriched);
    }

    return NextResponse.json(withLedger);
  }),
);

const directLoanSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  type: z.enum(["company", "sacco", "advance", "emergency"]),
  principal: moneyString,
  interestRateBps: z.coerce.number().int().min(0).max(10_000).default(0),
  months: z.coerce.number().int().min(1).max(60),
  startDate: isoDate.optional(),
});

/**
 * HR-initiated loan (no employee request needed) — e.g. a negotiated staff
 * loan agreed offline. Same affordability guard as request approval: an
 * installment that exceeds estimated take-home would only surface as a
 * blocked payroll run weeks later, so we refuse it here.
 */
export const POST = route(
  { permission: "loan:review", schema: directLoanSchema },
  async ({ principal, body, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const [emp] = await tx.select().from(employees).where(and(
        eq(employees.id, body.employeeId), eq(employees.orgId, principal.orgId),
      ));
      if (!emp) throw new HttpError(404, "Employee not found");
      if (emp.status === "terminated") throw new HttpError(409, "Cannot issue a loan to a terminated employee");

      /* You cannot issue a loan to yourself. */
      if (emp.id === principal.employeeId) {
        throw new HttpError(403, "You cannot issue a loan to yourself — ask another reviewer");
      }

      const principalCents = toCents(body.principal) as Cents;
      const interest = mulRatio(mulBps(principalCents, body.interestRateBps), body.months, 12);
      const total = (principalCents + interest) as Cents;
      const installment = mulRatio(total, 1, body.months);

      const roughNet = mulBps(
        (emp.basicSalary + emp.houseAllowance + emp.transportAllowance + emp.otherAllowance) as Cents,
        6500,
      );
      if (installment > roughNet) {
        throw new HttpError(
          409,
          `A monthly installment of ${installment / 100} exceeds this employee's estimated take-home pay. Extend the term or reduce the amount.`,
          "UNAFFORDABLE_INSTALLMENT",
        );
      }

      const [loan] = await tx.insert(loans).values({
        orgId: principal.orgId,
        employeeId: body.employeeId,
        type: body.type,
        principal: principalCents,
        balance: total,
        monthlyInstallment: installment,
        interestRateBps: body.interestRateBps,
        startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
      }).returning();

      await writeAudit(tx, {
        orgId: principal.orgId, action: "LOAN_ISSUED", entity: "loans", entityId: loan.id,
        detail: `${emp.firstName} ${emp.lastName}: direct ${body.type} loan, ${principalCents / 100} principal + ${interest / 100} interest over ${body.months} months (${installment / 100}/mo)`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        after: { loanId: loan.id, principal: principalCents, balance: total, installment },
      });

      return NextResponse.json(loan, { status: 201 });
    }),
);
