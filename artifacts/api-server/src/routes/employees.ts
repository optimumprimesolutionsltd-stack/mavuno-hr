import { Router } from "express";
import { z } from "zod";
import { eq, and, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { employees, users, payslips, payrollRuns, departments, leaveRequests } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";
import { toCents } from "../lib/money.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";
import { fullName } from "../lib/employee-name.js";

const router = Router();

const moneyString = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const employeeBaseSchema = z.object({
  firstName: z.string().min(1).max(80),
  middleName: z.string().max(80).optional(),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  gender: z.enum(["male","female","other"]).default("male"),
  nationalId: z.string().max(20).optional(),
  kraPin: z.string().max(15).optional(),
  nssfNo: z.string().max(30).optional(),
  shifNo: z.string().max(30).optional(),
  payMethod: z.enum(["bank","mpesa","cash"]).default("bank"),
  bankName: z.string().max(80).optional(),
  bankCode: z.string().max(10).optional(),
  bankBranchCode: z.string().max(10).optional(),
  bankBranchName: z.string().max(120).optional(),
  bankAccount: z.string().max(34).optional(),
  mpesaPhone: z.string().max(20).optional(),
  // The edit form sends null when an employee is not assigned to a department.
  // Keep this nullable for both create and partial-update payloads.
  departmentId: z.number().int().positive().nullable().optional(),
  position: z.string().min(1).max(120),
  employmentType: z.enum(["permanent","contract","casual"]).default("permanent"),
  residentStatus: z.enum(["resident","non_resident"]).default("resident"),
  salaryBasis: z.enum(["gross", "net"]).default("gross"),
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
  workDaysPerWeek: z.enum(["5", "6"]).default("5").transform(Number),
  worksOnHolidays: z.boolean().default(false),
  hireDate: isoDate,
  leaveBalance: z.number().int().min(0).max(3650).optional(),
  dateOfBirth: isoDate.optional(),
  region: z.string().max(100).optional(),
  educationLevel: z.enum(["none","primary","secondary","certificate","diploma","bachelor","master","phd","other"]).optional(),
  nokName: z.string().max(120).optional(),
  nokRelationship: z.string().max(80).optional(),
  nokPhone: z.string().max(20).optional(),
  nokEmail: z.string().email().max(255).optional(),
});

function toRow(body: z.infer<typeof employeeBaseSchema>) {
  return {
    firstName: body.firstName, middleName: body.middleName ?? null, lastName: body.lastName, email: body.email.toLowerCase(),
    phone: body.phone ?? null, gender: body.gender, nationalId: body.nationalId ?? null,
    kraPin: body.kraPin ?? null, nssfNo: body.nssfNo ?? null, shifNo: body.shifNo ?? null,
    payMethod: body.payMethod, bankName: body.bankName ?? null, bankCode: body.bankCode ?? null,
    bankBranchCode: body.bankBranchCode ?? null, bankBranchName: body.bankBranchName ?? null,
    bankAccount: body.bankAccount ?? null,
    mpesaPhone: body.mpesaPhone ?? null, departmentId: body.departmentId ?? null,
    position: body.position, employmentType: body.employmentType,
    residentStatus: body.residentStatus, disabilityExemption: body.disabilityExemption,
    salaryBasis: body.salaryBasis,
    workDaysPerWeek: body.workDaysPerWeek ?? 5,
    worksOnHolidays: body.worksOnHolidays ?? false,
    basicSalary: toCents(body.basicSalary),
    houseAllowance: toCents(body.houseAllowance ?? "0"),
    transportAllowance: toCents(body.transportAllowance ?? "0"),
    otherAllowance: toCents(body.otherAllowance ?? "0"),
    nonCashBenefit: toCents(body.nonCashBenefit ?? "0"),
    insurancePremium: toCents(body.insurancePremium ?? "0"),
    pensionEmployee: toCents(body.pensionEmployee ?? "0"),
    pensionEmployer: toCents(body.pensionEmployer ?? "0"),
    mortgageInterest: toCents(body.mortgageInterest ?? "0"),
    helbMonthly: toCents(body.helbMonthly ?? "0"),
    saccoMonthly: toCents(body.saccoMonthly ?? "0"),
    hireDate: body.hireDate,
    dateOfBirth: body.dateOfBirth ?? null,
    region: body.region ?? null,
    educationLevel: body.educationLevel ?? null,
    nokName: body.nokName ?? null,
    nokRelationship: body.nokRelationship ?? null,
    nokPhone: body.nokPhone ?? null,
    nokEmail: body.nokEmail ?? null,
  };
}

// Generate next employee number
async function nextEmpNo(orgId: number): Promise<string> {
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(employees).where(eq(employees.orgId, orgId));
  const n = Number(row?.count ?? 0) + 1;
  return `EMP${String(n).padStart(4, "0")}`;
}

router.get("/", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const { region, educationLevel } = req.query as { region?: string; educationLevel?: string };

    const conditions: SQL[] = [
      eq(employees.orgId, p.orgId),
      ne(employees.status, "terminated"),
    ];
    if (region) conditions.push(eq(employees.region, region));
    if (educationLevel) conditions.push(eq(employees.educationLevel, educationLevel as any));

    const list = await db
      .select({ employee: employees, department: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(...conditions));
    res.json(list);
  } catch (err) { next(err); }
});

router.post("/", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = employeeBaseSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const empNo = await nextEmpNo(p.orgId);
    const [emp] = await db.insert(employees).values({
      orgId: p.orgId, empNo, ...toRow(parsed.data),
    }).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_CREATED", entity: "employees", entityId: emp.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { empNo, email: emp.email, position: emp.position },
      });
    });

    res.status(201).json(emp);
  } catch (err) { next(err); }
});

router.get("/:id", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [row] = await db
      .select({ employee: employees, department: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    if (!row) { res.status(404).json({ error: "Employee not found" }); return; }

    // Last 12 payslips
    const slips = await db.select({ slip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.employeeId, id), eq(payslips.orgId, p.orgId)))
      .orderBy(payrollRuns.period)
      .limit(12);

    // Leave balance summary for this calendar year
    const thisYear = new Date().getFullYear().toString();
    const takenRows = await db
      .select({ days: leaveRequests.days, startDate: leaveRequests.startDate })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, id),
        eq(leaveRequests.orgId, p.orgId),
        eq(leaveRequests.status, "approved"),
        eq(leaveRequests.type, "annual"),
      ));
    const takenDays = takenRows
      .filter(l => l.startDate?.startsWith(thisYear))
      .reduce((acc, l) => acc + Math.round((l.days ?? 0) / 10), 0);
    const entitlement = Math.round((row.employee.leaveBalance ?? 210) / 10);

    res.json({
      employee: row.employee,
      department: row.department,
      payslips: slips,
      leaveBalanceSummary: {
        entitlement,
        takenDays,
        remaining: Math.max(0, entitlement - takenDays),
      },
    });
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

    const parsed = employeeBaseSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const updateData: Record<string, unknown> = {};
    const b = parsed.data;
    if (b.firstName !== undefined) updateData.firstName = b.firstName;
    if (b.middleName !== undefined) updateData.middleName = b.middleName || null;
    if (b.lastName !== undefined) updateData.lastName = b.lastName;
    if (b.email !== undefined) updateData.email = b.email.toLowerCase();
    if (b.phone !== undefined) updateData.phone = b.phone;
    if (b.gender !== undefined) updateData.gender = b.gender;
    if (b.nationalId !== undefined) updateData.nationalId = b.nationalId;
    if (b.kraPin !== undefined) updateData.kraPin = b.kraPin;
    if (b.nssfNo !== undefined) updateData.nssfNo = b.nssfNo;
    if (b.shifNo !== undefined) updateData.shifNo = b.shifNo;
    if (b.payMethod !== undefined) updateData.payMethod = b.payMethod;
    if (b.bankName !== undefined) updateData.bankName = b.bankName;
    if (b.bankCode !== undefined) updateData.bankCode = b.bankCode;
    if (b.bankBranchCode !== undefined) updateData.bankBranchCode = b.bankBranchCode;
    if (b.bankBranchName !== undefined) updateData.bankBranchName = b.bankBranchName;
    if (b.bankAccount !== undefined) updateData.bankAccount = b.bankAccount;
    if (b.mpesaPhone !== undefined) updateData.mpesaPhone = b.mpesaPhone;
    if (b.departmentId !== undefined) updateData.departmentId = b.departmentId;
    if (b.position !== undefined) updateData.position = b.position;
    if (b.employmentType !== undefined) updateData.employmentType = b.employmentType;
    if (b.residentStatus !== undefined) updateData.residentStatus = b.residentStatus;
    if (b.salaryBasis !== undefined) updateData.salaryBasis = b.salaryBasis;
    if (b.disabilityExemption !== undefined) updateData.disabilityExemption = b.disabilityExemption;
    if (b.basicSalary !== undefined) updateData.basicSalary = toCents(b.basicSalary);
    if (b.houseAllowance !== undefined) updateData.houseAllowance = toCents(b.houseAllowance);
    if (b.transportAllowance !== undefined) updateData.transportAllowance = toCents(b.transportAllowance);
    if (b.otherAllowance !== undefined) updateData.otherAllowance = toCents(b.otherAllowance);
    if (b.nonCashBenefit !== undefined) updateData.nonCashBenefit = toCents(b.nonCashBenefit);
    if (b.insurancePremium !== undefined) updateData.insurancePremium = toCents(b.insurancePremium);
    if (b.pensionEmployee !== undefined) updateData.pensionEmployee = toCents(b.pensionEmployee);
    if (b.pensionEmployer !== undefined) updateData.pensionEmployer = toCents(b.pensionEmployer);
    if (b.mortgageInterest !== undefined) updateData.mortgageInterest = toCents(b.mortgageInterest);
    if (b.helbMonthly !== undefined) updateData.helbMonthly = toCents(b.helbMonthly);
    if (b.saccoMonthly !== undefined) updateData.saccoMonthly = toCents(b.saccoMonthly);
    if (b.hireDate !== undefined) updateData.hireDate = b.hireDate;
    if (b.workDaysPerWeek !== undefined) updateData.workDaysPerWeek = b.workDaysPerWeek;
    if (b.worksOnHolidays !== undefined) updateData.worksOnHolidays = b.worksOnHolidays;
    if (b.leaveBalance !== undefined) updateData.leaveBalance = b.leaveBalance;
    if (b.dateOfBirth !== undefined) updateData.dateOfBirth = b.dateOfBirth ?? null;
    if (b.region !== undefined) updateData.region = b.region ?? null;
    if (b.educationLevel !== undefined) updateData.educationLevel = b.educationLevel ?? null;
    if (b.nokName !== undefined) updateData.nokName = b.nokName ?? null;
    if (b.nokRelationship !== undefined) updateData.nokRelationship = b.nokRelationship ?? null;
    if (b.nokPhone !== undefined) updateData.nokPhone = b.nokPhone ?? null;
    if (b.nokEmail !== undefined) updateData.nokEmail = b.nokEmail ?? null;

    const [updated] = await db.update(employees).set(updateData).where(eq(employees.id, id)).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_UPDATED", entity: "employees", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: existing, after: updated,
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

router.delete("/:id", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

    const today = new Date().toISOString().slice(0, 10);
    const [updated] = await db.update(employees).set({ status: "terminated", terminationDate: today })
      .where(eq(employees.id, id)).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_TERMINATED", entity: "employees", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: existing.status }, after: { status: "terminated", terminationDate: today },
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── POST /:id/terminate — richer termination with reason ───────────────────
const terminateSchema = z.object({
  terminationDate: isoDate,
  terminationReason: z.string().max(500).optional(),
});

router.post("/:id/terminate", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }
    if (existing.status === "terminated") {
      res.status(409).json({ error: "Employee is already terminated" }); return;
    }

    const parsed = terminateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return;
    }

    const { terminationDate, terminationReason } = parsed.data;

    const [updated] = await db.update(employees)
      .set({ status: "terminated", terminationDate, terminationReason: terminationReason ?? null } as any)
      .where(eq(employees.id, id))
      .returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_TERMINATED", entity: "employees", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: existing.status },
        after: { status: "terminated", terminationDate, terminationReason },
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── Bulk import ────────────────────────────────────────────────────────────
router.post("/bulk", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const body = req.body as { rows?: unknown[] };
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      res.status(422).json({ error: "rows must be a non-empty array" }); return;
    }
    if (body.rows.length > 500) {
      res.status(422).json({ error: "Maximum 500 rows per import" }); return;
    }

    const errors: { row: number; message: string }[] = [];
    const validRows: z.infer<typeof employeeBaseSchema>[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const parsed = employeeBaseSchema.safeParse(body.rows[i]);
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const msgs = Object.entries(flat.fieldErrors)
          .map(([f, e]) => `${f}: ${(e as string[]).join(", ")}`)
          .join("; ");
        errors.push({ row: i + 1, message: msgs || "Invalid data" });
      } else {
        validRows.push(parsed.data);
      }
    }

    if (validRows.length === 0) {
      res.status(422).json({ imported: 0, skipped: errors.length, errors }); return;
    }

    // Insert valid rows inside a transaction, generating empNo for each
    const inserted: string[] = [];
    await db.transaction(async (tx) => {
      for (const row of validRows) {
        const [countRow] = await tx.select({ count: sql<number>`count(*)` })
          .from(employees).where(eq(employees.orgId, p.orgId));
        const n = Number(countRow?.count ?? 0) + 1;
        const empNo = `EMP${String(n).padStart(4, "0")}`;
        const [emp] = await tx.insert(employees).values({
          orgId: p.orgId, empNo, ...toRow(row),
        }).returning({ empNo: employees.empNo });
        inserted.push(emp.empNo);
      }
    });

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEES_BULK_IMPORTED", entity: "employees", entityId: null,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { count: inserted.length, empNos: inserted },
      });
    });

    res.status(201).json({ imported: inserted.length, skipped: errors.length, errors });
  } catch (err) { next(err); }
});

router.post("/:id/portal-access", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const [existingUser] = await db.select().from(users)
      .where(and(eq(users.email, emp.email), eq(users.orgId, p.orgId)));
    if (existingUser) { res.json({ ok: true, message: "Portal access already exists" }); return; }

    const tempPassword = generateTempPassword();
    await db.insert(users).values({
      orgId: p.orgId,
      email: emp.email,
      name: fullName(emp),
      passwordHash: await hashPassword(tempPassword),
      role: "employee",
      employeeId: emp.id,
      mustChangePassword: true,
    });

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "PORTAL_ACCESS_GRANTED", entity: "employees", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { email: emp.email },
      });
    });

    // In production, send tempPassword via email. Here we return it once.
    res.json({ ok: true, tempPassword, message: "Portal access created. Share the temp password securely." });
  } catch (err) { next(err); }
});

export default router;
