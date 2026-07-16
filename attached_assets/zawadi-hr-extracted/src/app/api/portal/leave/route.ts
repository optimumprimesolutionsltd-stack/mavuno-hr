import { NextResponse } from "next/server";
import { and, eq, desc, inArray } from "drizzle-orm";
import { leaveRequests, leaveDocuments, employees } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { leaveSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/audit";

/**
 * Employee self-service: MY leave requests and MY balance only.
 *
 * employeeId always comes from `principal.employeeId` (the session), never
 * from a request parameter — that is what stops one employee reading or
 * filing leave for another by editing a URL.
 */
export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const [emp] = await tx.select({ leaveBalance: employees.leaveBalance }).from(employees)
      .where(and(eq(employees.id, principal.employeeId), eq(employees.orgId, principal.orgId)));

    const leaves = await tx.select().from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, principal.orgId), eq(leaveRequests.employeeId, principal.employeeId)))
      .orderBy(desc(leaveRequests.createdAt));

    const docs = leaves.length
      ? await tx.select().from(leaveDocuments).where(and(
          eq(leaveDocuments.orgId, principal.orgId),
          inArray(leaveDocuments.leaveRequestId, leaves.map((l) => l.id)),
        ))
      : [];

    return NextResponse.json({
      leaveBalance: emp?.leaveBalance ?? 0,   // tenths of a day
      leaves: leaves.map((l) => ({
        ...l,
        documents: docs
          .filter((d) => d.leaveRequestId === l.id)
          .map((d) => ({ id: d.id, fileName: d.fileName, uploadedAt: d.uploadedAt, size: d.size })),
      })),
    });
  }),
);

export const POST = route({ permission: "self:request", schema: leaveSchema }, async ({ principal, body, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const [emp] = await tx.select().from(employees)
      .where(and(eq(employees.id, principal.employeeId), eq(employees.orgId, principal.orgId)));
    if (!emp) throw new HttpError(404, "Employee not found");

    const days = Math.round(
      ((new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86_400_000 + 1) * 10,
    );

    if (body.type === "annual" && days > emp.leaveBalance) {
      throw new HttpError(
        409,
        `Requested ${days / 10} days but only ${emp.leaveBalance / 10} are available`,
        "INSUFFICIENT_LEAVE_BALANCE",
      );
    }

    const [row] = await tx.insert(leaveRequests).values({
      orgId: principal.orgId,
      employeeId: principal.employeeId,
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      days,
      reason: body.reason ?? null,
    }).returning();

    await writeAudit(tx, {
      orgId: principal.orgId, action: "LEAVE_REQUESTED", entity: "leave_requests", entityId: row.id,
      detail: `${emp.firstName} ${emp.lastName}: ${days / 10} days ${body.type} leave, ${body.startDate} to ${body.endDate}`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    });

    return NextResponse.json(row, { status: 201 });
  }),
);
