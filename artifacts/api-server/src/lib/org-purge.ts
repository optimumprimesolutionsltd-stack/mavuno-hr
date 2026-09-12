/**
 * Deletes organisations whose grace period has run out.
 *
 * The privacy policy promises a right to erasure and, until this existed, the
 * only way to honour it was somebody running SQL by hand. This makes it a
 * scheduled request the customer controls and can reverse.
 *
 * HOW THE DELETE ACTUALLY WORKS
 * Every one of the 24 foreign keys pointing at organizations(id) is declared
 * ON DELETE CASCADE, so removing the organisation row removes employees,
 * payroll runs, payslips, filings, loans, leave, audit logs, billing records,
 * users and their sessions with it. That is deliberate here rather than a list
 * of DELETEs in dependency order: a hand-maintained list acquires a gap the
 * first time a table is added, and the gap is silent — orphaned rows nobody
 * looks for. The database already knows the graph.
 *
 * The one thing NOT removed is the country-level statutory configuration.
 * statutory_configs.org_id is nullable and null for the shared packs, so the
 * cascade only takes an organisation's own overrides.
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
import { logger } from "./logger.js";

/**
 * How long a customer has to change their mind.
 *
 * Deliberately generous. Payroll data is not recreatable — an employer who
 * deletes it and then needs a P9 for a former employee has no second copy, and
 * Kenyan tax law expects them to be able to produce records for years. Thirty
 * days is long enough to notice the mistake and long enough to export.
 */
export const DELETION_GRACE_DAYS = 30;

/** Refuse to act if more than this many fall due at once. See the check below. */
const MAX_PURGES_PER_RUN = 5;

export function deletionDateFrom(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/** Delete every organisation whose scheduled date has passed. */
export async function purgeDueOrganizations(): Promise<number> {
  const due = await db
    .select({ id: organizations.id, name: organizations.name, at: organizations.deletionScheduledFor })
    .from(organizations)
    .where(
      and(
        isNotNull(organizations.deletionScheduledFor),
        lte(organizations.deletionScheduledFor, new Date()),
      ),
    );

  if (due.length === 0) return 0;

  // Circuit breaker. Nothing about normal operation produces a batch this size:
  // organisations opt in one at a time and each waits out its own grace period.
  // A large batch means the WHERE clause is wrong — a dropped predicate, a
  // column defaulting to something it should not — and the correct response to
  // that is to delete nothing and shout, not to proceed efficiently. The rows
  // stay scheduled, so a genuine backlog can be released by raising this after
  // someone has looked.
  if (due.length > MAX_PURGES_PER_RUN) {
    logger.error(
      { count: due.length, limit: MAX_PURGES_PER_RUN, orgIds: due.map((o: { id: number }) => o.id) },
      "org-purge: refusing to run — more organisations are due than should ever be, check the query before releasing this",
    );
    return 0;
  }

  let purged = 0;
  for (const org of due) {
    try {
      // Logged BEFORE the delete: the organisation's own audit log is inside the
      // cascade, so the only durable record of this happening is the service log.
      logger.warn(
        { orgId: org.id, name: org.name, scheduledFor: org.at },
        "org-purge: deleting organisation and all associated data",
      );
      await db.delete(organizations).where(eq(organizations.id, org.id));
      purged += 1;
      logger.warn({ orgId: org.id }, "org-purge: deleted");
    } catch (err) {
      // One bad row must not stop the rest. A failure here leaves the
      // organisation scheduled, so the next run tries again rather than
      // silently forgetting it.
      logger.error({ err, orgId: org.id }, "org-purge: delete failed, will retry next run");
    }
  }
  return purged;
}

/** Run once at startup, then hourly. Mirrors the other background workers. */
export function scheduleOrgPurge(): void {
  purgeDueOrganizations().catch((err) =>
    logger.error({ err }, "org-purge: initial run failed (non-fatal)"),
  );
  setInterval(
    () => {
      purgeDueOrganizations().catch((err) =>
        logger.error({ err }, "org-purge: hourly run failed (non-fatal)"),
      );
    },
    60 * 60 * 1000,
  );
}
