/**
 * Idempotent startup migrations — run once at process start.
 * Each migration checks its own precondition so it is safe to run repeatedly.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { hashPassword } from "./password.js";
import { logger } from "./logger.js";

/** Migrate the seeded demo admin to the configured production credentials. */
async function migrateAdminCredentials(): Promise<void> {
  const SEED_EMAIL = "admin@zawadi.co.ke";
  const TARGET_EMAIL = "optimumprimesolutionsltd@gmail.com";
  const TARGET_PASSWORD = "OPTIMUMP2026";

  // Only run if the old seed admin still exists
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, SEED_EMAIL))
    .limit(1);

  if (rows.length === 0) return; // already migrated or different setup

  const hash = await hashPassword(TARGET_PASSWORD);
  await db
    .update(users)
    .set({ email: TARGET_EMAIL, passwordHash: hash, mustChangePassword: false })
    .where(eq(users.email, SEED_EMAIL));

  logger.info({ from: SEED_EMAIL, to: TARGET_EMAIL }, "startup-migration: admin credentials updated");
}

async function createPasswordResetTokensTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at    TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS prt_token_uq ON password_reset_tokens(token);
    CREATE INDEX IF NOT EXISTS prt_user_idx ON password_reset_tokens(user_id);
  `);
}

async function addEmployeeTerminationReason(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS termination_reason TEXT;
  `);
}

export async function runStartupMigrations(): Promise<void> {
  try {
    await migrateAdminCredentials();
    await createPasswordResetTokensTable();
    await addEmployeeTerminationReason();
  } catch (err) {
    logger.error({ err }, "startup-migration: failed (non-fatal)");
  }
}
