import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import dashboardRouter from "./dashboard.js";
import employeesRouter from "./employees.js";
import payrollRouter from "./payroll.js";
import leavesRouter from "./leaves.js";
import timesheetsRouter from "./timesheets.js";
import loansRouter from "./loans.js";
import auditRouter from "./audit.js";
import calculatorRouter from "./calculator.js";
import publicRouter from "./public.js";
import portalRouter from "./portal.js";
import usersRouter from "./users.js";
import superRouter from "./super.js";
import settingsRouter from "./settings.js";
import billingRouter from "./billing.js";
import filingsRouter from "./filings.js";
import notificationsRouter from "./notifications.js";
import departmentsRouter from "./departments.js";
import { HttpError } from "../lib/http-error.js";
import { requireActiveAccess } from "../middlewares/require-auth.js";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();

router.use(healthRouter);
// Unauthenticated, for the marketing site. Mounted before everything that
// assumes a principal so it is obvious nothing here is tenant-scoped.
router.use("/public", publicRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
// Feature routers: locked (402 ACCESS_EXPIRED) once organizations.access_until
// has passed. See docs/design/super-admin-org-lifecycle.md §2 for what is and
// isn't gated — billing, settings reads, and auth stay open on purpose.
router.use("/employees", requireActiveAccess(), employeesRouter);
router.use("/payroll", requireActiveAccess(), payrollRouter);
router.use("/leaves", requireActiveAccess(), leavesRouter);
router.use("/timesheets", requireActiveAccess(), timesheetsRouter);
router.use("/loans", requireActiveAccess(), loansRouter);
router.use("/audit", auditRouter);
router.use("/calculator", calculatorRouter);
router.use("/portal", portalRouter);
router.use("/users", usersRouter);
router.use("/super", superRouter);
router.use("/settings", settingsRouter);
router.use("/billing", billingRouter);
// Reads payrollRuns and confirms/submits statutory filings derived from
// them — the same kind of core, paid-for compliance work as /payroll
// itself, which is gated. This one was simply missing from the list.
router.use("/filings", requireActiveAccess(), filingsRouter);
router.use("/notifications", notificationsRouter);
router.use("/departments", requireActiveAccess(), departmentsRouter);

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
