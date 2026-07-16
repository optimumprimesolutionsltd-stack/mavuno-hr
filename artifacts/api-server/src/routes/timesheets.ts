import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { timesheets, employees } from "@workspace/db/schema";
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

    const rows = await db.select({ ts: timesheets, emp: employees })
      .from(timesheets)
      .innerJoin(employees, eq(timesheets.employeeId, employees.id))
      .where(and(
        eq(timesheets.orgId, p.orgId),
        ...(per ? [eq(timesheets.period, per)] : []),
      ))
      .orderBy(desc(timesheets.id));

    res.json(rows);
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
        approvedAt: null, approvedBy: null,
      }).where(eq(timesheets.id, existing.id)).returning();
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
    }).where(eq(timesheets.id, id)).returning();

    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
