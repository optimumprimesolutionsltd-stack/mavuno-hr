import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { loanRequests, loans, loanRepayments } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { loanRequestSchema } from "@/lib/validation/schemas";
import { toCents } from "@/lib/money";
import { writeAudit } from "@/lib/audit";

export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const requests = await tx.select().from(loanRequests)
      .where(and(eq(loanRequests.orgId, principal.orgId), eq(loanRequests.employeeId, principal.employeeId)))
      .orderBy(desc(loanRequests.createdAt));

    const myLoans = await tx.select().from(loans)
      .where(and(eq(loans.orgId, principal.orgId), eq(loans.employeeId, principal.employeeId)))
      .orderBy(desc(loans.createdAt));

    /* The repayment ledger, not just a balance — so an employee can see exactly
     * which payroll run deducted which installment. */
    const withLedger = await Promise.all(myLoans.map(async (l) => ({
      ...l,
      repayments: await tx.select().from(loanRepayments)
        .where(eq(loanRepayments.loanId, l.id))
        .orderBy(desc(loanRepayments.createdAt)),
    })));

    return NextResponse.json({ requests, loans: withLedger });
  }),
);

export const POST = route(
  { permission: "self:request", schema: loanRequestSchema },
  async ({ principal, body, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

      /* An employee may not stack unlimited concurrent loan requests. */
      const pending = await tx.select({ id: loanRequests.id }).from(loanRequests).where(and(
        eq(loanRequests.orgId, principal.orgId),
        eq(loanRequests.employeeId, principal.employeeId),
        eq(loanRequests.status, "pending"),
      ));
      if (pending.length > 0) {
        throw new HttpError(409, "You already have a loan request awaiting review", "PENDING_REQUEST_EXISTS");
      }

      const [row] = await tx.insert(loanRequests).values({
        orgId: principal.orgId,
        employeeId: principal.employeeId,
        type: body.type,
        amount: toCents(body.amount),
        months: body.months,
        reason: body.reason ?? null,
      }).returning();

      await writeAudit(tx, {
        orgId: principal.orgId, action: "LOAN_REQUESTED", entity: "loan_requests", entityId: row.id,
        detail: `${body.type} loan of KES ${body.amount} over ${body.months} months requested`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
      });

      return NextResponse.json(row, { status: 201 });
    }),
);
