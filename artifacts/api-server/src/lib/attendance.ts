import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { attendanceDays, timesheets, leaveRequests, organizations, employees } from "@workspace/db/schema";
import { HttpError } from "./http-error.js";
import { kenyaHolidays } from "./leave-days.js";

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

/** Public holidays (YYYY-MM-DD) falling inside the period. */
export function holidaysInPeriod(period: string): string[] {
  const year = Number(period.slice(0, 4));
  return Array.from(kenyaHolidays(year)).filter((d) => d.startsWith(period)).sort();
}

/** Every date from..to inclusive, as YYYY-MM-DD (UTC, so no timezone drift). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/**
 * Record the same status for many employees over a date range. Days that
 * are not working days for that employee (Sundays, Saturdays for a 5-day
 * week, public holidays) and days the employee is on approved leave are
 * skipped, so "mark everyone present for the week" never overwrites a
 * holiday or someone's leave. Days already recorded are left alone unless
 * overwrite is set.
 */
export async function bulkFill(orgId: number, o: {
  employeeIds: number[]; from: string; to: string;
  status: string; hours: number; overtimeHours: number; overwrite: boolean;
}) {
  const dates = datesBetween(o.from, o.to);
  if (dates.length > 62) throw new HttpError(422, "Choose a range of at most two months");
  const staff = await db.select({ id: employees.id, wd: employees.workDaysPerWeek })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), inArray(employees.id, o.employeeIds)));
  if (!staff.length) return { written: 0, skipped: 0 };

  const holidays = new Set<string>();
  for (const y of new Set(dates.map((d) => d.slice(0, 4)))) kenyaHolidays(Number(y)).forEach((h) => holidays.add(h));

  const leave = await db.select({
    employeeId: leaveRequests.employeeId, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate,
  }).from(leaveRequests).where(and(
    eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "approved"),
    inArray(leaveRequests.employeeId, staff.map((s) => s.id)),
    lte(leaveRequests.startDate, o.to), gte(leaveRequests.endDate, o.from),
  ));

  const ot = (await overtimeEnabled(orgId)) ? o.overtimeHours : 0;
  const worked = o.status === "present" || o.status === "half";
  const rows: (typeof attendanceDays.$inferInsert)[] = [];
  let skipped = 0;
  for (const s of staff) {
    for (const d of dates) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      const nonWorking = dow === 0 || (dow === 6 && s.wd === 5) || holidays.has(d);
      const onLeave = leave.some((l) => l.employeeId === s.id && l.startDate <= d && l.endDate >= d);
      // Marking a day "off" is allowed on non-working days; work statuses are not.
      if ((nonWorking && o.status !== "off") || onLeave) { skipped++; continue; }
      rows.push({
        orgId, employeeId: s.id, date: d, status: o.status,
        hours: worked ? o.hours : 0, overtimeHours: worked ? ot : 0, note: null,
      });
    }
  }
  if (rows.length) {
    const q = db.insert(attendanceDays).values(rows);
    if (o.overwrite) {
      await q.onConflictDoUpdate({
        target: [attendanceDays.orgId, attendanceDays.employeeId, attendanceDays.date],
        set: {
          status: sql`excluded.status`, hours: sql`excluded.hours`,
          overtimeHours: sql`excluded.overtime_hours`, updatedAt: new Date(),
        },
      });
    } else {
      await q.onConflictDoNothing();
    }
  }
  return { written: rows.length, skipped };
}
