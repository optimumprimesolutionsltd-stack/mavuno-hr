import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { attendanceDays, timesheets } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { periodBounds, leaveInPeriod, overtimeEnabled, upsertDay, clearDay, syncTimesheet, holidaysInPeriod, STATUSES } from "../lib/attendance.js";

const router = Router();

function me(req: any): { orgId: number; empId: number } {
  const p = (req as AuthRequest).principal;
  if (!p.employeeId) throw new HttpError(403, "No employee profile linked to this account");
  return { orgId: p.orgId, empId: p.employeeId };
}

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function assertNotApproved(orgId: number, empId: number, per: string) {
  const [ts] = await db.select().from(timesheets).where(and(
    eq(timesheets.orgId, orgId), eq(timesheets.employeeId, empId), eq(timesheets.period, per),
  ));
  if (ts?.approvedAt) throw new HttpError(409, "This month's timesheet is approved. Contact HR to make changes.");
}

router.get("/", requireAuth("self:read"), async (req, res, next) => {
  try {
    const { orgId, empId } = me(req);
    const per = period.safeParse(req.query.period);
    if (!per.success) { res.status(422).json({ error: "period=YYYY-MM is required" }); return; }
    const { first, last } = periodBounds(per.data);
    const days = await db.select().from(attendanceDays).where(and(
      eq(attendanceDays.orgId, orgId), eq(attendanceDays.employeeId, empId),
      gte(attendanceDays.date, first), lte(attendanceDays.date, last),
    ));
    const [ts] = await db.select().from(timesheets).where(and(
      eq(timesheets.orgId, orgId), eq(timesheets.employeeId, empId), eq(timesheets.period, per.data),
    ));
    res.json({
      days,
      leave: await leaveInPeriod(orgId, per.data, empId),
      overtimeEnabled: await overtimeEnabled(orgId),
      locked: !!ts?.approvedAt,
      holidays: holidaysInPeriod(per.data),
    });
  } catch (err) { next(err); }
});

const entrySchema = z.object({
  date: isoDate,
  status: z.enum([...STATUSES, "clear"]),
  hours: z.number().int().min(0).max(24).default(8),
  overtimeHours: z.number().int().min(0).max(24).default(0),
  note: z.string().max(200).nullish(),
});

router.put("/", requireAuth("self:request"), async (req, res, next) => {
  try {
    const { orgId, empId } = me(req);
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const e = parsed.data;
    await assertNotApproved(orgId, empId, e.date.slice(0, 7));
    if (e.status === "clear") await clearDay(orgId, empId, e.date);
    else await upsertDay(orgId, { employeeId: empId, ...e, status: e.status });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Send the month's daily entries to HR as this month's timesheet.
router.post("/submit", requireAuth("self:request"), async (req, res, next) => {
  try {
    const { orgId, empId } = me(req);
    const parsed = z.object({ period }).safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed" }); return; }
    res.json(await syncTimesheet(orgId, empId, parsed.data.period, false));
  } catch (err) { next(err); }
});

export default router;
