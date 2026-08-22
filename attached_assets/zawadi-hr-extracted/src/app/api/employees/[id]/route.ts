import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { employees, departments, payslips, payrollRuns, loans, leaveRequests } from "@/db/schema";
import { computePayslip, emptyPayInput, type PayInput } from "@/lib/payroll";
import { resolveConfig } from "@/lib/statutory/resolve";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { employeeBaseSchema } from "@/lib/validation/schemas";
import { toCents } from "@/lib/money";
import { writeAudit } from "@/lib/audit";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { users } from "@/db/schema";

/**
 * Full profile for the admin detail page: the employee, their department,
 * payslip history, loans, leave — and a LIVE payslip preview computed
 * server-side against the statutory config currently in force. (The client
 * cannot compute this itself: rates live in the database, not in the bundle.)
 */
export const GET = route({ permission: "employee:read" }, async ({ principal, params }) =>
  withTenant(principal.orgId, async (tx) => {
    const id = Number(params.id);
    const [row] = await tx
      .select({ employee: employees, department: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.id, id), eq(employees.orgId, principal.orgId)));
    if (!row) throw new HttpError(404, "Employee not found");
    const e = row.employee;

    const slips = await tx
      .select({ payslip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.orgId, principal.orgId), eq(payslips.employeeId, id)))
      .orderBy(desc(payrollRuns.period));

    const empLoans = await tx.select().from(loans)
      .where(and(eq(loans.orgId, principal.orgId), eq(loans.employeeId, id)))
      .orderBy(desc(loans.createdAt));

    const leaves = await tx.select().from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, principal.orgId), eq(leaveRequests.employeeId, id)))
      .orderBy(desc(leaveRequests.createdAt));

    const period = new Date().toISOString().slice(0, 7);
    const { config } = await resolveConfig(tx, principal.orgId, principal.countryCode, period);
    const livePayslip = computePayslip({
      ...emptyPayInput(),
      basicSalary: e.basicSalary,
      houseAllowance: e.houseAllowance,
      transportAllowance: e.transportAllowance,
      otherAllowance: e.otherAllowance,
      nonCashBenefit: e.nonCashBenefit,
      insurancePremium: e.insurancePremium,
      pensionEmployee: e.pensionEmployee,
      pensionEmployer: e.pensionEmployer,
      mortgageInterest: e.mortgageInterest,
      helbMonthly: e.helbMonthly,
      saccoMonthly: e.saccoMonthly,
      loanInstallment: empLoans
        .filter((l) => l.status === "active")
        .reduce((a, l) => a + Math.min(l.monthlyInstallment, l.balance), 0),
      employmentType: e.employmentType as PayInput["employmentType"],
      residentStatus: e.residentStatus as PayInput["residentStatus"],
      disabilityExemption: e.disabilityExemption,
    }, config);

    return NextResponse.json({
      employee: e,
      department: row.department,
      payslips: slips,
      loans: empLoans,
      leaves,
      livePayslip,
      statutoryConfigName: config.name,
    });
  }),
);

export const PATCH = route(
  { permission: "employee:write", schema: employeeBaseSchema.partial() },
  async ({ principal, body, params, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const id = Number(params.id);
      const [before] = await tx.select().from(employees)
        .where(and(eq(employees.id, id), eq(employees.orgId, principal.orgId)));
      if (!before) throw new HttpError(404, "Employee not found");

      const b = body as Record<string, unknown>;
      const MONEY = ["basicSalary","houseAllowance","transportAllowance","otherAllowance",
        "nonCashBenefit","insurancePremium","pensionEmployee","pensionEmployer",
        "mortgageInterest","helbMonthly","saccoMonthly"] as const;

      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        if (v === undefined) continue;
        patch[k] = (MONEY as readonly string[]).includes(k) ? toCents(v as string) : v;
      }

      const [after] = await tx.update(employees).set(patch)
        .where(and(eq(employees.id, id), eq(employees.orgId, principal.orgId)))
        .returning();

      /* Salary changes are the highest-risk edit in the system. The audit log
       * records the before AND after value of every field that moved, so a
       * quiet 10% raise cannot be slipped in unnoticed. */
      const changed = Object.keys(patch).filter(
        (k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k],
      );

      await writeAudit(tx, {
        orgId: principal.orgId, action: "EMPLOYEE_UPDATED", entity: "employees", entityId: id,
        detail: `${after.firstName} ${after.lastName} (${after.empNo}): changed ${changed.join(", ") || "nothing"}`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
        after: Object.fromEntries(changed.map((k) => [k, (after as Record<string, unknown>)[k]])),
      });

      return NextResponse.json(after);
    }),
);

/**
 * Termination — NOT deletion.
 *
 * You may not delete an employee who has ever been paid: their payslips are
 * statutory records that must survive for years, and their P9 must remain
 * producible. So we mark them terminated, set a termination date (which drives
 * final-month proration), and immediately kill their portal sessions.
 */
export const DELETE = route({ permission: "employee:write" }, async ({ principal, params, req, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    const id = Number(params.id);
    const terminationDate = new URL(req.url).searchParams.get("date")
      ?? new Date().toISOString().slice(0, 10);

    const [emp] = await tx.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.orgId, principal.orgId)));
    if (!emp) throw new HttpError(404, "Employee not found");

    const [after] = await tx.update(employees)
      .set({ status: "terminated", terminationDate })
      .where(and(eq(employees.id, id), eq(employees.orgId, principal.orgId)))
      .returning();

    /* Revoke access the moment they are terminated. With the old stateless
     * cookie this was impossible — a fired employee kept portal access, and
     * their payslips, for up to seven days. */
    const linked = await tx.select().from(users)
      .where(and(eq(users.orgId, principal.orgId), eq(users.employeeId, id)));
    for (const u of linked) {
      await tx.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id));
      await revokeAllUserSessions(u.id);
    }

    await writeAudit(tx, {
      orgId: principal.orgId, action: "EMPLOYEE_TERMINATED", entity: "employees", entityId: id,
      detail: `${emp.firstName} ${emp.lastName} (${emp.empNo}) terminated effective ${terminationDate}; ${linked.length} login(s) disabled`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
      before: { status: emp.status }, after: { status: "terminated", terminationDate },
    });

    return NextResponse.json(after);
  }),
);
