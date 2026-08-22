import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { leaveRequests, employees } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { leaveSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    const isAdmin = ["hr", "manager", "admin"].includes(principal.role);

    const rows = await tx
      .select({ leave: leaveRequests, employee: employees })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(and(
        eq(leaveRequests.orgId, principal.orgId),
        /* An ordinary employee sees only their own leave — never the whole
         * company's, which would leak who is on sick leave. */
        ...(isAdmin ? [] : [eq(leaveRequests.employeeId, principal.employeeId ?? -1)]),
      ))
      .orderBy(desc(leaveRequests.createdAt));

    return NextResponse.json(rows);
  }),
);

export const POST = route({ permission: "self:request", schema: leaveSchema }, async ({ principal, body, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    /* An employee may only file leave for themselves. Only HR may file on
     * behalf of someone else. */
    const targetId = body.employeeId ?? principal.employeeId;
    if (!targetId) throw new HttpError(400, "No employee is linked to your login");
    if (body.employeeId && body.employeeId !== principal.employeeId
        && !["hr", "admin"].includes(principal.role)) {
      throw new HttpError(403, "You may only request leave for yourself");
    }

    const [emp] = await tx.select().from(employees)
      .where(and(eq(employees.id, targetId), eq(employees.orgId, principal.orgId)));
    if (!emp) throw new HttpError(404, "Employee not found");

    const days = Math.round(
      ((new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86_400_000 + 1) * 10,
    );

    /* Annual leave cannot exceed the accrued balance. The old system let anyone
     * book 60 days of annual leave against a 21-day entitlement. */
    if (body.type === "annual" && days > emp.leaveBalance) {
      throw new HttpError(
        409,
        `Requested ${days / 10} days but only ${emp.leaveBalance / 10} are available`,
        "INSUFFICIENT_LEAVE_BALANCE",
      );
    }

    const [row] = await tx.insert(leaveRequests).values({
      orgId: principal.orgId, employeeId: targetId, type: body.type,
      startDate: body.startDate, endDate: body.endDate, days,
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

const decisionSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

export const PATCH = route(
  { permission: "leave:approve", schema: decisionSchema },
  async ({ principal, body, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const [leave] = await tx.select().from(leaveRequests)
        .where(and(eq(leaveRequests.id, body.id), eq(leaveRequests.orgId, principal.orgId)))
        .for("update");
      if (!leave) throw new HttpError(404, "Leave request not found");
      if (leave.status !== "pending")
        throw new HttpError(409, `This request has already been ${leave.status}`);

      /* You cannot approve your own leave. Same segregation principle as payroll. */
      if (leave.employeeId === principal.employeeId && principal.role !== "admin") {
        throw new HttpError(403, "You cannot approve your own leave request");
      }

      const approved = body.action === "approve";

      const [row] = await tx.update(leaveRequests).set({
        status: approved ? "approved" : "rejected",
        decidedByUserId: principal.userId,
        decidedAt: new Date(),
      }).where(eq(leaveRequests.id, body.id)).returning();

      /* Deduct the balance only on approval, and only for annual leave. */
      if (approved && leave.type === "annual") {
        const [emp] = await tx.select().from(employees).where(eq(employees.id, leave.employeeId));
        await tx.update(employees)
          .set({ leaveBalance: Math.max(0, emp.leaveBalance - leave.days) })
          .where(eq(employees.id, leave.employeeId));
      }

      await writeAudit(tx, {
        orgId: principal.orgId, action: approved ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        entity: "leave_requests", entityId: body.id,
        detail: `${leave.days / 10} days ${leave.type} leave ${approved ? "approved" : "rejected"}${body.note ? `: ${body.note}` : ""}`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        before: { status: "pending" }, after: { status: row.status },
      });

      return NextResponse.json(row);
    }),
);
