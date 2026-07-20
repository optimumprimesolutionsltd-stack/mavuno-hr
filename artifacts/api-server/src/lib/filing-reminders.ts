/**
 * Monthly statutory filing reminders.
 * On the 7th of each month (or later, if the server starts after the 7th),
 * send a notification to every HR/payroll user in orgs that have a paid
 * payroll run for the current month — once per org per month.
 */
import { db } from "@workspace/db";
import { notifications, users, payrollRuns } from "@workspace/db/schema";
import { eq, and, gte, lt, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

const REMINDER_TYPE = "FILING_REMINDER";
const REMINDER_ROLES = ["admin", "hr", "payroll_officer"];

async function sendFilingReminders(): Promise<void> {
  const now = new Date();
  if (now.getDate() < 7) return; // too early in the month

  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const period = `${year}-${month}`;

  // Find orgs with at least one paid run this period
  const paidRuns = await db
    .select({ orgId: payrollRuns.orgId })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.period, period), eq(payrollRuns.status, "paid")));

  if (paidRuns.length === 0) return;

  const orgIds = [...new Set(paidRuns.map((r) => r.orgId))];

  // For each org, check if a reminder was already sent this month
  const monthStart = new Date(year, now.getMonth(), 1);
  const monthEnd   = new Date(year, now.getMonth() + 1, 1);

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
        body: `${period} — P10, NSSF, SHIF and AHL returns should be filed with the respective authorities by the 9th.`,
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
