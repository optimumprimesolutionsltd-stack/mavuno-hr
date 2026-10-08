/**
 * Monthly statutory filing reminders.
 * On the 7th of each month (or later, if the server starts after the 7th),
 * send a notification to every HR/payroll user in orgs that have an approved
 * or paid payroll run for LAST month — the month whose returns are due by the
 * 9th — once per org per month. Returns are due whether or not salaries have
 * gone out yet.
 */
import { db } from "@workspace/db";
import { notifications, users, payrollRuns, organizations } from "@workspace/db/schema";
import { eq, ne, and, gte, lt, gt, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { filingPeriodFor, filingPeriodLabel } from "./filing-period.js";

const REMINDER_TYPE = "FILING_REMINDER";
const REMINDER_ROLES = ["admin", "hr", "payroll_officer"];

async function sendFilingReminders(): Promise<void> {
  const now = new Date();
  if (now.getDate() < 7) return; // too early in the month

  // Payroll periods are the month worked; this month's deadline is for last
  // month's payroll.
  const period = filingPeriodFor(now);
  const dueBy = new Date(now.getFullYear(), now.getMonth(), 9).toLocaleString("en-GB", { day: "numeric", month: "long" });

  // Find orgs with at least one approved or paid run for that period
  // (historical/migration runs are records only — never filed via Mavuno, so
  // they don't trigger reminders)
  const fileableRuns = await db
    .select({ orgId: payrollRuns.orgId })
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.period, period),
      inArray(payrollRuns.status, ["approved", "paid"]),
      ne(payrollRuns.runType, "historical"),
    ));

  if (fileableRuns.length === 0) return;

  let orgIds = [...new Set(fileableRuns.map((r) => r.orgId))];

  // Don't remind an org about filing a month that predates the month Mavuno
  // became its payroll system of record.
  const preCutover = await db
    .select({ orgId: organizations.id })
    .from(organizations)
    .where(and(inArray(organizations.id, orgIds), gt(organizations.payrollStartPeriod, period)));
  if (preCutover.length > 0) {
    const skip = new Set(preCutover.map((o) => o.orgId));
    orgIds = orgIds.filter((id) => !skip.has(id));
  }
  if (orgIds.length === 0) return;

  // For each org, check if a reminder was already sent this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  for (const orgId of orgIds) {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.type, REMINDER_TYPE),
          gte(notifications.createdAt, monthStart),
          lt(notifications.createdAt, monthEnd),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue; // already sent this month

    // Find HR/payroll users in this org
    const hrUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, orgId), inArray(users.role, REMINDER_ROLES)));

    if (hrUsers.length === 0) continue;

    // Insert one notification per HR user
    await db.insert(notifications).values(
      hrUsers.map((u) => ({
        orgId,
        userId: u.id,
        type: REMINDER_TYPE,
        title: "📋 Monthly statutory filing due",
        body: `${filingPeriodLabel(period)} payroll — the P10A, NSSF, SHIF and AHL returns are due by ${dueBy}. Download them from Reports and file each with its authority.`,
        link: null,
      })),
    );

    logger.info({ orgId, period, count: hrUsers.length }, "filing-reminder: sent");
  }
}

/** Schedule the reminder check: run once on startup, then every hour. */
export function scheduleFilingReminders(): void {
  sendFilingReminders().catch((err) =>
    logger.error({ err }, "filing-reminder: initial check failed (non-fatal)"),
  );
  setInterval(() => {
    sendFilingReminders().catch((err) =>
      logger.error({ err }, "filing-reminder: hourly check failed (non-fatal)"),
    );
  }, 60 * 60 * 1000);
}
