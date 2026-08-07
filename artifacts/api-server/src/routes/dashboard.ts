import { Router } from "express";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
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
import { fullName } from "../lib/employee-name.js";

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

    // Recent payroll runs — last 7 (we need 7 to compute MoM variance across 6 chart bars)
    const recentRuns = await db
      .select({
        id: payrollRuns.id,
        period: payrollRuns.period,
        name: payrollRuns.name,
        status: payrollRuns.status,
        grossTotal: payrollRuns.grossTotal,
        netTotal: payrollRuns.netTotal,
        payeTotal: payrollRuns.payeTotal,
        employeeCount: payrollRuns.employeeCount,
      })
      .from(payrollRuns)
      .where(eq(payrollRuns.orgId, orgId))
      .orderBy(desc(payrollRuns.period))
      .limit(7);

    // Chart data — last 6 runs, oldest→newest
    const chartRuns = recentRuns.slice(0, 6).slice().reverse();
    const runs = chartRuns.map((r) => ({ period: r.period, gross: Number(r.grossTotal), net: Number(r.netTotal) }));

    // Latest run KPIs
    const latestRun = recentRuns[0];
    const prevRun   = recentRuns[1];
    const monthlyGross = latestRun ? Number(latestRun.grossTotal) : 0;
    const monthlyNet   = latestRun ? Number(latestRun.netTotal)   : 0;
    const avgCostPerEmployee = headcount > 0 ? Math.round(monthlyGross / headcount) : 0;

    // MoM variance
    const prevGross = prevRun ? Number(prevRun.grossTotal) : null;
    const grossVarianceAmount = prevGross != null ? monthlyGross - prevGross : null;
    const grossVariancePct = prevGross != null && prevGross > 0
      ? Math.round((monthlyGross - prevGross) / prevGross * 1000) / 10
      : null;

    // Pending leave count + list
    const pendingLeaveRows = await db
      .select({
        leaveId: leaveRequests.id,
        type: leaveRequests.type,
        days: leaveRequests.days,
        startDate: leaveRequests.startDate,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
      })
      .from(leaveRequests)
      .leftJoin(employees, and(
        eq(leaveRequests.employeeId, employees.id),
        eq(leaveRequests.orgId, employees.orgId),
      ))
      .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "pending")))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(10);

    const pendingLeaveCount = pendingLeaveRows.length;
    const pendingLeaves = pendingLeaveRows.map((r) => ({
      leave: { id: r.leaveId, type: r.type, days: r.days, startDate: r.startDate },
      employee: { firstName: r.firstName ?? "", middleName: r.middleName ?? undefined, lastName: r.lastName ?? "" },
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

    // Department payroll costs from most recent run
    let deptCosts: { name: string; gross: number }[] = [];
    if (latestRun) {
      const deptRows = await db
        .select({
          name: departments.name,
          gross: sql<string>`coalesce(sum(${payslips.gross}), 0)`,
        })
        .from(payslips)
        .leftJoin(employees, and(
          eq(payslips.employeeId, employees.id),
          eq(payslips.orgId, employees.orgId),
        ))
        .leftJoin(departments, and(
          eq(employees.departmentId, departments.id),
          eq(employees.orgId, departments.orgId),
        ))
        .where(and(eq(payslips.runId, latestRun.id), eq(payslips.orgId, orgId)))
        .groupBy(departments.name);
      deptCosts = deptRows.map((r) => ({ name: r.name ?? "Unassigned", gross: Number(r.gross) }));
    }

    // Recent hires — last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const recentHireRows = await db
      .select({ firstName: employees.firstName, middleName: employees.middleName, lastName: employees.lastName, position: employees.position, hireDate: employees.hireDate })
      .from(employees)
      .where(and(eq(employees.orgId, orgId), gte(employees.hireDate, sixtyDaysAgo.toISOString().split("T")[0])))
      .orderBy(desc(employees.hireDate))
      .limit(5);
    const recentHires = recentHireRows.map((r) => ({
      name: fullName(r),
      position: r.position ?? "",
      hireDate: r.hireDate,
    }));

    // Work anniversaries in next 30 days (using hireDate month-day)
    const today = new Date();
    const in30 = new Date(); in30.setDate(today.getDate() + 30);
    const allActiveEmps = await db
      .select({ firstName: employees.firstName, middleName: employees.middleName, lastName: employees.lastName, hireDate: employees.hireDate, position: employees.position })
      .from(employees)
      .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));

    const upcomingAnniversaries = allActiveEmps
      .filter((e) => {
        if (!e.hireDate) return false;
        const hire = new Date(e.hireDate);
        const years = today.getFullYear() - hire.getFullYear();
        if (years < 1) return false; // must have at least 1 year tenure
        // Anniversary this calendar year
        const anniv = new Date(today.getFullYear(), hire.getMonth(), hire.getDate());
        // Also check next year's if we're near year-end
        const annivNext = new Date(today.getFullYear() + 1, hire.getMonth(), hire.getDate());
        return (anniv >= today && anniv <= in30) || (annivNext >= today && annivNext <= in30);
      })
      .map((e) => {
        const hire = new Date(e.hireDate!);
        const years = today.getFullYear() - hire.getFullYear();
        const anniv = new Date(today.getFullYear(), hire.getMonth(), hire.getDate());
        const annivDate = anniv >= today ? anniv : new Date(today.getFullYear() + 1, hire.getMonth(), hire.getDate());
        return {
          name: fullName(e),
          position: e.position ?? "",
          years,
          date: annivDate.toISOString().split("T")[0],
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);

    // Recent audit log
    const recentAudit = await db
      .select({ id: auditLogs.id, action: auditLogs.action, detail: auditLogs.detail, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8);

    res.json({
      headcount,
      monthlyGross,
      monthlyNet,
      avgCostPerEmployee,
      grossVarianceAmount,
      grossVariancePct,
      pendingLeaveCount,
      loanBalance,
      activeLoanCount,
      runs,
      deptCosts,
      pendingLeaves,
      auditLogs: recentAudit,
      recentHires,
      upcomingAnniversaries,
      latestRunStatus: latestRun?.status ?? null,
      latestRunName: latestRun?.name ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
