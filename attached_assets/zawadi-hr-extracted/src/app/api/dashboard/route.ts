import { NextResponse } from "next/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { employees, payrollRuns, leaveRequests, loans, departments, auditLogs } from "@/db/schema";
import { route } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import type { Cents } from "@/lib/money";

/** All money in the response is integer CENTS; the client formats. */
export const GET = route({ permission: "team:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    const staff = await tx
      .select({ e: employees, d: departments })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.orgId, principal.orgId), ne(employees.status, "terminated")));

    const grossOf = (e: (typeof staff)[number]["e"]): Cents =>
      e.basicSalary + e.houseAllowance + e.transportAllowance + e.otherAllowance;

    const headcount = staff.length;
    const female = staff.filter((s) => s.e.gender === "female").length;
    const monthlyGross = staff.reduce((a, s) => a + grossOf(s.e), 0);

    const pendingLeaves = await tx
      .select({ leave: leaveRequests, employee: employees })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(and(eq(leaveRequests.orgId, principal.orgId), eq(leaveRequests.status, "pending")))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(8);

    const activeLoans = await tx.select().from(loans)
      .where(and(eq(loans.orgId, principal.orgId), eq(loans.status, "active")));

    const runRows = await tx.select().from(payrollRuns)
      .where(eq(payrollRuns.orgId, principal.orgId))
      .orderBy(desc(payrollRuns.period))
      .limit(6);

    const latest = runRows[0] ?? null;

    /* Salary distribution buckets (thresholds are whole KES for readability). */
    const buckets = [
      { label: "<50K", lo: 0, hi: 50_000_00 },
      { label: "50–100K", lo: 50_000_00, hi: 100_000_00 },
      { label: "100–200K", lo: 100_000_00, hi: 200_000_00 },
      { label: "200–500K", lo: 200_000_00, hi: 500_000_00 },
      { label: "500K+", lo: 500_000_00, hi: Infinity },
    ];
    const salaryBuckets = buckets.map((b) => ({
      label: b.label,
      count: staff.filter((s) => grossOf(s.e) >= b.lo && grossOf(s.e) < b.hi).length,
    }));

    const byDept: Record<string, { gross: Cents; count: number }> = {};
    for (const s of staff) {
      const k = s.d?.name ?? "Unassigned";
      byDept[k] = byDept[k] || { gross: 0, count: 0 };
      byDept[k].gross += grossOf(s.e);
      byDept[k].count++;
    }

    const recentAudit = await tx.select().from(auditLogs)
      .where(eq(auditLogs.orgId, principal.orgId))
      .orderBy(desc(auditLogs.seq))
      .limit(8);

    return NextResponse.json({
      currency: principal.currencyCode,
      headcount,
      genderRatio: { female, male: headcount - female },
      monthlyGross,
      avgCostPerEmployee: headcount ? Math.round(monthlyGross / headcount) : 0,
      pendingLeaveCount: pendingLeaves.length,
      pendingLeaves: pendingLeaves.map((p) => ({
        leave: { id: p.leave.id, type: p.leave.type, days: p.leave.days }, // tenths of a day
        employee: { firstName: p.employee.firstName, lastName: p.employee.lastName },
      })),
      activeLoanCount: activeLoans.length,
      loanBalance: activeLoans.reduce((a, l) => a + l.balance, 0),
      latestRun: latest && {
        id: latest.id, name: latest.name, status: latest.status, netTotal: latest.netTotal,
      },
      runs: runRows.slice().reverse().map((r) => ({
        period: r.period,
        gross: r.grossTotal,
        net: r.netTotal,
        paye: r.payeTotal,
        nssf: r.nssfEmployeeTotal + r.nssfEmployerTotal,
        shif: r.shifTotal,
        housingLevy: r.housingLevyEmployeeTotal + r.housingLevyEmployerTotal,
      })),
      deptCosts: Object.entries(byDept).map(([name, v]) => ({ name, gross: v.gross, count: v.count })),
      salaryBuckets,
      auditLogs: recentAudit.map((a) => ({ id: a.id, action: a.action, detail: a.detail, createdAt: a.createdAt })),
    });
  }),
);
