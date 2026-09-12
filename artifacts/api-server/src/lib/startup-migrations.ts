/**
 * Idempotent startup migrations — run once at process start.
 * Each migration checks its own precondition so it is safe to run repeatedly.
 */
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, organizations, statutoryConfigs } from "@workspace/db/schema";
import { hashPassword } from "./password.js";
import { logger } from "./logger.js";
import { ALL_PACKS } from "./statutory-packs.js";

/**
 * Create the entire base schema if it is not already there.
 *
 * The schema is normally applied with `drizzle-kit push`, run by hand. On this
 * database it never was, so every table was missing and every login 500ed.
 * This mirrors `lib/db/src/schema/index.ts` as idempotent DDL so the app
 * bootstraps its own database on first boot and can never come up schemaless
 * again. Tables are ordered by foreign-key dependency. Statements run one at a
 * time — node-postgres uses the extended protocol, which rejects multi-command
 * strings. Additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` steps below stay
 * as-is for databases created before those columns existed.
 */
async function createBaseSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'KE',
      currency_code TEXT NOT NULL DEFAULT 'KES',
      kra_pin TEXT,
      nssf_employer_no TEXT,
      shif_employer_no TEXT,
      plan TEXT NOT NULL DEFAULT 'trial',
      seat_limit INTEGER NOT NULL DEFAULT 20,
      monthly_charge BIGINT NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      status TEXT NOT NULL DEFAULT 'active',
      requires_payroll_approval BOOLEAN NOT NULL DEFAULT FALSE,
      payroll_start_period TEXT,
      auto_generate_payout_on_pay BOOLEAN NOT NULL DEFAULT FALSE,
      auto_email_payslips_on_pay BOOLEAN NOT NULL DEFAULT FALSE,
      trial_ends_at TIMESTAMP,
      access_until TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS orgs_slug_uq ON organizations(slug)`,

    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      employee_id INTEGER,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMP,
      last_login_at TIMESTAMP,
      disabled_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_org_email_uq ON users(org_id, email)`,
    `CREATE INDEX IF NOT EXISTS users_org_idx ON users(org_id)`,

    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_agent TEXT,
      ip TEXT,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,

    `CREATE TABLE IF NOT EXISTS statutory_configs (
      id SERIAL PRIMARY KEY,
      country_code TEXT NOT NULL,
      name TEXT NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE,
      config JSONB NOT NULL,
      org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS statcfg_country_from_idx ON statutory_configs(country_code, effective_from)`,

    `CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      cost_center TEXT,
      manager_id INTEGER
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS depts_org_code_uq ON departments(org_id, code)`,
    `CREATE INDEX IF NOT EXISTS depts_org_idx ON departments(org_id)`,

    `CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      emp_no TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      gender TEXT NOT NULL DEFAULT 'male',
      national_id TEXT,
      kra_pin TEXT,
      nssf_no TEXT,
      shif_no TEXT,
      pay_method TEXT NOT NULL DEFAULT 'bank',
      bank_name TEXT,
      bank_code TEXT,
      bank_branch_code TEXT,
      bank_branch_name TEXT,
      bank_account TEXT,
      mpesa_phone TEXT,
      department_id INTEGER REFERENCES departments(id),
      position TEXT NOT NULL,
      employment_type TEXT NOT NULL DEFAULT 'permanent',
      resident_status TEXT NOT NULL DEFAULT 'resident',
      salary_basis TEXT NOT NULL DEFAULT 'gross',
      disability_exemption BOOLEAN NOT NULL DEFAULT FALSE,
      basic_salary BIGINT NOT NULL,
      house_allowance BIGINT NOT NULL DEFAULT 0,
      transport_allowance BIGINT NOT NULL DEFAULT 0,
      other_allowance BIGINT NOT NULL DEFAULT 0,
      non_cash_benefit BIGINT NOT NULL DEFAULT 0,
      insurance_premium BIGINT NOT NULL DEFAULT 0,
      pension_employee BIGINT NOT NULL DEFAULT 0,
      pension_employer BIGINT NOT NULL DEFAULT 0,
      mortgage_interest BIGINT NOT NULL DEFAULT 0,
      helb_monthly BIGINT NOT NULL DEFAULT 0,
      sacco_monthly BIGINT NOT NULL DEFAULT 0,
      work_days_per_week INTEGER NOT NULL DEFAULT 5,
      works_on_holidays BOOLEAN NOT NULL DEFAULT FALSE,
      date_of_birth DATE,
      region TEXT,
      education_level TEXT,
      nok_name TEXT,
      nok_relationship TEXT,
      nok_phone TEXT,
      nok_email TEXT,
      hire_date DATE NOT NULL,
      termination_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      leave_balance INTEGER NOT NULL DEFAULT 210,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS emp_org_empno_uq ON employees(org_id, emp_no)`,
    `CREATE INDEX IF NOT EXISTS emp_org_idx ON employees(org_id)`,
    `CREATE INDEX IF NOT EXISTS emp_org_status_idx ON employees(org_id, status)`,

    `CREATE TABLE IF NOT EXISTS timesheets (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      days_worked INTEGER NOT NULL DEFAULT 0,
      normal_hours INTEGER NOT NULL DEFAULT 0,
      overtime_hours INTEGER NOT NULL DEFAULT 0,
      holiday_hours INTEGER NOT NULL DEFAULT 0,
      approved_by INTEGER,
      approved_at TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ts_org_emp_period_uq ON timesheets(org_id, employee_id, period)`,

    `CREATE TABLE IF NOT EXISTS pay_adjustments (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      amount BIGINT NOT NULL,
      taxable BOOLEAN NOT NULL DEFAULT TRUE,
      consumed_by_run_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS adj_org_period_idx ON pay_adjustments(org_id, period)`,

    `CREATE TABLE IF NOT EXISTS payroll_runs (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      name TEXT NOT NULL,
      run_type TEXT NOT NULL DEFAULT 'regular',
      status TEXT NOT NULL DEFAULT 'draft',
      statutory_config_id INTEGER NOT NULL REFERENCES statutory_configs(id),
      statutory_snapshot JSONB NOT NULL,
      employee_count INTEGER NOT NULL DEFAULT 0,
      gross_total BIGINT NOT NULL DEFAULT 0,
      net_total BIGINT NOT NULL DEFAULT 0,
      paye_total BIGINT NOT NULL DEFAULT 0,
      nssf_employee_total BIGINT NOT NULL DEFAULT 0,
      nssf_employer_total BIGINT NOT NULL DEFAULT 0,
      shif_total BIGINT NOT NULL DEFAULT 0,
      housing_levy_employee_total BIGINT NOT NULL DEFAULT 0,
      housing_levy_employer_total BIGINT NOT NULL DEFAULT 0,
      employer_cost_total BIGINT NOT NULL DEFAULT 0,
      created_by_user_id INTEGER REFERENCES users(id),
      submitted_by_user_id INTEGER REFERENCES users(id),
      approved_by_user_id INTEGER REFERENCES users(id),
      paid_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMP,
      approved_at TIMESTAMP,
      paid_at TIMESTAMP,
      reversed_at TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS runs_org_period_idx ON payroll_runs(org_id, period)`,
    `CREATE INDEX IF NOT EXISTS runs_org_status_idx ON payroll_runs(org_id, status)`,

    `CREATE TABLE IF NOT EXISTS payslips (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      basic BIGINT NOT NULL,
      allowances BIGINT NOT NULL,
      overtime BIGINT NOT NULL DEFAULT 0,
      adjustment_earnings BIGINT NOT NULL DEFAULT 0,
      non_cash_benefit BIGINT NOT NULL DEFAULT 0,
      gross BIGINT NOT NULL,
      cash_gross BIGINT NOT NULL,
      nssf_employee BIGINT NOT NULL,
      nssf_employer BIGINT NOT NULL,
      shif BIGINT NOT NULL,
      housing_levy_employee BIGINT NOT NULL,
      housing_levy_employer BIGINT NOT NULL,
      pension BIGINT NOT NULL,
      pension_employer BIGINT NOT NULL DEFAULT 0,
      mortgage_interest BIGINT NOT NULL DEFAULT 0,
      taxable_income BIGINT NOT NULL,
      paye_before_relief BIGINT NOT NULL,
      personal_relief BIGINT NOT NULL,
      insurance_relief BIGINT NOT NULL,
      paye BIGINT NOT NULL,
      helb BIGINT NOT NULL,
      sacco BIGINT NOT NULL DEFAULT 0,
      loan_deduction BIGINT NOT NULL,
      adjustment_deductions BIGINT NOT NULL DEFAULT 0,
      total_deductions BIGINT NOT NULL,
      net_pay BIGINT NOT NULL,
      employer_cost BIGINT NOT NULL,
      days_in_period INTEGER NOT NULL DEFAULT 30,
      days_payable INTEGER NOT NULL DEFAULT 30,
      breakdown JSONB
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS slip_run_emp_uq ON payslips(run_id, employee_id)`,
    `CREATE INDEX IF NOT EXISTS slip_org_emp_idx ON payslips(org_id, employee_id)`,

    `CREATE TABLE IF NOT EXISTS payout_batches (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      format TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      total_amount BIGINT NOT NULL,
      checksum TEXT NOT NULL,
      storage_key TEXT,
      status TEXT NOT NULL DEFAULT 'generated',
      generated_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS payout_org_run_idx ON payout_batches(org_id, run_id)`,

    `CREATE TABLE IF NOT EXISTS statutory_filings (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      period TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      total_amount BIGINT NOT NULL DEFAULT 0,
      checksum TEXT,
      storage_key TEXT,
      status TEXT NOT NULL DEFAULT 'generated',
      filed_at TIMESTAMP,
      confirmed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      confirmed_by_email TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS filing_org_period_idx ON statutory_filings(org_id, period)`,

    `CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_by_user_id INTEGER REFERENCES users(id),
      decided_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS leave_org_emp_idx ON leave_requests(org_id, employee_id)`,

    `CREATE TABLE IF NOT EXISTS leave_documents (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS ldoc_org_req_idx ON leave_documents(org_id, leave_request_id)`,

    `CREATE TABLE IF NOT EXISTS loan_requests (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount BIGINT NOT NULL,
      months INTEGER NOT NULL DEFAULT 12,
      reason TEXT,
      interest_rate_bps INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      review_note TEXT,
      loan_id INTEGER,
      decided_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS loanreq_org_idx ON loan_requests(org_id)`,

    `CREATE TABLE IF NOT EXISTS loans (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      principal BIGINT NOT NULL,
      balance BIGINT NOT NULL,
      monthly_installment BIGINT NOT NULL,
      interest_rate_bps INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      start_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS loans_org_emp_idx ON loans(org_id, employee_id)`,

    `CREATE TABLE IF NOT EXISTS loan_repayments (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      run_id INTEGER REFERENCES payroll_runs(id) ON DELETE SET NULL,
      amount BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS repay_loan_run_uq ON loan_repayments(loan_id, run_id)`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      actor_user_id INTEGER REFERENCES users(id),
      actor_email TEXT NOT NULL,
      actor_ip TEXT,
      before JSONB,
      after JSONB,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS audit_org_seq_uq ON audit_logs(org_id, seq)`,
    `CREATE INDEX IF NOT EXISTS audit_org_created_idx ON audit_logs(org_id, created_at)`,

    `CREATE TABLE IF NOT EXISTS idempotency_keys (
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (org_id, key)
    )`,

    `CREATE TABLE IF NOT EXISTS billing_payments (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      receipt_no TEXT NOT NULL,
      amount BIGINT NOT NULL,
      period TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'bank_transfer',
      reference TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      verified_by_user_id INTEGER REFERENCES users(id),
      verified_at TIMESTAMP,
      receipt_sent_at TIMESTAMP,
      checkout_request_id TEXT,
      merchant_request_id TEXT,
      mpesa_receipt_number TEXT,
      phone_number TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS billing_org_idx ON billing_payments(org_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS billing_receipt_no_uq ON billing_payments(receipt_no)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_request_uq ON billing_payments(checkout_request_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS billing_mpesa_receipt_uq ON billing_payments(mpesa_receipt_number)`,

    `CREATE TABLE IF NOT EXISTS billing_credits (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      amount_cents BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KES',
      kind TEXT NOT NULL,
      reason TEXT NOT NULL,
      period TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      applied_to_payment_id INTEGER REFERENCES billing_payments(id),
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      applied_at TIMESTAMP,
      voided_at TIMESTAMP,
      voided_by_user_id INTEGER REFERENCES users(id),
      note TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS billing_credits_org_status_idx ON billing_credits(org_id, status)`,

    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS prt_token_uq ON password_reset_tokens(token)`,
    `CREATE INDEX IF NOT EXISTS prt_user_idx ON password_reset_tokens(user_id)`,

    `CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at)`,
  ];

  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
}

/**
 * Seed the super-admin account when the database has no users at all.
 *
 * `createBaseSchema` builds an empty schema; without this, there is no account
 * to sign in with and `syncSuperAdminPassword` (which only updates an existing
 * row) is a no-op — so the product is locked out. Creates a host organisation
 * and the `optimumprimesolutionsltd@gmail.com` admin with the current
 * SUPER_ADMIN_PASSWORD. Runs only on a genuinely empty database; once any user
 * exists it does nothing.
 */
async function seedSuperAdmin(): Promise<void> {
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) return; // nothing to seed a password from

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users);
  if (n > 0) return; // database already has accounts — leave it alone

  const TARGET_EMAIL = "optimumprimesolutionsltd@gmail.com";
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    let [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "optimum-prime"))
      .limit(1);

    if (!org) {
      [org] = await tx
        .insert(organizations)
        .values({ name: "Optimum Prime Solutions", slug: "optimum-prime", status: "active" })
        .returning({ id: organizations.id });
    }

    await tx.insert(users).values({
      orgId: org.id,
      email: TARGET_EMAIL,
      name: "Optimum Prime",
      role: "admin",
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
    });
  });

  logger.info({ email: TARGET_EMAIL }, "startup-migration: seeded super-admin account on empty database");
}

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
 * startup. Changing the secret and restarting the server is enough to rotate
 * the password — no manual DB update required. A restart also clears any
 * failed-login lockout on the account, so the platform owner is never stuck
 * waiting out a lockout with no way in.
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
    .set({ passwordHash: hash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, user.id));

  logger.info({ email: TARGET_EMAIL }, "startup-migration: super-admin password synced and lockout cleared");
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

async function createBillingCreditsTable(): Promise<void> {
  // docs/design/super-admin-org-lifecycle.md §4 (Phase 3) — SLA / goodwill /
  // refund / correction / promo credits, consumed at payment-verification time.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_credits (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      amount_cents    BIGINT NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'KES',
      kind            TEXT NOT NULL,
      reason          TEXT NOT NULL,
      period          TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      applied_to_payment_id INTEGER REFERENCES billing_payments(id),
      created_by_user_id INTEGER REFERENCES users(id),
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      applied_at      TIMESTAMP,
      voided_at       TIMESTAMP,
      voided_by_user_id INTEGER REFERENCES users(id),
      note            TEXT
    );
    CREATE INDEX IF NOT EXISTS billing_credits_org_status_idx ON billing_credits(org_id, status);
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

async function addOrgPayrollStartPeriod(): Promise<void> {
  // Nullable, no backfill: null means "Mavuno has always been the system of
  // record". New self-registered orgs get the current month set by the
  // register handler; the super-admin / settings set it for migrations.
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payroll_start_period TEXT`);
}

async function addOrgAutoOnPayToggles(): Promise<void> {
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_generate_payout_on_pay BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_email_payslips_on_pay BOOLEAN NOT NULL DEFAULT FALSE`);
}

async function seedStatutoryConfigs(): Promise<void> {
  // The statutory packs (PAYE bands, NSSF tiers, SHIF, Housing Levy, …) live in
  // code but must be rows in statutory_configs for resolveConfig() to find them
  // — otherwise every payroll run 422s NO_STATUTORY_CONFIG. scripts/seed.ts
  // does this, but only when run by hand; Render never runs it. Idempotent:
  // one global row (org_id NULL) per (country, effective_from).
  for (const pack of ALL_PACKS) {
    const existing = await db.select({ id: statutoryConfigs.id }).from(statutoryConfigs).where(and(
      eq(statutoryConfigs.countryCode, pack.countryCode),
      eq(statutoryConfigs.effectiveFrom, pack.effectiveFrom),
      isNull(statutoryConfigs.orgId),
    ));
    if (existing.length) continue;
    await db.insert(statutoryConfigs).values({
      countryCode: pack.countryCode,
      name: pack.name,
      effectiveFrom: pack.effectiveFrom,
      config: pack as unknown as Record<string, unknown>,
      orgId: null,
    });
    logger.info({ pack: pack.name }, "startup-migration: seeded statutory pack");
  }
}

async function addOrgAccessUntil(): Promise<void> {
  // Nullable, no backfill: null means unlimited access — existing orgs are
  // unaffected until a super-admin (or a future payment) sets a date.
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_until TIMESTAMP`);

  // Scheduled account deletion. Nullable and additive: an organisation that has
  // never asked to be deleted reads as NULL on all three.
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMP`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_requested_by INTEGER`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS organizations_deletion_due_idx ON organizations(deletion_scheduled_for)`);
}

async function createMarketingCaptureTables(): Promise<void> {
  // Marketing capture. Standalone tables with no foreign keys: these rows are
  // prospects, and a prospect has no organisation yet by definition.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS demo_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      employee_count TEXT,
      message TEXT,
      page_path TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      page_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS demo_requests_created_idx ON demo_requests(created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS newsletter_created_idx ON newsletter_subscribers(created_at)`);
  // One row per address. A second signup updates the existing row rather than
  // stacking duplicates the CRM would then have to de-duplicate.
  //
  // A plain column index, not LOWER(email), even though addresses are
  // case-insensitive in practice. ON CONFLICT can only target an index Postgres
  // can match by name or expression, and Drizzle's onConflictDoUpdate takes
  // columns rather than expressions — so a functional index here would compile
  // and then fail at runtime with "no unique or exclusion constraint matching".
  // The normalisation happens at the write instead: every insert lowercases the
  // address first, which makes the column index exactly as effective.
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_key ON newsletter_subscribers(email)`);
}

async function addOrgRequiresPayrollApproval(): Promise<void> {
  // Mavuno's production DB is a fresh launch with no legacy orgs, so every org
  // — existing and future — gets the streamlined single-actor default. The
  // design's "migrate existing orgs to maker-checker" step does not apply here.
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS requires_payroll_approval BOOLEAN NOT NULL DEFAULT FALSE`);
  // #22 briefly backfilled orgs to TRUE before we knew this was from scratch.
  // Undo that for anything created in the launch window. TEMPORARY: the fixed
  // date self-disables this, and the frontend PR that adds the approval toggle
  // + onboarding question must delete this line.
  await db.execute(sql`UPDATE organizations SET requires_payroll_approval = FALSE WHERE created_at < TIMESTAMP '2026-10-01 00:00:00'`);
}

export async function runStartupMigrations(): Promise<void> {
  // Each step is isolated: one failing migration must not skip the rest, and
  // the log names which one broke and why. All are idempotent, so a failed
  // step simply retries on the next boot.
  const steps: [string, () => Promise<void>][] = [
    ["createBaseSchema", createBaseSchema],
    ["createSessionsTable", createSessionsTable],
    ["addOrgPayrollStartPeriod", addOrgPayrollStartPeriod],
    ["addOrgAutoOnPayToggles", addOrgAutoOnPayToggles],
    ["seedStatutoryConfigs", seedStatutoryConfigs],
    ["seedSuperAdmin", seedSuperAdmin],
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
    ["addOrgRequiresPayrollApproval", addOrgRequiresPayrollApproval],
    ["addOrgAccessUntil", addOrgAccessUntil],
    ["createBillingCreditsTable", createBillingCreditsTable],
    ["createMarketingCaptureTables", createMarketingCaptureTables],
  ];

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      logger.error({ err, migration: name }, "startup-migration: step failed (non-fatal)");
    }
  }
}
