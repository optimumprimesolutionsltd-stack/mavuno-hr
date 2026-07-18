import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import dashboardRouter from "./dashboard.js";
import employeesRouter from "./employees.js";
import payrollRouter from "./payroll.js";
import leavesRouter from "./leaves.js";
import timesheetsRouter from "./timesheets.js";
import loansRouter from "./loans.js";
import reportsRouter from "./reports.js";
import auditRouter from "./audit.js";
import calculatorRouter from "./calculator.js";
import portalRouter from "./portal.js";
import usersRouter from "./users.js";
import superRouter from "./super.js";
import { HttpError } from "../lib/http-error.js";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
router.use("/employees", employeesRouter);
router.use("/payroll", payrollRouter);
router.use("/leaves", leavesRouter);
router.use("/timesheets", timesheetsRouter);
router.use("/loans", loansRouter);
router.use("/reports", reportsRouter);
router.use("/audit", auditRouter);
router.use("/calculator", calculatorRouter);
router.use("/portal", portalRouter);
router.use("/users", usersRouter);
router.use("/super", superRouter);

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
