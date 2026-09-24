import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { timesheets, employees, organizations } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";

const router = Router();

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const timesheetSchema = z.object({
  employeeId: z.number().int().positive(),
  period,
  daysWorked: z.number().int().min(0).max(31),
  normalHours: z.number().int().min(0).max(400),
  overtimeHours: z.number().int().min(0).max(200),
  holidayHours: z.number().int().min(0).max(100),
});

router.get("/", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const per = req.query.period as string | undefined;

    const rows = await db.select({ timesheet: timesheets, employee: employees })
      .from(timesheets)
      .innerJoin(employees, and(
        eq(timesheets.employeeId, employees.id),
        eq(timesheets.orgId, employees.orgId),
      ))
      .where(and(
        eq(timesheets.orgId, p.orgId),
        ...(per ? [eq(timesheets.period, per)] : []),
      ))
      .orderBy(desc(timesheets.id));

    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/settings", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const [org] = await db.select({ ot: organizations.overtimeEnabled }).from(organizations).where(eq(organizations.id, p.orgId));
    res.json({ overtimeEnabled: org?.ot ?? true });
  } catch (err) { next(err); }
});

router.post("/", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = timesheetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    const [org] = await db.select({ ot: organizations.overtimeEnabled }).from(organizations).where(eq(organizations.id, p.orgId));
    if (!org?.ot) parsed.data.overtimeHours = 0;

    const [existing] = await db.select().from(timesheets).where(and(
      eq(timesheets.orgId, p.orgId),
      eq(timesheets.employeeId, parsed.data.employeeId),
      eq(timesheets.period, parsed.data.period),
    ));

    let result;
    if (existing) {
      const [updated] = await db.update(timesheets).set({
        daysWorked: parsed.data.daysWorked,
        normalHours: parsed.data.normalHours,
        overtimeHours: parsed.data.overtimeHours,
        holidayHours: parsed.data.holidayHours,
        approvedAt: null, approvedBy: null, rejectedAt: null, rejectionNote: null,
      }).where(and(eq(timesheets.id, existing.id), eq(timesheets.orgId, p.orgId))).returning();
      result = updated;
    } else {
      const [created] = await db.insert(timesheets).values({
        orgId: p.orgId, ...parsed.data,
      }).returning();
      result = created;
    }

    res.json(result);
  } catch (err) { next(err); }
});

router.patch("/:id/approve", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [ts] = await db.select().from(timesheets)
      .where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId)));
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    if (ts.approvedAt) throw new HttpError(409, "Timesheet already approved");

    const [updated] = await db.update(timesheets).set({
      approvedBy: p.userId, approvedAt: new Date(),
    }).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId))).returning();

    res.json(updated);
  } catch (err) { next(err); }
});

const rejectSchema = z.object({ note: z.string().max(500).optional() });

// Reject: sends the timesheet back to the employee with a reason. They can
// correct and resubmit; HR can also just edit it directly (PATCH /:id).
router.patch("/:id/reject", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(422).json({ error: "Validation failed" }); return; }
    const [ts] = await db.select().from(timesheets).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId)));
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    if (ts.approvedAt) throw new HttpError(409, "Timesheet is approved. Reopen it first.");
    const [updated] = await db.update(timesheets).set({
      rejectedAt: new Date(), rejectionNote: parsed.data.note ?? null,
    }).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId))).returning();
    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "TIMESHEET_REJECTED", entity: "timesheets", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { note: parsed.data.note ?? null },
      });
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Reopen: undo an approval or rejection so the sheet is pending again.
router.patch("/:id/reopen", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const [ts] = await db.select().from(timesheets).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId)));
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    const [updated] = await db.update(timesheets).set({
      approvedAt: null, approvedBy: null, rejectedAt: null, rejectionNote: null,
    }).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId))).returning();
    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "TIMESHEET_REOPENED", entity: "timesheets", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { approved: !!ts.approvedAt, rejected: !!ts.rejectedAt },
      });
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Edit hours directly (works on any state). The sheet goes back to pending so
// the change is re-approved rather than slipping through on an old approval.
const editSchema = timesheetSchema.omit({ employeeId: true, period: true });
router.patch("/:id", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const [ts] = await db.select().from(timesheets).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId)));
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    const [org] = await db.select({ ot: organizations.overtimeEnabled }).from(organizations).where(eq(organizations.id, p.orgId));
    const d = { ...parsed.data, overtimeHours: org?.ot ? parsed.data.overtimeHours : 0 };
    const [updated] = await db.update(timesheets).set({
      ...d, approvedAt: null, approvedBy: null, rejectedAt: null, rejectionNote: null,
    }).where(and(eq(timesheets.id, id), eq(timesheets.orgId, p.orgId))).returning();
    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "TIMESHEET_EDITED", entity: "timesheets", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { daysWorked: ts.daysWorked, normalHours: ts.normalHours, overtimeHours: ts.overtimeHours, holidayHours: ts.holidayHours },
        after: d,
      });
    });
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
