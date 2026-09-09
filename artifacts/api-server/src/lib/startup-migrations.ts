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
  const TARGET_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? "OPTIMUMP2026";

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

/**
 * Sync the super-admin password from the SUPER_ADMIN_PASSWORD secret on every
 * startup. This means changing the secret and restarting the server is enough
 * to rotate the password — no manual DB update required.
 */
async function syncSuperAdminPassword(): Promise<void> {
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) return; // secret not set — leave password as-is

  const TARGET_EMAIL = "optimumprimesolutionsltd@gmail.com";
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);

  if (!user) return; // account doesn't exist yet

  const hash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash: hash, mustChangePassword: false })
    .where(eq(users.id, user.id));

  logger.info({ email: TARGET_EMAIL }, "startup-migration: super-admin password synced from secret");
}

async function createSessionsTable(): Promise<void> {
  // The email/password, super-admin and Clerk-exchange login flows all INSERT
  // into this table via createSession(). It was in the schema but never made it
  // into the production database, so every login and every Bearer-token request
  // 500ed. Split into separate statements and no FK constraints — the join in
  // getPrincipal already enforces referential integrity at read time, and a
  // plain table is the least that can go wrong at CREATE. Idempotent.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      org_id      INTEGER NOT NULL,
      user_agent  TEXT,
      ip          TEXT,
      expires_at  TIMESTAMP NOT NULL,
      revoked_at  TIMESTAMP,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`);
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

async function addEmployeeWorkSchedule(): Promise<void> {
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_days_per_week INTEGER NOT NULL DEFAULT 5`);
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS works_on_holidays BOOLEAN NOT NULL DEFAULT FALSE`);
}

async function addLoanRequestInterestRate(): Promise<void> {
  await db.execute(sql`ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS interest_rate_bps INTEGER NOT NULL DEFAULT 0`);
}

async function addOrgMonthlyCharge(): Promise<void> {
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS monthly_charge BIGINT NOT NULL DEFAULT 0`);
}

async function addOrgBillingCycle(): Promise<void> {
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly'`);
}

async function createBillingPaymentsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_payments (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      receipt_no      TEXT NOT NULL,
      amount          BIGINT NOT NULL,
      period          TEXT NOT NULL,
      method          TEXT NOT NULL DEFAULT 'bank_transfer',
      reference       TEXT,
      description     TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      verified_by_user_id INTEGER REFERENCES users(id),
      verified_at     TIMESTAMP,
      receipt_sent_at TIMESTAMP,
      created_at      TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS billing_receipt_no_uq ON billing_payments(receipt_no);
    CREATE INDEX IF NOT EXISTS billing_org_idx ON billing_payments(org_id);
  `);
}

async function createNotificationsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      link       TEXT,
      read_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at);
  `);
}

async function addFilingConfirmedByColumns(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE statutory_filings
      ADD COLUMN IF NOT EXISTS confirmed_by_user_id INTEGER,
      ADD COLUMN IF NOT EXISTS confirmed_by_email    TEXT;
  `);
}

async function addEmployeeMiddleName(): Promise<void> {
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS middle_name TEXT`);
}

async function addEmployeePersonalDetails(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS date_of_birth DATE,
      ADD COLUMN IF NOT EXISTS region TEXT,
      ADD COLUMN IF NOT EXISTS education_level TEXT,
      ADD COLUMN IF NOT EXISTS nok_name TEXT,
      ADD COLUMN IF NOT EXISTS nok_relationship TEXT,
      ADD COLUMN IF NOT EXISTS nok_phone TEXT,
      ADD COLUMN IF NOT EXISTS nok_email TEXT;
  `);
}

async function addEmployeeBankBranchName(): Promise<void> {
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_branch_name TEXT`);
}

async function addEmployeeSalaryBasis(): Promise<void> {
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_basis TEXT NOT NULL DEFAULT 'gross'`);
}

export async function runStartupMigrations(): Promise<void> {
  // Each step is isolated: one failing migration must not skip the rest, and
  // the log names which one broke and why. All are idempotent, so a failed
  // step simply retries on the next boot.
  const steps: [string, () => Promise<void>][] = [
    ["createSessionsTable", createSessionsTable],
    ["migrateAdminCredentials", migrateAdminCredentials],
    ["syncSuperAdminPassword", syncSuperAdminPassword],
    ["createPasswordResetTokensTable", createPasswordResetTokensTable],
    ["addEmployeeTerminationReason", addEmployeeTerminationReason],
    ["addEmployeeWorkSchedule", addEmployeeWorkSchedule],
    ["addLoanRequestInterestRate", addLoanRequestInterestRate],
    ["addOrgMonthlyCharge", addOrgMonthlyCharge],
    ["addOrgBillingCycle", addOrgBillingCycle],
    ["createBillingPaymentsTable", createBillingPaymentsTable],
    ["createNotificationsTable", createNotificationsTable],
    ["addFilingConfirmedByColumns", addFilingConfirmedByColumns],
    ["addEmployeeMiddleName", addEmployeeMiddleName],
    ["addEmployeePersonalDetails", addEmployeePersonalDetails],
    ["addEmployeeBankBranchName", addEmployeeBankBranchName],
    ["addEmployeeSalaryBasis", addEmployeeSalaryBasis],
  ];

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      logger.error({ err, migration: name }, "startup-migration: step failed (non-fatal)");
    }
  }
}
