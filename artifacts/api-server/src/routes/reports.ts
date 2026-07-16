import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { fromCents } from "../lib/money.js";
import { HttpError } from "../lib/http-error.js";
import type { Cents } from "../lib/money.js";

const router = Router();

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

    const rows = await db
      .select({ p: payslips, e: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));

    const name = (r: (typeof rows)[number]) => `${r.e.firstName} ${r.e.lastName}`;
    const M = fromCents;

    let columns: string[] = [];
    let data: (string | number)[][] = [];
    let moneyCols: number[] = [];
    let title = "";

    switch (type) {
      case "paye":
        title = `PAYE Return (P10) — ${run.name}`;
        columns = ["KRA PIN","Employee","Gross Pay","Taxable Pay","PAYE Before Relief","Personal Relief","Insurance Relief","PAYE Payable"];
        moneyCols = [2,3,4,5,6,7];
        data = rows.map((r) => [r.e.kraPin||"-", name(r), M(r.p.gross), M(r.p.taxableIncome), M(r.p.payeBeforeRelief), M(r.p.personalRelief), M(r.p.insuranceRelief), M(r.p.paye)]);
        break;
      case "nssf":
        title = `NSSF Contribution Return — ${run.name}`;
        columns = ["NSSF No","Employee","Pensionable Pay","Tier I","Tier II","Employee Total","Employer Total","Combined"];
        moneyCols = [2,3,4,5,6,7];
        data = rows.map((r) => {
          const bd = (r.p.breakdown||{}) as { nssfTier1?: Cents; nssfTier2?: Cents };
          return [r.e.nssfNo||"-", name(r), M(r.p.gross), M(bd.nssfTier1??0), M(bd.nssfTier2??0), M(r.p.nssfEmployee), M(r.p.nssfEmployer), M(r.p.nssfEmployee+r.p.nssfEmployer)];
        });
        break;
      case "shif":
        title = `SHIF Contribution Return — ${run.name}`;
        columns = ["SHIF No","Employee","National ID","Gross Pay","SHIF"];
        moneyCols = [3,4];
        data = rows.map((r) => [r.e.shifNo||"-", name(r), r.e.nationalId||"-", M(r.p.gross), M(r.p.shif)]);
        break;
      case "housing":
        title = `Affordable Housing Levy Return — ${run.name}`;
        columns = ["KRA PIN","Employee","Gross Pay","Employee AHL","Employer AHL","Total AHL"];
        moneyCols = [2,3,4,5];
        data = rows.map((r) => [r.e.kraPin||"-", name(r), M(r.p.gross), M(r.p.housingLevyEmployee), M(r.p.housingLevyEmployer), M(r.p.housingLevyEmployee+r.p.housingLevyEmployer)]);
        break;
      case "bank":
        title = `Bank Payment Schedule — ${run.name}`;
        columns = ["Employee","Bank","Account No","Net Pay","Branch Code"];
        moneyCols = [3];
        data = rows.filter((r) => r.e.payMethod === "bank")
          .map((r) => [name(r), r.e.bankName||"-", r.e.bankAccount||"-", M(r.p.netPay), r.e.bankBranchCode||"-"]);
        break;
      case "p9":
        title = `P9 Annual Tax Certificate — ${run.name.split(" ").slice(-1)[0] || ""}`;
        columns = ["Employee","KRA PIN","Gross Pay","PAYE","Personal Relief","Net Tax"];
        moneyCols = [2,3,4,5];
        data = rows.map((r) => [name(r), r.e.kraPin||"-", M(r.p.gross), M(r.p.payeBeforeRelief), M(r.p.personalRelief), M(r.p.paye)]);
        break;
      case "muster":
        title = `Muster Roll — ${run.name}`;
        columns = ["Emp No","Employee","Position","Days","Gross","Deductions","Net"];
        moneyCols = [4,5,6];
        data = rows.map((r) => [r.e.empNo, name(r), r.e.position, r.p.daysPayable, M(r.p.gross), M(r.p.totalDeductions), M(r.p.netPay)]);
        break;
      case "gl":
        title = `GL Journal — ${run.name}`;
        columns = ["Account","Description","Debit","Credit"];
        moneyCols = [2,3];
        data = [
          ["5000","Salaries & Wages", M(run.grossTotal), "0"],
          ["2101","PAYE Payable", "0", M(run.payeTotal)],
          ["2102","NSSF Payable", "0", M(run.nssfEmployeeTotal)],
          ["2103","SHIF Payable", "0", M(run.shifTotal)],
          ["2104","AHL Payable", "0", M(run.housingLevyEmployeeTotal)],
          ["1001","Bank / Cash", "0", M(run.netTotal)],
        ];
        break;
      default:
        throw new HttpError(400, `Unknown report type: ${type}`);
    }

    const totals = columns.map((_, ci) => {
      if (!moneyCols.includes(ci)) return "";
      const cents = data.reduce((a, row) => {
        const v = String(row[ci]);
        return a + Math.round(Number(v) * 100);
      }, 0);
      return fromCents(cents);
    });

    res.json({ title, run, columns, rows: data, totals });
  } catch (err) { next(err); }
});

export default router;
