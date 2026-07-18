import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
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

    let q = db.select({ leave: leaveRequests, employee: employees })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(eq(leaveRequests.orgId, p.orgId))
      .$dynamic();

    const rows = await q.orderBy(desc(leaveRequests.createdAt));
    const filtered = status ? rows.filter((r) => r.leave.status === status) : rows;
    res.json(filtered);
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

    const [leave] = await db.insert(leaveRequests).values({
      orgId: p.orgId, employeeId: empId, type: parsed.data.type,
      startDate: parsed.data.startDate, endDate: parsed.data.endDate,
      days, reason: parsed.data.reason ?? null, status: "pending",
    }).returning();

    res.status(201).json(leave);
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
