import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { employees, departments, organizations, users } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { employeeSchema } from "@/lib/validation/schemas";
import { toCents } from "@/lib/money";
import { writeAudit } from "@/lib/audit";

/**
 * Salary data is the most sensitive thing in the system. Note what is NOT
 * returned to a non-privileged caller: an employee or manager sees the roster,
 * not everybody's pay.
 */
export const GET = route({ permission: "employee:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    const rows = await tx
      .select({ employee: employees, department: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(eq(employees.orgId, principal.orgId))
      .orderBy(desc(employees.id));

    const canSeePay = ["hr", "payroll_officer", "approver", "admin"].includes(principal.role);
    if (canSeePay) return NextResponse.json(rows);

    return NextResponse.json(rows.map(({ employee, department }) => ({
      department,
      employee: {
        id: employee.id, empNo: employee.empNo,
        firstName: employee.firstName, lastName: employee.lastName,
        email: employee.email, position: employee.position,
        departmentId: employee.departmentId, status: employee.status,
        hireDate: employee.hireDate,
      },
    })));
  }),
);

export const POST = route(
  { permission: "employee:write", schema: employeeSchema },
  async ({ principal, body, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const [org] = await tx.select().from(organizations)
        .where(eq(organizations.id, principal.orgId));

      /* Seat limit is enforced at the point of adding a person, not just at
       * payroll time — otherwise a customer discovers they are over their plan
       * on payday, which is the worst possible moment. */
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(eq(employees.orgId, principal.orgId), sql`${employees.status} <> 'terminated'`));

      if (n >= org.seatLimit) {
        throw new HttpError(
          402,
          `Your plan covers ${org.seatLimit} employees and you have ${n}. Upgrade to add more.`,
          "SEAT_LIMIT_EXCEEDED",
        );
      }

      const [{ next }] = await tx.select({
        next: sql<number>`coalesce(max(cast(nullif(regexp_replace(${employees.empNo}, '\\D', '', 'g'), '') as int)), 1000) + 1`,
      }).from(employees).where(eq(employees.orgId, principal.orgId));

      const [row] = await tx.insert(employees).values({
        orgId: principal.orgId,
        empNo: `ZW-${next}`,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email.toLowerCase(),
        phone: body.phone ?? null,
        gender: body.gender,
        nationalId: body.nationalId ?? null,
        kraPin: body.kraPin ?? null,
        nssfNo: body.nssfNo ?? null,
        shifNo: body.shifNo ?? null,
        payMethod: body.payMethod,
        bankName: body.bankName ?? null,
        bankCode: body.bankCode ?? null,
        bankBranchCode: body.bankBranchCode ?? null,
        bankAccount: body.bankAccount ?? null,
        mpesaPhone: body.mpesaPhone ?? null,
        departmentId: body.departmentId ?? null,
        position: body.position,
        employmentType: body.employmentType,
        residentStatus: body.residentStatus,
        disabilityExemption: body.disabilityExemption,
        basicSalary: toCents(body.basicSalary),
        houseAllowance: toCents(body.houseAllowance),
        transportAllowance: toCents(body.transportAllowance),
        otherAllowance: toCents(body.otherAllowance),
        nonCashBenefit: toCents(body.nonCashBenefit),
        insurancePremium: toCents(body.insurancePremium),
        pensionEmployee: toCents(body.pensionEmployee),
        pensionEmployer: toCents(body.pensionEmployer),
        mortgageInterest: toCents(body.mortgageInterest),
        helbMonthly: toCents(body.helbMonthly),
        saccoMonthly: toCents(body.saccoMonthly),
        hireDate: body.hireDate,
      }).returning();

      await writeAudit(tx, {
        orgId: principal.orgId, action: "EMPLOYEE_CREATED", entity: "employees", entityId: row.id,
        detail: `${row.firstName} ${row.lastName} (${row.empNo}) added as ${row.position}`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        after: { empNo: row.empNo, position: row.position, basicSalary: row.basicSalary },
      });

      return NextResponse.json(row, { status: 201 });
    }),
);
