import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { employees, payslips, payrollRuns, departments } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";

/** An employee's own record and payslip history. Own only — enforced by orgId
 *  AND by employeeId from the session, never from a query parameter. */
export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const [row] = await tx
      .select({ employee: employees, department: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.id, principal.employeeId), eq(employees.orgId, principal.orgId)));
    if (!row) throw new HttpError(404, "Employee not found");

    const slips = await tx
      .select({ payslip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(
        eq(payslips.orgId, principal.orgId),
        eq(payslips.employeeId, principal.employeeId),
        /* Only PAID runs. An employee must not see a draft payslip — the numbers
         * can still change, and showing them causes a support ticket at best and
         * a grievance at worst. */
        eq(payrollRuns.status, "paid"),
      ))
      .orderBy(desc(payrollRuns.period));

    return NextResponse.json({ ...row, payslips: slips, currency: principal.currencyCode });
  }),
);
