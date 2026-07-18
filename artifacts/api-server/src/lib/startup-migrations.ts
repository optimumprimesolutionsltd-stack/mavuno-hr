/**
 * Idempotent startup migrations — run once at process start.
 * Each migration checks its own precondition so it is safe to run repeatedly.
 */
import { eq } from "drizzle-orm";
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

export async function runStartupMigrations(): Promise<void> {
  try {
    await migrateAdminCredentials();
  } catch (err) {
    logger.error({ err }, "startup-migration: failed (non-fatal)");
  }
}
