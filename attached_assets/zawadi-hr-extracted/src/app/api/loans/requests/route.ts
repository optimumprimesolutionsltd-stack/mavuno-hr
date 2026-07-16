import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { loanRequests, employees } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { loanRequestSchema } from "@/lib/validation/schemas";
import { toCents } from "@/lib/money";
import { writeAudit } from "@/lib/audit";

export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    const isReviewer = ["hr", "payroll_officer", "approver", "admin"].includes(principal.role);
    const rows = await tx
      .select({ request: loanRequests, employee: employees })
      .from(loanRequests)
      .innerJoin(employees, eq(loanRequests.employeeId, employees.id))
      .where(and(
        eq(loanRequests.orgId, principal.orgId),
        ...(isReviewer ? [] : [eq(loanRequests.employeeId, principal.employeeId ?? -1)]),
      ))
      .orderBy(desc(loanRequests.createdAt));
    return NextResponse.json(rows);
  }),
);

export const POST = route(
  { permission: "self:request", schema: loanRequestSchema },
  async ({ principal, body, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

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
        detail: `${body.type} loan of ${body.amount} over ${body.months} months requested`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
      });

      return NextResponse.json(row, { status: 201 });
    }),
);
