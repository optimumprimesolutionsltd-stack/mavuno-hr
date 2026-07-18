import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { employees, users } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { hashPassword, generateTempPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

/**
 * Grant or reset an employee's self-service portal login.
 *
 * The temp password is returned ONCE, to the HR user who triggered it, and is
 * never stored in plaintext. It must be rotated at first login (the route guard
 * blocks every other endpoint until it is).
 *
 * The old system seeded every employee with the same hardcoded "Welcome@2026".
 */
export const POST = route({ permission: "employee:write" }, async ({ principal, params, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    const empId = Number(params.id);

    const [emp] = await tx.select().from(employees)
      .where(and(eq(employees.id, empId), eq(employees.orgId, principal.orgId)));
    if (!emp) throw new HttpError(404, "Employee not found");
    if (emp.status === "terminated")
      throw new HttpError(409, "Cannot grant portal access to a terminated employee");

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const [existing] = await tx.select().from(users)
      .where(and(eq(users.orgId, principal.orgId), eq(users.employeeId, empId)));

    if (existing) {
      await tx.update(users).set({
        passwordHash, mustChangePassword: true,
        failedLoginCount: 0, lockedUntil: null, disabledAt: null,
      }).where(eq(users.id, existing.id));
      await revokeAllUserSessions(existing.id);   // a reset invalidates old sessions
    } else {
      await tx.insert(users).values({
        orgId: principal.orgId,
        email: emp.email.toLowerCase(),
        name: `${emp.firstName} ${emp.lastName}`,
        passwordHash,
        role: "employee",
        employeeId: empId,
        mustChangePassword: true,
      });
    }

    await writeAudit(tx, {
      orgId: principal.orgId, action: existing ? "PORTAL_PASSWORD_RESET" : "PORTAL_ACCESS_GRANTED",
      entity: "users", entityId: empId,
      detail: `Portal access ${existing ? "reset" : "granted"} for ${emp.firstName} ${emp.lastName} (${emp.empNo})`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    });

    return NextResponse.json({
      email: emp.email,
      tempPassword,
      note: "Shown once. The employee must change this at first login.",
    });
  }),
);
