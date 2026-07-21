import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { leaveRequests, employees } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { can } from "../lib/rbac.js";
import { HttpError } from "../lib/http-error.js";

const router = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leaveSchema = z.object({
  employeeId: z.number().int().positive().optional(),
  type: z.enum(["annual","sick","maternity","paternity","compassionate","study","unpaid"]),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().max(500).optional(),
}).refine((l) => l.endDate >= l.startDate, { message: "End date must be on or after start date", path: ["endDate"] });

const decideSchema = z.object({
  action: z.enum(["approve","reject"]),
  note: z.string().max(500).optional(),
});

function businessDays(start: string, end: string): number {
  const s = new Date(start), e = new Date(end);
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

router.get("/", requireAuth("leave:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const status = req.query.status as string | undefined;

    const rows = await db.select({ leave: leaveRequests, employee: employees })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(eq(leaveRequests.orgId, p.orgId))
      .orderBy(desc(leaveRequests.createdAt));

    const filtered = status ? rows.filter((r) => r.leave.status === status) : rows;

    // Compute remainingBefore for each annual leave row (current year only)
    const thisYear = new Date().getFullYear().toString();
    // Build map: employeeId -> sorted approved annual leave ids+days for this year
    const approvedByEmp: Record<number, { id: number; days: number }[]> = {};
    for (const row of rows) {
      const l = row.leave;
      if (l.type === "annual" && l.status === "approved" && l.startDate?.startsWith(thisYear)) {
        if (!approvedByEmp[l.employeeId]) approvedByEmp[l.employeeId] = [];
        approvedByEmp[l.employeeId].push({ id: l.id, days: Math.round((l.days ?? 0) / 10) });
      }
    }
    for (const k of Object.keys(approvedByEmp)) {
      approvedByEmp[Number(k)].sort((a, b) => a.id - b.id);
    }

    const result = filtered.map((row) => {
      const l = row.leave;
      if (l.type !== "annual" || !l.startDate?.startsWith(thisYear)) {
        return { ...row, remainingBefore: null };
      }
      const entitlement = Math.round((row.employee.leaveBalance ?? 210) / 10);
      const priorDays = (approvedByEmp[l.employeeId] ?? [])
        .filter((a) => a.id < l.id)
        .reduce((sum, a) => sum + a.days, 0);
      return { ...row, remainingBefore: Math.max(0, entitlement - priorDays) };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /reset-balances — admin resets annual leave balances for new year ────
router.post("/reset-balances", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;

    const [updated] = await db
      .select({ count: employees.id })
      .from(employees)
      .where(and(eq(employees.orgId, p.orgId), eq(employees.status, "active")));

    await db.transaction(async (tx) => {
      await tx.update(employees)
        .set({ leaveBalance: 210 })
        .where(and(eq(employees.orgId, p.orgId), eq(employees.status, "active")));

      await writeAudit(tx as any, {
        orgId: p.orgId,
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        action: "LEAVE_BALANCES_RESET",
        entity: "employees",
        detail: "Annual leave balances reset to 21 days for all active employees (new leave year)",
      });
    });

    res.json({ ok: true, message: "Leave balances reset to 21 days for all active employees." });
  } catch (err) { next(err); }
});

router.post("/", requireAuth("leave:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = leaveSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const empId = parsed.data.employeeId;
    if (!empId) { res.status(422).json({ error: "employeeId is required" }); return; }

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, empId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const days = businessDays(parsed.data.startDate, parsed.data.endDate) * 10;

    // Annual leave balance check
    if (parsed.data.type === "annual") {
      const thisYear = parsed.data.startDate.slice(0, 4);
      const takenRows = await db
        .select({ days: leaveRequests.days, startDate: leaveRequests.startDate })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, empId),
          eq(leaveRequests.orgId, p.orgId),
          eq(leaveRequests.status, "approved"),
          eq(leaveRequests.type, "annual"),
        ));
      const takenDays = takenRows
        .filter(l => l.startDate?.startsWith(thisYear))
        .reduce((acc, l) => acc + Math.round((l.days ?? 0) / 10), 0);
      const entitlement = Math.round((emp.leaveBalance ?? 210) / 10);
      const requested = Math.round(days / 10);
      if (takenDays + requested > entitlement) {
        res.status(422).json({
          error: `Insufficient annual leave balance. ${entitlement - takenDays} day(s) remaining, request requires ${requested} day(s).`,
          code: "INSUFFICIENT_LEAVE_BALANCE",
        });
        return;
      }
    }

    const [leave] = await db.insert(leaveRequests).values({
      orgId: p.orgId, employeeId: empId, type: parsed.data.type,
      startDate: parsed.data.startDate, endDate: parsed.data.endDate,
      days, reason: parsed.data.reason ?? null, status: "pending",
    }).returning();

    res.status(201).json(leave);
  } catch (err) { next(err); }
});

// ── PATCH /:id/cancel — admin/HR cancels an already-approved leave ────────────
router.patch("/:id/cancel", requireAuth("leave:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [leave] = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.orgId, p.orgId)));
    if (!leave) { res.status(404).json({ error: "Leave request not found" }); return; }
    if (leave.status !== "approved") throw new HttpError(409, "Only approved leaves can be cancelled");

    const [updated] = await db.update(leaveRequests).set({
      status: "cancelled", decidedByUserId: p.userId, decidedAt: new Date(),
    }).where(eq(leaveRequests.id, id)).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "LEAVE_CANCELLED", entity: "leave_requests", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: "approved" }, after: { status: "cancelled" },
        detail: `Leave cancelled by ${p.email}`,
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth("leave:approve"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [leave] = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.orgId, p.orgId)));
    if (!leave) { res.status(404).json({ error: "Leave request not found" }); return; }
    if (leave.status !== "pending") throw new HttpError(409, "Leave request is not pending");

    const { action } = parsed.data;
    const newStatus = action === "approve" ? "approved" : "rejected";

    const [updated] = await db.update(leaveRequests).set({
      status: newStatus, decidedByUserId: p.userId, decidedAt: new Date(),
    }).where(eq(leaveRequests.id, id)).returning();

    // Balance is computed dynamically in portal/me from approved leave rows — no separate deduction needed here.

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: `LEAVE_${action.toUpperCase()}D`, entity: "leave_requests", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { status: "pending" }, after: { status: newStatus },
      });
    });

    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
