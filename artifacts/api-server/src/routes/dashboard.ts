import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { employees, payrollRuns, leaveRequests, departments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";

const router = Router();

router.get("/", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const orgId = p.orgId;

    const [headcount] = await db.select({ count: sql<number>`count(*)` })
      .from(employees).where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));

    const recentRuns = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.orgId, orgId))
      .orderBy(desc(payrollRuns.period)).limit(6);

    const pendingLeave = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "pending")))
      .orderBy(desc(leaveRequests.createdAt)).limit(5);

    const depts = await db.select().from(departments).where(eq(departments.orgId, orgId));

    const empByDept = await db.select({
      departmentId: employees.departmentId,
      count: sql<number>`count(*)`,
    }).from(employees)
      .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")))
      .groupBy(employees.departmentId);

    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const deptBreakdown = empByDept.map((r) => ({
      department: r.departmentId ? (deptMap.get(r.departmentId) ?? "Unassigned") : "Unassigned",
      count: Number(r.count),
    }));

    const payrollTrend = recentRuns.slice().reverse().map((r) => ({
      period: r.period,
      grossTotal: r.grossTotal,
      netTotal: r.netTotal,
      payeTotal: r.payeTotal,
      employeeCount: r.employeeCount,
    }));

    const [lastRun] = recentRuns;

    res.json({
      headcount: Number(headcount?.count ?? 0),
      lastRun: lastRun ?? null,
      payrollTrend,
      pendingLeave,
      deptBreakdown,
    });
  } catch (err) { next(err); }
});

export default router;
