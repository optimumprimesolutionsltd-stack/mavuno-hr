import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { timesheets } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { period as periodSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/audit";

export const GET = route({ permission: "self:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");
    const rows = await tx.select().from(timesheets)
      .where(and(eq(timesheets.orgId, principal.orgId), eq(timesheets.employeeId, principal.employeeId)))
      .orderBy(desc(timesheets.period))
      .limit(12);
    return NextResponse.json(rows);
  }),
);

const selfSchema = z.object({
  period: periodSchema,
  daysWorked: z.number().int().min(0).max(31).default(0),
  overtimeHours: z.number().int().min(0).max(200).default(0),
  holidayHours: z.number().int().min(0).max(100).default(0),
});

/**
 * Employee submits their own hours for approval (the Wingubox self-service
 * flow). Submitting again before approval overwrites; after approval it is
 * locked — the approved numbers are what payroll already consumed or will
 * consume, and changing them must go through HR.
 */
export const POST = route({ permission: "self:request", schema: selfSchema }, async ({ principal, body, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const [existing] = await tx.select().from(timesheets).where(and(
      eq(timesheets.orgId, principal.orgId),
      eq(timesheets.employeeId, principal.employeeId),
      eq(timesheets.period, body.period),
    ));
    if (existing?.approvedAt) {
      throw new HttpError(409, "This period's timesheet has been approved and can no longer be edited. Contact HR.");
    }

    const [row] = await tx.insert(timesheets).values({
      orgId: principal.orgId,
      employeeId: principal.employeeId,
      period: body.period,
      daysWorked: body.daysWorked,
      normalHours: 0,
      overtimeHours: body.overtimeHours,
      holidayHours: body.holidayHours,
    }).onConflictDoUpdate({
      target: [timesheets.orgId, timesheets.employeeId, timesheets.period],
      set: {
        daysWorked: body.daysWorked,
        overtimeHours: body.overtimeHours,
        holidayHours: body.holidayHours,
      },
    }).returning();

    await writeAudit(tx, {
      orgId: principal.orgId, action: "TIMESHEET_SUBMITTED", entity: "timesheets", entityId: row.id,
      detail: `Self-service submission for ${body.period}: OT ${body.overtimeHours}h, holiday ${body.holidayHours}h — pending approval`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    });
    return NextResponse.json(row, { status: 201 });
  }),
);
