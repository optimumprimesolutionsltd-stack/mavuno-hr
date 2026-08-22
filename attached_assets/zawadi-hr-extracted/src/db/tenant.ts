import { sql } from "drizzle-orm";
import { db, pool } from "./index";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * TENANT-SCOPED TRANSACTION.
 *
 * Defence in depth. Application code already filters by orgId, but application
 * code is written by humans, and one forgotten `.where(eq(t.orgId, ...))` in one
 * query leaks one customer's salaries to another. That is a company-ending bug.
 *
 * So we also set a per-transaction Postgres GUC (`app.org_id`), and every table
 * has a ROW LEVEL SECURITY policy that filters on it (see drizzle/0001_rls.sql).
 * The database itself then refuses to return another tenant's rows — even if the
 * query forgot to ask.
 *
 * Use this for EVERY request-scoped DB access. Never import `db` directly in a
 * route handler.
 */
export async function withTenant<T>(orgId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) = local to this transaction, so it can't leak across
    // pooled connections.
    await tx.execute(sql`SELECT set_config('app.org_id', ${String(orgId)}, true)`);
    return fn(tx);
  });
}

/** Escape hatch for genuinely cross-tenant work (login, billing cron). Rare. */
export async function withoutTenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.bypass_rls', 'on', true)`);
    return fn(tx);
  });
}

export { pool };
