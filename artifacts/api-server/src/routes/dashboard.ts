import { Router } from "express";
import { eq, and, desc, sql, gte, lte, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  employees,
  payrollRuns,
  payslips,
  leaveRequests,
  departments,
  loans,
  auditLogs,
  timesheets,
  statutoryFilings,
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

// ── GET /api/dashboard/next-steps ────────────────────────────────────────────
// The month's payroll cycle as a checklist -- before (leave, timesheets),
// payroll itself (create > submit > approve > mark paid), after (download and
// file returns) -- so every screen can point at the next thing to do instead
// of leaving people to work out the order.
const FILING_KINDS = ["P10", "NSSF", "SHIF", "AHL"] as const;
const FILING_LABEL: Record<string, string> = { P10: "P10A", NSSF: "NSSF", SHIF: "SHIF", AHL: "AHL" };

function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

type Step = {
  key: string; stage: "before" | "payroll" | "after"; label: string; detail: string;
  state: "done" | "todo" | "waiting"; href?: string; cta?: string;
};

router.get("/next-steps", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const runs = await db.select({
      id: payrollRuns.id, period: payrollRuns.period, status: payrollRuns.status, name: payrollRuns.name,
    }).from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, p.orgId), eq(payrollRuns.runType, "regular"), ne(payrollRuns.status, "reversed")))
      .orderBy(desc(payrollRuns.period), desc(payrollRuns.id))
      .limit(1);
    const latest = runs[0] ?? null;

    const filingsFor = async (runId: number) => db.select({ kind: statutoryFilings.kind, status: statutoryFilings.status })
      .from(statutoryFilings).where(and(eq(statutoryFilings.orgId, p.orgId), eq(statutoryFilings.runId, runId)));

    // Which payroll month we are working on: the latest regular run until it
    // is paid and every return is filed, then the month after it.
    let run: (typeof runs)[number] | null = latest;
    let latestFilings = latest ? await filingsFor(latest.id) : [];
    const allFiled = (fs: { kind: string; status: string }[]) =>
      FILING_KINDS.every((k) => fs.some((f) => f.kind === k && f.status === "filed"));
    let period = latest?.period ?? thisMonth;
    if (latest && latest.status === "paid" && allFiled(latestFilings)) {
      period = nextPeriod(latest.period);
      run = null;
      latestFilings = [];
    }
    const label = periodLabel(period);

    const [{ n: pendingLeave }] = await db.select({ n: sql<number>`count(*)::int` }).from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, p.orgId), eq(leaveRequests.status, "pending")));
    const [{ total: tsTotal, pending: tsPending }] = await db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${timesheets.approvedAt} is null and ${timesheets.rejectedAt} is null)::int`,
    }).from(timesheets).where(and(eq(timesheets.orgId, p.orgId), eq(timesheets.period, period)));

    const steps: Step[] = [];
    steps.push(pendingLeave > 0
      ? { key: "leave", stage: "before", label: "Approve leave requests", detail: `${pendingLeave} waiting — unpaid leave changes pay, so decide these before running payroll.`, state: "todo", href: "/admin/leave", cta: "REVIEW LEAVE" }
      : { key: "leave", stage: "before", label: "Leave requests", detail: "None waiting.", state: "done" });
    if (tsTotal > 0) {
      steps.push(tsPending > 0
        ? { key: "timesheets", stage: "before", label: "Approve timesheets", detail: `${tsPending} of ${tsTotal} for ${label} not yet approved — only approved timesheets count in payroll.`, state: "todo", href: "/admin/timesheets", cta: "REVIEW TIMESHEETS" }
        : { key: "timesheets", stage: "before", label: "Timesheets", detail: `All ${tsTotal} for ${label} approved.`, state: "done" });
    }

    const runHref = run ? `/admin/payroll/${run.id}` : undefined;
    if (!run) {
      steps.push({ key: "payroll", stage: "payroll", label: `Create the ${label} payroll`, detail: "Calculates every employee's pay, deductions and net pay. Nothing is paid or sent.", state: "todo", href: `/admin/payroll?new=${period}`, cta: "CREATE PAYROLL" });
    } else if (run.status === "draft") {
      steps.push({ key: "payroll", stage: "payroll", label: "Check and submit the payroll", detail: `${run.name} is a draft. Review the figures, then submit it for approval.`, state: "todo", href: runHref, cta: "OPEN PAYROLL" });
    } else if (run.status === "pending_approval") {
      steps.push({ key: "payroll", stage: "payroll", label: "Approve the payroll", detail: `${run.name} is waiting for approval. Approving makes the figures final.`, state: "todo", href: runHref, cta: "OPEN PAYROLL" });
    } else if (run.status === "approved") {
      steps.push({ key: "payroll", stage: "payroll", label: "Pay salaries, then mark the payroll as paid", detail: `${run.name} is approved. Pay staff through your bank or M-Pesa, then mark it paid — that unlocks the returns.`, state: "todo", href: runHref, cta: "MARK AS PAID" });
    } else {
      steps.push({ key: "payroll", stage: "payroll", label: `${run.name}`, detail: "Paid.", state: "done", href: runHref });
    }

    const paid = run?.status === "paid";
    const missing = FILING_KINDS.filter((k) => !latestFilings.some((f) => f.kind === k));
    const unfiled = FILING_KINDS.filter((k) => latestFilings.some((f) => f.kind === k && f.status !== "filed"));
    if (!paid) {
      steps.push({ key: "returns", stage: "after", label: "Download the statutory returns", detail: "P10A, NSSF, SHIF and AHL — available once the payroll is marked paid.", state: "waiting" });
      steps.push({ key: "filed", stage: "after", label: "Submit the returns and confirm them", detail: "Upload each return to its authority, then confirm it in Filings.", state: "waiting" });
    } else {
      steps.push(missing.length
        ? { key: "returns", stage: "after", label: "Download the statutory returns", detail: `Not downloaded yet: ${missing.map((k) => FILING_LABEL[k]).join(", ")}.`, state: "todo", href: "/admin/reports", cta: "GO TO REPORTS" }
        : { key: "returns", stage: "after", label: "Statutory returns", detail: "All four downloaded.", state: "done" });
      steps.push(missing.length
        ? { key: "filed", stage: "after", label: "Submit the returns and confirm them", detail: "After downloading, upload each return and confirm it in Filings.", state: "waiting" }
        : unfiled.length
          ? { key: "filed", stage: "after", label: "Confirm the returns as filed", detail: `Upload ${unfiled.map((k) => FILING_LABEL[k]).join(", ")} to the authorities, then confirm each one in Filings.`, state: "todo", href: "/admin/filings", cta: "GO TO FILINGS" }
          : { key: "filed", stage: "after", label: "Returns filed", detail: "All four confirmed.", state: "done" });
    }

    const nextStep = steps.find((s) => s.state === "todo") ?? null;
    res.json({ period, periodLabel: label, runId: run?.id ?? null, runStatus: run?.status ?? null, steps, next: nextStep });
  } catch (err) { next(err); }
});

export default router;
