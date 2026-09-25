import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
/** Kenyan public holidays and leave-day counting against an employee's work schedule. */
export function kenyaHolidays(year: number): Set<string> {
  const fixed = [
    `${year}-01-01`, // New Year's Day
    `${year}-05-01`, // Labour Day
    `${year}-06-01`, // Madaraka Day
    `${year}-10-20`, // Mashujaa Day
    `${year}-12-12`, // Jamhuri Day
    `${year}-12-25`, // Christmas Day
    `${year}-12-26`, // Boxing Day
  ];
  // Easter Good Friday + Easter Monday (pre-computed 2024-2030)
  const easter: Record<number, [string, string]> = {
    2024: ["2024-03-29", "2024-04-01"],
    2025: ["2025-04-18", "2025-04-21"],
    2026: ["2026-04-03", "2026-04-06"],
    2027: ["2027-03-26", "2027-03-29"],
    2028: ["2028-04-14", "2028-04-17"],
    2029: ["2029-03-30", "2029-04-02"],
    2030: ["2030-04-19", "2030-04-22"],
  };
  return new Set([...fixed, ...(easter[year] ?? [])]);
}

export function countLeaveDays(
  startDate: string, endDate: string,
  workDaysPerWeek: number, worksOnHolidays: boolean
): number {
  const s = new Date(startDate), e = new Date(endDate);
  let days = 0;
  const cur = new Date(s);
  // Pre-build holiday sets for the years spanned
  const holidaySets: Record<number, Set<string>> = {};
  while (cur <= e) {
    const yr = cur.getFullYear();
    const dow = cur.getDay();
    const dateStr = cur.toISOString().slice(0, 10);
    const isSunday = dow === 0;
    const isSaturday = dow === 6;
    if (!holidaySets[yr]) holidaySets[yr] = kenyaHolidays(yr);
    const isHoliday = holidaySets[yr].has(dateStr);

    // A day counts as leave only if it is a scheduled working day
    const isWorkDay =
      !isSunday &&
      !(workDaysPerWeek === 5 && isSaturday) &&
      (worksOnHolidays || !isHoliday);

    if (isWorkDay) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}


/**
 * The working days per week to count against: 6 for every employee when the
 * company has switched Saturday on as a working day, otherwise the employee's
 * own setting.
 */
export async function effectiveWorkDays(orgId: number, employeeWorkDays: number | null | undefined): Promise<number> {
  const [org] = await db.select({ sat: organizations.saturdayIsWorkday }).from(organizations).where(eq(organizations.id, orgId));
  return org?.sat ? 6 : (employeeWorkDays ?? 5);
}
