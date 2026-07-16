import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { timesheets, employees } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { timesheetSchema, period as periodSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/audit";

/** HR view: all timesheets for a period, with who's approved. */
export const GET = route({ permission: "employee:read" }, async ({ principal, req }) =>
  withTenant(principal.orgId, async (tx) => {
    const p = new URL(req.url).searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
    if (!periodSchema.safeParse(p).success) throw new HttpError(422, "period must be YYYY-MM");

    const rows = await tx
      .select({ timesheet: timesheets, employee: employees })
      .from(timesheets)
      .innerJoin(employees, eq(timesheets.employeeId, employees.id))
      .where(and(eq(timesheets.orgId, principal.orgId), eq(timesheets.period, p)));
    return NextResponse.json(rows);
  }),
);

/** HR upsert of a timesheet (field supervisors keying in casual days, etc). */
export const POST = route({ permission: "employee:write", schema: timesheetSchema }, async ({ principal, body, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    const [emp] = await tx.select().from(employees).where(and(
      eq(employees.id, body.employeeId), eq(employees.orgId, principal.orgId),
    ));
    if (!emp) throw new HttpError(404, "Employee not found");

    const [row] = await tx.insert(timesheets).values({
      orgId: principal.orgId,
      employeeId: body.employeeId,
      period: body.period,
      daysWorked: body.daysWorked,
      normalHours: body.normalHours,
      overtimeHours: body.overtimeHours,
      holidayHours: body.holidayHours,
    }).onConflictDoUpdate({
      target: [timesheets.orgId, timesheets.employeeId, timesheets.period],
      set: {
        daysWorked: body.daysWorked,
        normalHours: body.normalHours,
        overtimeHours: body.overtimeHours,
        holidayHours: body.holidayHours,
        /* Any edit voids a previous approval — the approved numbers are gone. */
        approvedBy: null,
        approvedAt: null,
      },
    }).returning();

    await writeAudit(tx, {
      orgId: principal.orgId, action: "TIMESHEET_SAVED", entity: "timesheets", entityId: row.id,
      detail: `${emp.firstName} ${emp.lastName} ${body.period}: ${body.daysWorked}d, OT ${body.overtimeHours}h, holiday ${body.holidayHours}h`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    });
    return NextResponse.json(row, { status: 201 });
  }),
);

const approveSchema = z.object({ id: z.number().int().positive() });

/**
 * Approval is what feeds payroll: calculateRun only consumes APPROVED
 * timesheets, so unapproved overtime can never silently reach a payslip.
 */
export const PATCH = route({ permission: "payroll:calculate", schema: approveSchema }, async ({ principal, body, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    const [ts] = await tx.select().from(timesheets).where(and(
      eq(timesheets.id, body.id), eq(timesheets.orgId, principal.orgId),
    )).for("update");
    if (!ts) throw new HttpError(404, "Timesheet not found");
    if (ts.approvedAt) throw new HttpError(409, "Already approved");

    /* You cannot approve your own overtime. */
    if (ts.employeeId === principal.employeeId) {
      throw new HttpError(403, "You cannot approve your own timesheet");
    }

    const [row] = await tx.update(timesheets)
      .set({ approvedBy: principal.userId, approvedAt: new Date() })
      .where(eq(timesheets.id, body.id)).returning();

    await writeAudit(tx, {
      orgId: principal.orgId, action: "TIMESHEET_APPROVED", entity: "timesheets", entityId: row.id,
      detail: `Timesheet #${row.id} (${row.period}) approved: OT ${row.overtimeHours}h, holiday ${row.holidayHours}h`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    });
    return NextResponse.json(row);
  }),
);
