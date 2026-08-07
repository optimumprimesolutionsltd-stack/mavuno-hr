import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, employees } from "@workspace/db/schema";
import { hashPassword, validatePasswordStrength } from "../lib/password.js";
import { requireAuth, getIp, type AuthRequest } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";
import { fullName } from "../lib/employee-name.js";

const router = Router();

const ROLES = ["employee", "manager", "hr", "payroll_officer", "approver", "admin"] as const;

const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  role: z.enum(ROLES).default("employee"),
  employeeId: z.number().int().positive().optional(),
  password: z.string().min(8).max(200),
  mustChangePassword: z.boolean().default(true),
});

const updateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

// GET /api/users — list all users in the org
router.get("/", requireAuth("user:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const rows = await db
      .select({ user: users, employee: employees })
      .from(users)
      .leftJoin(employees, and(
        eq(users.employeeId, employees.id),
        eq(users.orgId, employees.orgId),
      ))
      .where(eq(users.orgId, p.orgId));

    res.json(rows.map(r => ({
      id: r.user.id,
      email: r.user.email,
      name: r.user.name,
      role: r.user.role,
      employeeId: r.user.employeeId,
      employeeName: r.employee ? fullName(r.employee) : null,
      empNo: r.employee?.empNo ?? null,
      mustChangePassword: r.user.mustChangePassword,
      lastLoginAt: r.user.lastLoginAt,
      disabledAt: r.user.disabledAt,
      createdAt: r.user.createdAt,
    })));
  } catch (err) { next(err); }
});

// POST /api/users — create a new user
router.post("/", requireAuth("user:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const { email, name, role, employeeId, password, mustChangePassword } = parsed.data;

    // Validate employee belongs to this org
    if (employeeId) {
      const [emp] = await db.select().from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.orgId, p.orgId)));
      if (!emp) throw new HttpError(404, "Employee not found");

      // Check employee not already linked to a user
      const [existing] = await db.select().from(users)
        .where(and(eq(users.employeeId, employeeId), eq(users.orgId, p.orgId)));
      if (existing) throw new HttpError(409, "This employee already has a login account");
    }

    // Check email uniqueness within org
    const [emailExists] = await db.select().from(users)
      .where(and(eq(users.email, email.toLowerCase()), eq(users.orgId, p.orgId)));
    if (emailExists) throw new HttpError(409, "Email already in use");

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({
      orgId: p.orgId,
      email: email.toLowerCase(),
      name,
      role,
      employeeId: employeeId ?? null,
      passwordHash,
      mustChangePassword,
    }).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "USER_CREATED", entity: "users", entityId: user.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { email, name, role, employeeId },
      });
    });

    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      employeeId: user.employeeId, mustChangePassword: user.mustChangePassword,
    });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id — update role or disable/enable
router.patch("/:id", requireAuth("user:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed" }); return; }

    const [user] = await db.select().from(users)
      .where(and(eq(users.id, id), eq(users.orgId, p.orgId)));
    if (!user) throw new HttpError(404, "User not found");
    if (user.id === p.userId) throw new HttpError(400, "Cannot modify your own account here");

    const updates: Partial<typeof user> = {};
    if (parsed.data.role !== undefined) updates.role = parsed.data.role as any;
    if (parsed.data.disabled !== undefined) {
      updates.disabledAt = parsed.data.disabled ? new Date() : null;
    }

    const [updated] = await db.update(users).set(updates)
      .where(and(eq(users.id, id), eq(users.orgId, p.orgId)))
      .returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "USER_UPDATED", entity: "users", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: parsed.data,
      });
    });

    res.json({ id: updated.id, role: updated.role, disabledAt: updated.disabledAt });
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password — set a new temp password
router.post("/:id/reset-password", requireAuth("user:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed" }); return; }

    const [user] = await db.select().from(users)
      .where(and(eq(users.id, id), eq(users.orgId, p.orgId)));
    if (!user) throw new HttpError(404, "User not found");

    const hash = await hashPassword(parsed.data.password);
    await db.update(users).set({ passwordHash: hash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null })
      .where(and(eq(users.id, id), eq(users.orgId, p.orgId)));

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "PASSWORD_RESET", entity: "users", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
      });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
