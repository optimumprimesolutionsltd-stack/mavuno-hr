import { z } from "zod";

/** Money arrives from clients as a decimal string; never as a float. */
export const moneyString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Must be a positive amount with at most 2 decimals");

export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be YYYY-MM");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** KRA PIN: A + 9 digits + letter, e.g. A012345678Z */
export const kraPin = z.string().regex(/^[A-Z]\d{9}[A-Z]$/, "Invalid KRA PIN format");
/** Kenyan mobile in E.164 */
export const msisdn = z.string().regex(/^254[17]\d{8}$/, "Phone must be 2547XXXXXXXX");

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  orgSlug: z.string().min(1).max(64).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(200),
});

/* Base shape without cross-field refinements — needed because Zod cannot
 * .partial() a refined schema. PATCH uses employeeBaseSchema.partial();
 * POST uses employeeSchema (base + refinements). */
export const employeeBaseSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  gender: z.enum(["male", "female", "other"]).default("male"),
  nationalId: z.string().max(20).optional(),
  kraPin: kraPin.optional(),
  nssfNo: z.string().max(30).optional(),
  shifNo: z.string().max(30).optional(),

  payMethod: z.enum(["bank", "mpesa", "cash"]).default("bank"),
  bankName: z.string().max(80).optional(),
  bankCode: z.string().max(10).optional(),
  bankBranchCode: z.string().max(10).optional(),
  bankAccount: z.string().max(34).optional(),
  mpesaPhone: msisdn.optional(),

  departmentId: z.number().int().positive().optional(),
  position: z.string().min(1).max(120),
  employmentType: z.enum(["permanent", "contract", "casual"]).default("permanent"),
  residentStatus: z.enum(["resident", "non_resident"]).default("resident"),
  disabilityExemption: z.boolean().default(false),

  basicSalary: moneyString,
  houseAllowance: moneyString.default("0"),
  transportAllowance: moneyString.default("0"),
  otherAllowance: moneyString.default("0"),
  nonCashBenefit: moneyString.default("0"),
  insurancePremium: moneyString.default("0"),
  pensionEmployee: moneyString.default("0"),
  pensionEmployer: moneyString.default("0"),
  mortgageInterest: moneyString.default("0"),
  helbMonthly: moneyString.default("0"),
  saccoMonthly: moneyString.default("0"),

  hireDate: isoDate,
});

/* Cross-field rules the DB cannot express. Catching these at the boundary is
 * what stops a payout file failing at the bank at 4pm on payday. */
export const employeeSchema = employeeBaseSchema
  .refine((e) => e.payMethod !== "bank" || (e.bankAccount && e.bankCode), {
    message: "Bank payment requires bankAccount and bankCode",
    path: ["bankAccount"],
  })
  .refine((e) => e.payMethod !== "mpesa" || !!e.mpesaPhone, {
    message: "M-Pesa payment requires mpesaPhone",
    path: ["mpesaPhone"],
  });

export const calculateRunSchema = z.object({
  period,
  runType: z.enum(["regular", "off_cycle", "bonus", "final"]).default("regular"),
  employeeIds: z.array(z.number().int().positive()).optional(), // off-cycle subset
  idempotencyKey: z.string().uuid().optional(),
});

export const runActionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pay", "reverse"]),
  note: z.string().max(500).optional(),
});

export const leaveSchema = z.object({
  employeeId: z.number().int().positive().optional(),
  type: z.enum(["annual","sick","maternity","paternity","compassionate","study","unpaid"]),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().max(500).optional(),
}).refine((l) => l.endDate >= l.startDate, {
  message: "End date must be on or after start date", path: ["endDate"],
});

export const loanRequestSchema = z.object({
  type: z.enum(["company", "sacco", "advance", "emergency"]),
  amount: moneyString,
  months: z.number().int().min(1).max(60),
  reason: z.string().max(500).optional(),
});

export const loanDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  interestRateBps: z.number().int().min(0).max(10_000).default(0),
  months: z.number().int().min(1).max(60).optional(),
  startDate: isoDate.optional(),
  reviewNote: z.string().max(500).optional(),
});

export const adjustmentSchema = z.object({
  employeeId: z.number().int().positive(),
  period,
  kind: z.enum(["earning", "deduction"]),
  /* COMMISSION / EXPENSE_CLAIM / DAMAGE cover the Wingubox self-service
   * categories: commissions are taxable earnings; approved expense claims are
   * NON-taxable reimbursements (set taxable:false); losses/damages are
   * deductions agreed with the employee under s.19 Employment Act. */
  code: z.enum(["BONUS", "BACKPAY", "13TH", "ADVANCE", "COMMISSION", "EXPENSE_CLAIM", "DAMAGE", "OTHER"]),
  label: z.string().min(1).max(120),
  amount: moneyString,
  taxable: z.boolean().default(true),
});

export const timesheetSchema = z.object({
  employeeId: z.number().int().positive(),
  period,
  daysWorked: z.number().int().min(0).max(31),
  normalHours: z.number().int().min(0).max(400),
  overtimeHours: z.number().int().min(0).max(200),
  holidayHours: z.number().int().min(0).max(100),
});

export const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["employee","manager","hr","payroll_officer","approver","admin"]),
  employeeId: z.number().int().positive().optional(),
});
