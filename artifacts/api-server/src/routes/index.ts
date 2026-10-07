import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import dashboardRouter from "./dashboard.js";
import employeesRouter from "./employees.js";
import employeeDocumentsRouter from "./employee-documents.js";
import payrollRouter from "./payroll.js";
import leavesRouter from "./leaves.js";
import timesheetsRouter from "./timesheets.js";
import loansRouter from "./loans.js";
import auditRouter from "./audit.js";
import calculatorRouter from "./calculator.js";
import publicRouter from "./public.js";
import portalRouter from "./portal.js";
import attendanceRouter from "./attendance.js";
import portalAttendanceRouter from "./portal-attendance.js";
import usersRouter from "./users.js";
import superRouter from "./super.js";
import settingsRouter from "./settings.js";
import billingRouter from "./billing.js";
import filingsRouter from "./filings.js";
import notificationsRouter from "./notifications.js";
import departmentsRouter from "./departments.js";
import { HttpError } from "../lib/http-error.js";
import { requirePaidForPayroll } from "../middlewares/require-auth.js";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();

router.use(healthRouter);
// Unauthenticated, for the marketing site. Mounted before everything that
// assumes a principal so it is obvious nothing here is tenant-scoped.
router.use("/public", publicRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
// Non-payment rule (owner's decision, Oct 2026): once access_until has passed
// the company keeps using its account -- HR records stay fully usable -- but
// payroll cannot be run until it pays. Only payroll processing is gated
// (402 PAYROLL_LOCKED on writes); reading past runs and payslips stays open.
router.use("/employees", employeesRouter);
router.use("/employees", employeeDocumentsRouter);
router.use("/payroll", requirePaidForPayroll(), payrollRouter);
router.use("/leaves", leavesRouter);
router.use("/timesheets", timesheetsRouter);
router.use("/attendance", attendanceRouter);
router.use("/loans", loansRouter);
router.use("/audit", auditRouter);
router.use("/calculator", calculatorRouter);
router.use("/portal/attendance", portalAttendanceRouter);
router.use("/portal", portalRouter);
router.use("/users", usersRouter);
router.use("/super", superRouter);
router.use("/settings", settingsRouter);
router.use("/billing", billingRouter);
// Reads payrollRuns and confirms/submits statutory filings derived from
// them — the same kind of core, paid-for compliance work as /payroll
// itself, which is gated. This one was simply missing from the list.
router.use("/filings", requirePaidForPayroll(), filingsRouter);
router.use("/notifications", notificationsRouter);
router.use("/departments", departmentsRouter);

// Global error handler
router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
});

export default router;
