import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import type { Cents } from "../lib/money.js";
import type { StatutoryConfig } from "../lib/statutory-types.js";

const router = Router();

/**
 * All money values in rows/totals are returned as raw integer cents.
 * The frontend calls formatMoney(cell) directly — no extra ×100 needed.
 */
router.get("/", requireAuth("report:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const type = (req.query.type as string) || "paye";
    let runId = Number(req.query.runId || 0);

    if (!runId) {
      const [latest] = await db.select().from(payrollRuns)
        .where(eq(payrollRuns.orgId, p.orgId))
        .orderBy(desc(payrollRuns.period)).limit(1);
      if (!latest) throw new HttpError(404, "No payroll run found. Process payroll first.");
      runId = latest.id;
    }

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Run not found");

    const snap = (run.statutorySnapshot ?? {}) as StatutoryConfig;
    const tier2Provider: "nssf" | "private" = snap?.socialSecurity?.tier2Provider ?? "nssf";
    const tier2ProviderName = snap?.socialSecurity?.tier2ProviderName ?? "Private Pension Fund";

    const rows = await db
      .select({ p: payslips, e: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));

    const name = (r: (typeof rows)[number]) => `${r.e.firstName} ${r.e.lastName}`;

    let columns: string[] = [];
    let data: (string | number)[][] = [];
    let moneyCols: number[] = [];
    let title = "";

    switch (type) {
      // ── P10 PAYE Return ──────────────────────────────────────────────────────
      case "paye":
        title = `PAYE Return (P10) — ${run.name}`;
        columns = ["KRA PIN", "Employee", "Gross Pay", "Taxable Pay", "PAYE Before Relief", "Personal Relief", "Insurance Relief", "PAYE Payable"];
        moneyCols = [2, 3, 4, 5, 6, 7];
        data = rows.map((r) => [
          r.e.kraPin || "-", name(r),
          r.p.gross, r.p.taxableIncome, r.p.payeBeforeRelief, r.p.personalRelief, r.p.insuranceRelief, r.p.paye,
        ]);
        break;

      // ── NSSF Return ──────────────────────────────────────────────────────────
      case "nssf": {
        const bd = (r: (typeof rows)[number]) =>
          (r.p.breakdown || {}) as {
            nssfTier1?: Cents; nssfTier2?: Cents;
            nssfTier1Employer?: Cents; nssfTier2Employer?: Cents;
          };

        if (tier2Provider === "private") {
          // Only Tier I goes to NSSF; Tier II goes to the private fund
          title = `NSSF Contribution Return (Tier I) — ${run.name}`;
          columns = ["NSSF No", "Employee", "Pensionable Pay", "Tier I — Employee", "Tier I — Employer", "Combined Tier I"];
          moneyCols = [2, 3, 4, 5];
          data = rows.map((r) => {
            const b = bd(r);
            const t1Emp = b.nssfTier1 ?? 0;
            const t1Emr = b.nssfTier1Employer ?? 0;
            return [r.e.nssfNo || "-", name(r), r.p.gross, t1Emp, t1Emr, t1Emp + t1Emr];
          });
        } else {
          // Standard NSSF — Tier I + Tier II both go to NSSF
          title = `NSSF Contribution Return — ${run.name}`;
          columns = ["NSSF No", "Employee", "Pensionable Pay", "Tier I", "Tier II", "Employee Total", "Employer Total", "Combined"];
          moneyCols = [2, 3, 4, 5, 6, 7];
          data = rows.map((r) => {
            const b = bd(r);
            return [
              r.e.nssfNo || "-", name(r), r.p.gross,
              b.nssfTier1 ?? 0, b.nssfTier2 ?? 0,
              r.p.nssfEmployee, r.p.nssfEmployer,
              r.p.nssfEmployee + r.p.nssfEmployer,
            ];
          });
        }
        break;
      }

      // ── Private Pension Fund Return (Tier II) ────────────────────────────────
      case "pension": {
        const bd = (r: (typeof rows)[number]) =>
          (r.p.breakdown || {}) as { nssfTier2?: Cents; nssfTier2Employer?: Cents };

        title = `${tier2ProviderName} — Pension Contribution Return — ${run.name}`;
        columns = ["Employee", "KRA PIN", "Pensionable Pay", "Employee Contribution", "Employer Contribution", "Total"];
        moneyCols = [2, 3, 4, 5];
        data = rows.map((r) => {
          const b = bd(r);
          const eEmp = (b.nssfTier2 ?? 0) + r.p.pension;          // NSSF Tier2 + voluntary
          const eEmr = (b.nssfTier2Employer ?? 0) + r.p.pensionEmployer;
          return [name(r), r.e.kraPin || "-", r.p.gross, eEmp, eEmr, eEmp + eEmr];
        });
        break;
      }

      // ── SHIF Return ───────────────────────────────────────────────────────────
      case "shif":
        title = `SHIF Contribution Return — ${run.name}`;
        columns = ["SHIF No", "Employee", "National ID", "Gross Pay", "SHIF"];
        moneyCols = [3, 4];
        data = rows.map((r) => [r.e.shifNo || "-", name(r), r.e.nationalId || "-", r.p.gross, r.p.shif]);
        break;

      // ── Affordable Housing Levy ───────────────────────────────────────────────
      case "housing":
        title = `Affordable Housing Levy Return — ${run.name}`;
        columns = ["KRA PIN", "Employee", "Gross Pay", "Employee AHL", "Employer AHL", "Total AHL"];
        moneyCols = [2, 3, 4, 5];
        data = rows.map((r) => [
          r.e.kraPin || "-", name(r), r.p.gross,
          r.p.housingLevyEmployee, r.p.housingLevyEmployer,
          r.p.housingLevyEmployee + r.p.housingLevyEmployer,
        ]);
        break;

      // ── Bank Schedule ─────────────────────────────────────────────────────────
      case "bank":
        title = `Bank Payment Schedule — ${run.name}`;
        columns = ["Employee", "Bank", "Account No", "Branch Code", "Net Pay"];
        moneyCols = [4];
        data = rows
          .filter((r) => r.e.payMethod === "bank")
          .map((r) => [name(r), r.e.bankName || "-", r.e.bankAccount || "-", r.e.bankBranchCode || "-", r.p.netPay]);
        break;

      // ── P9 Annual Tax Certificate ─────────────────────────────────────────────
      case "p9":
        title = `P9 Annual Tax Certificate — ${run.name.split(" ").slice(-1)[0] || ""}`;
        columns = ["Employee", "KRA PIN", "Gross Pay", "PAYE", "Personal Relief", "Net PAYE"];
        moneyCols = [2, 3, 4, 5];
        data = rows.map((r) => [name(r), r.e.kraPin || "-", r.p.gross, r.p.payeBeforeRelief, r.p.personalRelief, r.p.paye]);
        break;

      // ── Muster Roll — every deduction as its own column ──────────────────────
      case "muster":
        title = `Muster Roll — ${run.name}`;
        columns = [
          "Emp No", "Employee", "Position", "Days",
          // Earnings
          "Basic", "Allowances", "Gross",
          // Statutory deductions
          "PAYE", "NSSF", "SHIF", "Housing Levy",
          // Non-statutory deductions
          "Pension", "HELB", "SACCO", "Loan", "Other Deduct.",
          // Totals
          "Total Deductions", "Net Pay",
        ];
        moneyCols = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
        data = rows.map((r) => [
          r.e.empNo, name(r), r.e.position || "-", r.p.daysPayable,
          r.p.basic, r.p.allowances, r.p.gross,
          r.p.paye, r.p.nssfEmployee, r.p.shif, r.p.housingLevyEmployee,
          r.p.pension, r.p.helb, r.p.sacco, r.p.loanDeduction, r.p.adjustmentDeductions,
          r.p.totalDeductions, r.p.netPay,
        ]);
        break;

      // ── GL Journal ────────────────────────────────────────────────────────────
      case "gl":
        title = `GL Journal — ${run.name}`;
        columns = ["Account", "Description", "Debit", "Credit"];
        moneyCols = [2, 3];
        data = [
          ["5000", "Salaries & Wages",          run.grossTotal,            0],
          ["2101", "PAYE Payable",               0,                         run.payeTotal],
          ["2102", "NSSF Payable",               0,                         run.nssfEmployeeTotal],
          ["2103", "SHIF Payable",               0,                         run.shifTotal],
          ["2104", "AHL Payable",                0,                         run.housingLevyEmployeeTotal],
          ["1001", "Bank / Cash",                0,                         run.netTotal],
        ];
        break;

      // ── M-Pesa Bulk Disbursement ──────────────────────────────────────────────
      case "mpesa": {
        const mpesaRows = rows.filter((r) => r.e.payMethod === "mpesa" || r.e.mpesaPhone);
        const bankRows  = rows.filter((r) => r.e.payMethod !== "mpesa" && !r.e.mpesaPhone);
        title = `M-Pesa Bulk Disbursement — ${run.name}`;
        columns = ["CommandID", "Amount (KES)", "PhoneNumber", "AccountReference", "Remarks"];
        moneyCols = [1];
        data = mpesaRows.map((r) => [
          "SalaryPayment",
          r.p.netPay,
          (r.e.mpesaPhone || "").replace(/^\+254/, "254").replace(/^0/, "254"),
          `${r.e.empNo}-${r.e.firstName}`,
          `${run.period} Salary`,
        ]);
        if (bankRows.length > 0 && mpesaRows.length === 0) {
          // All employees use bank — surface them with a note
          data = [["NOTE", 0, "", "No M-Pesa employees in this run", `${bankRows.length} employee(s) use bank transfer`]];
        }
        break;
      }

      // ── Cheque / Cash list ────────────────────────────────────────────────────
      case "cash":
        title = `Cash/Cheque Payment List — ${run.name}`;
        columns = ["Emp No", "Employee", "ID / Passport", "Net Pay", "Signature"];
        moneyCols = [3];
        data = rows
          .filter((r) => r.e.payMethod === "cash" || r.e.payMethod === "cheque")
          .map((r) => [r.e.empNo, name(r), r.e.nationalId || "-", r.p.netPay, ""]);
        if (data.length === 0) data = rows.map((r) => [r.e.empNo, name(r), r.e.nationalId || "-", r.p.netPay, ""]);
        break;

      default:
        throw new HttpError(400, `Unknown report type: ${type}`);
    }

    // Totals: sum raw cent integers per money column
    const totals: (string | number)[] = columns.map((_, ci) => {
      if (!moneyCols.includes(ci)) return "";
      return data.reduce((sum, row) => sum + (Number(row[ci]) || 0), 0);
    });

    res.json({ title, run, columns, rows: data, totals, tier2Provider, tier2ProviderName });
  } catch (err) { next(err); }
});

export default router;
