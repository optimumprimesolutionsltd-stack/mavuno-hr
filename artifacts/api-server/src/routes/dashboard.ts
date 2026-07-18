import { Router } from "express";
import { eq, and, desc, sql, sum } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  employees,
  payrollRuns,
  payslips,
  leaveRequests,
  departments,
  loans,
  auditLogs,
} from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";

const router = Router();

router.get("/", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const orgId = p.orgId;

    // Headcount
    const [headcountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));
    const headcount = headcountRow?.count ?? 0;

    // Recent payroll runs (for bar chart trend) — last 6, oldest→newest
    const recentRuns = await db
      .select({ id: payrollRuns.id, period: payrollRuns.period, grossTotal: payrollRuns.grossTotal })
      .from(payrollRuns)
      .where(eq(payrollRuns.orgId, orgId))
      .orderBy(desc(payrollRuns.period))
      .limit(6);

    const runs = recentRuns
      .slice()
      .reverse()
      .map((r) => ({ period: r.period, gross: Number(r.grossTotal) }));

    const monthlyGross = recentRuns.length > 0 ? Number(recentRuns[0].grossTotal) : 0;
    const avgCostPerEmployee = headcount > 0 ? Math.round(monthlyGross / headcount) : 0;

    // Pending leave count + list with employee names
    const pendingLeaveRows = await db
      .select({
        leaveId: leaveRequests.id,
        type: leaveRequests.type,
        days: leaveRequests.days,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(leaveRequests)
      .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "pending")))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(10);

    const pendingLeaveCount = pendingLeaveRows.length;
    const pendingLeaves = pendingLeaveRows.map((r) => ({
      leave: { id: r.leaveId, type: r.type, days: r.days },
      employee: { firstName: r.firstName ?? "", lastName: r.lastName ?? "" },
    }));

    // Active loan balance + count
    const [loanRow] = await db
      .select({
        totalBalance: sql<string>`coalesce(sum(balance), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(loans)
      .where(and(eq(loans.orgId, orgId), eq(loans.status, "active")));
    const loanBalance = Number(loanRow?.totalBalance ?? 0);
    const activeLoanCount = loanRow?.count ?? 0;

    // Department payroll costs from the most recent run's payslips
    let deptCosts: { name: string; gross: number }[] = [];
    if (recentRuns.length > 0) {
      const lastRunId = recentRuns[0].id;
      const deptRows = await db
        .select({
          name: departments.name,
          gross: sql<string>`coalesce(sum(${payslips.gross}), 0)`,
        })
        .from(payslips)
        .leftJoin(employees, eq(payslips.employeeId, employees.id))
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .where(eq(payslips.runId, lastRunId))
        .groupBy(departments.name);
      deptCosts = deptRows.map((r) => ({ name: r.name ?? "Unassigned", gross: Number(r.gross) }));
    }

    // Recent audit log entries
    const recentAudit = await db
      .select({ id: auditLogs.id, action: auditLogs.action, detail: auditLogs.detail, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(6);

    res.json({
      headcount,
      monthlyGross,
      avgCostPerEmployee,
      pendingLeaveCount,
      loanBalance,
      activeLoanCount,
      runs,
      deptCosts,
      pendingLeaves,
      auditLogs: recentAudit,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
