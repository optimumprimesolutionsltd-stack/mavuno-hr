import { Router } from "express";
import { z } from "zod";
import { eq, and, ne, sql, leftJoin } from "drizzle-orm";
import { db } from "@workspace/db";
import { employees, users, payslips, payrollRuns, departments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";
import { toCents } from "../lib/money.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";

const router = Router();

const moneyString = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const employeeBaseSchema = z.object({
  firstName: z.string().min(1).max(80),
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
  bankAccount: z.string().max(34).optional(),
  mpesaPhone: z.string().max(20).optional(),
  departmentId: z.number().int().positive().optional(),
  position: z.string().min(1).max(120),
  employmentType: z.enum(["permanent","contract","casual"]).default("permanent"),
  residentStatus: z.enum(["resident","non_resident"]).default("resident"),
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

function toRow(body: z.infer<typeof employeeBaseSchema>) {
  return {
    firstName: body.firstName, lastName: body.lastName, email: body.email.toLowerCase(),
    phone: body.phone ?? null, gender: body.gender, nationalId: body.nationalId ?? null,
    kraPin: body.kraPin ?? null, nssfNo: body.nssfNo ?? null, shifNo: body.shifNo ?? null,
    payMethod: body.payMethod, bankName: body.bankName ?? null, bankCode: body.bankCode ?? null,
    bankBranchCode: body.bankBranchCode ?? null, bankAccount: body.bankAccount ?? null,
    mpesaPhone: body.mpesaPhone ?? null, departmentId: body.departmentId ?? null,
    position: body.position, employmentType: body.employmentType,
    residentStatus: body.residentStatus, disabilityExemption: body.disabilityExemption,
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
    const list = await db
      .select({ employee: employees, department: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.orgId, p.orgId), ne(employees.status, "terminated")));
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
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    // Last 12 payslips
    const slips = await db.select({ p: payslips, r: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.employeeId, id), eq(payslips.orgId, p.orgId)))
      .orderBy(payrollRuns.period)
      .limit(12);

    res.json({ ...emp, payslips: slips });
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
    if (b.bankAccount !== undefined) updateData.bankAccount = b.bankAccount;
    if (b.mpesaPhone !== undefined) updateData.mpesaPhone = b.mpesaPhone;
    if (b.departmentId !== undefined) updateData.departmentId = b.departmentId;
    if (b.position !== undefined) updateData.position = b.position;
    if (b.employmentType !== undefined) updateData.employmentType = b.employmentType;
    if (b.residentStatus !== undefined) updateData.residentStatus = b.residentStatus;
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
      name: `${emp.firstName} ${emp.lastName}`,
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
