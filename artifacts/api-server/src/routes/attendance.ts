import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte, ne, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { attendanceDays, employees, departments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { periodBounds, leaveInPeriod, overtimeEnabled, upsertDay, clearDay, syncTimesheet, STATUSES } from "../lib/attendance.js";

const router = Router();

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// GET /api/attendance?period=YYYY-MM -- everyone's month at a glance
router.get("/", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const per = period.safeParse(req.query.period);
    if (!per.success) { res.status(422).json({ error: "period=YYYY-MM is required" }); return; }
    const { first, last } = periodBounds(per.data);

    const staff = await db.select({
      id: employees.id, empNo: employees.empNo, firstName: employees.firstName,
      middleName: employees.middleName, lastName: employees.lastName,
      workDaysPerWeek: employees.workDaysPerWeek, departmentName: departments.name,
    }).from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.orgId, p.orgId), ne(employees.status, "terminated")))
      .orderBy(asc(employees.firstName));

    const days = await db.select().from(attendanceDays).where(and(
      eq(attendanceDays.orgId, p.orgId), gte(attendanceDays.date, first), lte(attendanceDays.date, last),
    ));
    res.json({
      staff, days,
      leave: await leaveInPeriod(p.orgId, per.data),
      overtimeEnabled: await overtimeEnabled(p.orgId),
    });
  } catch (err) { next(err); }
});

const entrySchema = z.object({
  employeeId: z.number().int().positive(),
  date: isoDate,
  status: z.enum([...STATUSES, "clear"]),
  hours: z.number().int().min(0).max(24).default(8),
  overtimeHours: z.number().int().min(0).max(24).default(0),
  note: z.string().max(200).nullish(),
});

// PUT /api/attendance -- set (or clear) one day for one employee
router.put("/", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const e = parsed.data;
    const [emp] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, e.employeeId), eq(employees.orgId, p.orgId)));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    if (e.status === "clear") await clearDay(p.orgId, e.employeeId, e.date);
    else await upsertDay(p.orgId, { ...e, status: e.status });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const syncSchema = z.object({ period, employeeId: z.number().int().positive().optional() });

// POST /api/attendance/sync -- roll attendance up into monthly timesheets
router.post("/sync", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed" }); return; }
    const { first, last } = periodBounds(parsed.data.period);
    let ids: number[];
    if (parsed.data.employeeId) ids = [parsed.data.employeeId];
    else {
      const rows = await db.selectDistinct({ id: attendanceDays.employeeId }).from(attendanceDays).where(and(
        eq(attendanceDays.orgId, p.orgId), gte(attendanceDays.date, first), lte(attendanceDays.date, last),
      ));
      ids = rows.map(r => r.id);
    }
    let updated = 0;
    for (const id of ids) { await syncTimesheet(p.orgId, id, parsed.data.period, true); updated++; }
    res.json({ updated });
  } catch (err) { next(err); }
});

export default router;
