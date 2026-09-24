import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { attendanceDays, timesheets, leaveRequests, organizations } from "@workspace/db/schema";
import { HttpError } from "./http-error.js";

export const STATUSES = ["present", "absent", "half", "off"] as const;

export function periodBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${period}-01`, last: `${period}-${String(last).padStart(2, "0")}` };
}

/** Approved leave overlapping the period, for the calendar overlay. */
export async function leaveInPeriod(orgId: number, period: string, employeeId?: number) {
  const { first, last } = periodBounds(period);
  const rows = await db.select({
    employeeId: leaveRequests.employeeId, type: leaveRequests.type,
    startDate: leaveRequests.startDate, endDate: leaveRequests.endDate,
  }).from(leaveRequests).where(and(
    eq(leaveRequests.orgId, orgId),
    eq(leaveRequests.status, "approved"),
    lte(leaveRequests.startDate, last),
    gte(leaveRequests.endDate, first),
    ...(employeeId ? [eq(leaveRequests.employeeId, employeeId)] : []),
  ));
  return rows;
}

export async function overtimeEnabled(orgId: number): Promise<boolean> {
  const [org] = await db.select({ ot: organizations.overtimeEnabled }).from(organizations).where(eq(organizations.id, orgId));
  return org?.ot ?? true;
}

export async function upsertDay(orgId: number, e: {
  employeeId: number; date: string; status: string; hours: number; overtimeHours: number; note?: string | null;
}) {
  const ot = (await overtimeEnabled(orgId)) ? e.overtimeHours : 0;
  await db.insert(attendanceDays).values({
    orgId, employeeId: e.employeeId, date: e.date, status: e.status,
    hours: e.status === "absent" || e.status === "off" ? 0 : e.hours,
    overtimeHours: e.status === "absent" || e.status === "off" ? 0 : ot,
    note: e.note ?? null,
  }).onConflictDoUpdate({
    target: [attendanceDays.orgId, attendanceDays.employeeId, attendanceDays.date],
    set: {
      status: e.status,
      hours: e.status === "absent" || e.status === "off" ? 0 : e.hours,
      overtimeHours: e.status === "absent" || e.status === "off" ? 0 : ot,
      note: e.note ?? null, updatedAt: new Date(),
    },
  });
}

export async function clearDay(orgId: number, employeeId: number, date: string) {
  await db.delete(attendanceDays).where(and(
    eq(attendanceDays.orgId, orgId), eq(attendanceDays.employeeId, employeeId), eq(attendanceDays.date, date),
  ));
}

/**
 * Roll a month of daily entries up into the monthly timesheet. Days worked
 * counts present and half days; hours and overtime are summed. Holiday hours
 * are not tracked daily so an existing figure is kept. The sheet goes back to
 * pending so the new totals are approved. Refuses an approved timesheet
 * unless \`force\` (HR) is set.
 */
export async function syncTimesheet(orgId: number, employeeId: number, period: string, force: boolean) {
  const { first, last } = periodBounds(period);
  const [agg] = await db.select({
    days: sql<number>`COUNT(*) FILTER (WHERE ${attendanceDays.status} IN ('present','half'))`,
    hours: sql<number>`COALESCE(SUM(${attendanceDays.hours}), 0)`,
    ot: sql<number>`COALESCE(SUM(${attendanceDays.overtimeHours}), 0)`,
    n: sql<number>`COUNT(*)`,
  }).from(attendanceDays).where(and(
    eq(attendanceDays.orgId, orgId), eq(attendanceDays.employeeId, employeeId),
    gte(attendanceDays.date, first), lte(attendanceDays.date, last),
  ));
  if (!Number(agg?.n)) throw new HttpError(422, "No attendance recorded for this month yet");

  const [existing] = await db.select().from(timesheets).where(and(
    eq(timesheets.orgId, orgId), eq(timesheets.employeeId, employeeId), eq(timesheets.period, period),
  ));
  if (existing?.approvedAt && !force) {
    throw new HttpError(409, "This timesheet has already been approved. Please contact HR to make changes.");
  }
  const values = {
    daysWorked: Number(agg.days), normalHours: Number(agg.hours), overtimeHours: Number(agg.ot),
  };
  if (existing) {
    const [row] = await db.update(timesheets).set({
      ...values, approvedAt: null, approvedBy: null, rejectedAt: null, rejectionNote: null,
    }).where(and(eq(timesheets.id, existing.id), eq(timesheets.orgId, orgId))).returning();
    return row;
  }
  const [row] = await db.insert(timesheets).values({ orgId, employeeId, period, holidayHours: 0, ...values }).returning();
  return row;
}
