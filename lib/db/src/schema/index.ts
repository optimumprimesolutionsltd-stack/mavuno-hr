import {
  pgTable, serial, text, integer, bigint, timestamp, date, jsonb, boolean,
  uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

/* All amounts are BIGINT in MINOR UNITS (cents). KES 1,234.56 -> 123456 */
const money = (name: string) => bigint(name, { mode: "number" });

/* ============================ TENANCY ============================ */
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  countryCode: text("country_code").notNull().default("KE"),
  currencyCode: text("currency_code").notNull().default("KES"),
  kraPin: text("kra_pin"),
  nssfEmployerNo: text("nssf_employer_no"),
  shifEmployerNo: text("shif_employer_no"),
  plan: text("plan").notNull().default("trial"),
  seatLimit: integer("seat_limit").notNull().default(20),
  monthlyCharge: money("monthly_charge").notNull().default(0),
  status: text("status").notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("orgs_slug_uq").on(t.slug)]);

export const ROLES = ["employee","manager","hr","payroll_officer","approver","admin"] as const;
export type Role = (typeof ROLES)[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"),
  employeeId: integer("employee_id"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_org_email_uq").on(t.orgId, t.email),
  index("users_org_idx").on(t.orgId),
]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  ip: text("ip"),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const statutoryConfigs = pgTable("statutory_configs", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  name: text("name").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  config: jsonb("config").notNull(),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("statcfg_country_from_idx").on(t.countryCode, t.effectiveFrom)]);

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  costCenter: text("cost_center"),
  managerId: integer("manager_id"),
}, (t) => [
  uniqueIndex("depts_org_code_uq").on(t.orgId, t.code),
  index("depts_org_idx").on(t.orgId),
]);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  empNo: text("emp_no").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  gender: text("gender").notNull().default("male"),
  nationalId: text("national_id"),
  kraPin: text("kra_pin"),
  nssfNo: text("nssf_no"),
  shifNo: text("shif_no"),
  payMethod: text("pay_method").notNull().default("bank"),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  bankBranchCode: text("bank_branch_code"),
  bankBranchName: text("bank_branch_name"),
  bankAccount: text("bank_account"),
  mpesaPhone: text("mpesa_phone"),
  departmentId: integer("department_id").references(() => departments.id),
  position: text("position").notNull(),
  employmentType: text("employment_type").notNull().default("permanent"),
  residentStatus: text("resident_status").notNull().default("resident"),
  disabilityExemption: boolean("disability_exemption").notNull().default(false),
  basicSalary: money("basic_salary").notNull(),
  houseAllowance: money("house_allowance").notNull().default(0),
  transportAllowance: money("transport_allowance").notNull().default(0),
  otherAllowance: money("other_allowance").notNull().default(0),
  nonCashBenefit: money("non_cash_benefit").notNull().default(0),
  insurancePremium: money("insurance_premium").notNull().default(0),
  pensionEmployee: money("pension_employee").notNull().default(0),
  pensionEmployer: money("pension_employer").notNull().default(0),
  mortgageInterest: money("mortgage_interest").notNull().default(0),
  helbMonthly: money("helb_monthly").notNull().default(0),
  saccoMonthly: money("sacco_monthly").notNull().default(0),
  workDaysPerWeek: integer("work_days_per_week").notNull().default(5),
  worksOnHolidays: boolean("works_on_holidays").notNull().default(false),
  dateOfBirth: date("date_of_birth"),
  region: text("region"),
  educationLevel: text("education_level"),
  nokName: text("nok_name"),
  nokRelationship: text("nok_relationship"),
  nokPhone: text("nok_phone"),
  nokEmail: text("nok_email"),
  hireDate: date("hire_date").notNull(),
  terminationDate: date("termination_date"),
  status: text("status").notNull().default("active"),
  leaveBalance: integer("leave_balance").notNull().default(210),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("emp_org_empno_uq").on(t.orgId, t.empNo),
  index("emp_org_idx").on(t.orgId),
  index("emp_org_status_idx").on(t.orgId, t.status),
]);

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  daysWorked: integer("days_worked").notNull().default(0),
  normalHours: integer("normal_hours").notNull().default(0),
  overtimeHours: integer("overtime_hours").notNull().default(0),
  holidayHours: integer("holiday_hours").notNull().default(0),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
}, (t) => [uniqueIndex("ts_org_emp_period_uq").on(t.orgId, t.employeeId, t.period)]);

export const payAdjustments = pgTable("pay_adjustments", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  kind: text("kind").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  amount: money("amount").notNull(),
  taxable: boolean("taxable").notNull().default(true),
  consumedByRunId: integer("consumed_by_run_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("adj_org_period_idx").on(t.orgId, t.period)]);

export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  name: text("name").notNull(),
  runType: text("run_type").notNull().default("regular"),
  status: text("status").notNull().default("draft"),
  statutoryConfigId: integer("statutory_config_id").notNull().references(() => statutoryConfigs.id),
  statutorySnapshot: jsonb("statutory_snapshot").notNull(),
  employeeCount: integer("employee_count").notNull().default(0),
  grossTotal: money("gross_total").notNull().default(0),
  netTotal: money("net_total").notNull().default(0),
  payeTotal: money("paye_total").notNull().default(0),
  nssfEmployeeTotal: money("nssf_employee_total").notNull().default(0),
  nssfEmployerTotal: money("nssf_employer_total").notNull().default(0),
  shifTotal: money("shif_total").notNull().default(0),
  housingLevyEmployeeTotal: money("housing_levy_employee_total").notNull().default(0),
  housingLevyEmployerTotal: money("housing_levy_employer_total").notNull().default(0),
  employerCostTotal: money("employer_cost_total").notNull().default(0),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  submittedByUserId: integer("submitted_by_user_id").references(() => users.id),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  paidByUserId: integer("paid_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  reversedAt: timestamp("reversed_at"),
}, (t) => [
  index("runs_org_period_idx").on(t.orgId, t.period),
  index("runs_org_status_idx").on(t.orgId, t.status),
]);

export const payslips = pgTable("payslips", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  runId: integer("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  basic: money("basic").notNull(),
  allowances: money("allowances").notNull(),
  overtime: money("overtime").notNull().default(0),
  adjustmentEarnings: money("adjustment_earnings").notNull().default(0),
  nonCashBenefit: money("non_cash_benefit").notNull().default(0),
  gross: money("gross").notNull(),
  cashGross: money("cash_gross").notNull(),
  nssfEmployee: money("nssf_employee").notNull(),
  nssfEmployer: money("nssf_employer").notNull(),
  shif: money("shif").notNull(),
  housingLevyEmployee: money("housing_levy_employee").notNull(),
  housingLevyEmployer: money("housing_levy_employer").notNull(),
  pension: money("pension").notNull(),
  pensionEmployer: money("pension_employer").notNull().default(0),
  mortgageInterest: money("mortgage_interest").notNull().default(0),
  taxableIncome: money("taxable_income").notNull(),
  payeBeforeRelief: money("paye_before_relief").notNull(),
  personalRelief: money("personal_relief").notNull(),
  insuranceRelief: money("insurance_relief").notNull(),
  paye: money("paye").notNull(),
  helb: money("helb").notNull(),
  sacco: money("sacco").notNull().default(0),
  loanDeduction: money("loan_deduction").notNull(),
  adjustmentDeductions: money("adjustment_deductions").notNull().default(0),
  totalDeductions: money("total_deductions").notNull(),
  netPay: money("net_pay").notNull(),
  employerCost: money("employer_cost").notNull(),
  daysInPeriod: integer("days_in_period").notNull().default(30),
  daysPayable: integer("days_payable").notNull().default(30),
  breakdown: jsonb("breakdown"),
}, (t) => [
  uniqueIndex("slip_run_emp_uq").on(t.runId, t.employeeId),
  index("slip_org_emp_idx").on(t.orgId, t.employeeId),
]);

export const payoutBatches = pgTable("payout_batches", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  runId: integer("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  format: text("format").notNull(),
  itemCount: integer("item_count").notNull(),
  totalAmount: money("total_amount").notNull(),
  checksum: text("checksum").notNull(),
  storageKey: text("storage_key"),
  status: text("status").notNull().default("generated"),
  generatedByUserId: integer("generated_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("payout_org_run_idx").on(t.orgId, t.runId)]);

export const statutoryFilings = pgTable("statutory_filings", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  runId: integer("run_id").references(() => payrollRuns.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  period: text("period").notNull(),
  itemCount: integer("item_count").notNull().default(0),
  totalAmount: money("total_amount").notNull().default(0),
  checksum: text("checksum"),
  storageKey: text("storage_key"),
  status: text("status").notNull().default("generated"),
  filedAt: timestamp("filed_at"),
  confirmedByUserId: integer("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  confirmedByEmail: text("confirmed_by_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("filing_org_period_idx").on(t.orgId, t.period)]);

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("leave_org_emp_idx").on(t.orgId, t.employeeId)]);

export const leaveDocuments = pgTable("leave_documents", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  leaveRequestId: integer("leave_request_id").notNull().references(() => leaveRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  checksum: text("checksum").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
}, (t) => [index("ldoc_org_req_idx").on(t.orgId, t.leaveRequestId)]);

export const loanRequests = pgTable("loan_requests", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amount: money("amount").notNull(),
  months: integer("months").notNull().default(12),
  reason: text("reason"),
  interestRateBps: integer("interest_rate_bps").notNull().default(0),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  loanId: integer("loan_id"),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
}, (t) => [index("loanreq_org_idx").on(t.orgId)]);

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  principal: money("principal").notNull(),
  balance: money("balance").notNull(),
  monthlyInstallment: money("monthly_installment").notNull(),
  interestRateBps: integer("interest_rate_bps").notNull().default(0),
  status: text("status").notNull().default("active"),
  startDate: date("start_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("loans_org_emp_idx").on(t.orgId, t.employeeId)]);

export const loanRepayments = pgTable("loan_repayments", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  loanId: integer("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
  runId: integer("run_id").references(() => payrollRuns.id, { onDelete: "set null" }),
  amount: money("amount").notNull(),
  balanceAfter: money("balance_after").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("repay_loan_run_uq").on(t.loanId, t.runId)]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: text("detail"),
  actorUserId: integer("actor_user_id").references(() => users.id),
  actorEmail: text("actor_email").notNull(),
  actorIp: text("actor_ip"),
  before: jsonb("before"),
  after: jsonb("after"),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("audit_org_seq_uq").on(t.orgId, t.seq),
  index("audit_org_created_idx").on(t.orgId, t.createdAt),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  endpoint: text("endpoint").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.key] })]);

export const billingPayments = pgTable("billing_payments", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  receiptNo: text("receipt_no").notNull(),
  amount: money("amount").notNull(),
  period: text("period").notNull(),              // e.g. "July 2026" or "Annual 2026"
  method: text("method").notNull().default("bank_transfer"), // mpesa | bank_transfer | cash | cheque | other
  reference: text("reference"),                  // M-Pesa code / bank ref etc.
  description: text("description"),
  status: text("status").notNull().default("pending"), // pending | verified | failed
  verifiedByUserId: integer("verified_by_user_id").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  receiptSentAt: timestamp("receipt_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("billing_org_idx").on(t.orgId),
  uniqueIndex("billing_receipt_no_uq").on(t.receiptNo),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("prt_token_uq").on(t.token),
  index("prt_user_idx").on(t.userId),
]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_user_idx").on(t.userId, t.readAt),
]);
