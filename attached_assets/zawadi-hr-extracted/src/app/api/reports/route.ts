import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { payrollRuns, payslips, employees } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { fromCents, type Cents } from "@/lib/money";

/**
 * On-screen reports (the downloadable statutory FILES live at
 * /api/payroll/[id]/filings and the payment files at /api/payroll/[id]/payouts).
 *
 * All money cells are returned as decimal strings ("12345.67") so the client
 * renders them directly and CSV export stays exact — never as floats.
 */
export const GET = route({ permission: "report:read" }, async ({ principal, req }) =>
  withTenant(principal.orgId, async (tx) => {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "paye";
    let runId = Number(searchParams.get("runId") || 0);

    if (!runId) {
      const [latest] = await tx.select().from(payrollRuns)
        .where(eq(payrollRuns.orgId, principal.orgId))
        .orderBy(desc(payrollRuns.period)).limit(1);
      if (!latest) throw new HttpError(404, "No payroll run found. Process payroll first.");
      runId = latest.id;
    }

    const [run] = await tx.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, principal.orgId)));
    if (!run) throw new HttpError(404, "Run not found");

    const rows = await tx
      .select({ p: payslips, e: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, principal.orgId)));

    const name = (r: (typeof rows)[number]) => `${r.e.firstName} ${r.e.lastName}`;
    const M = fromCents; // cents -> "1234.56"

    let columns: string[] = [];
    let data: (string | number)[][] = [];
    let moneyCols: number[] = []; // indices summed in the totals row
    let title = "";

    switch (type) {
      case "paye":
        title = `PAYE Return (P10) — ${run.name}`;
        columns = ["KRA PIN", "Employee", "Gross Pay", "Taxable Pay", "PAYE Before Relief", "Personal Relief", "Insurance Relief", "PAYE Payable"];
        moneyCols = [2, 3, 4, 5, 6, 7];
        data = rows.map((r) => [r.e.kraPin || "-", name(r), M(r.p.gross), M(r.p.taxableIncome), M(r.p.payeBeforeRelief), M(r.p.personalRelief), M(r.p.insuranceRelief), M(r.p.paye)]);
        break;
      case "nssf":
        title = `NSSF Contribution Return — ${run.name}`;
        columns = ["NSSF No", "Employee", "Pensionable Pay", "Tier I", "Tier II", "Employee Total", "Employer Total", "Combined"];
        moneyCols = [2, 3, 4, 5, 6, 7];
        data = rows.map((r) => {
          const bd = (r.p.breakdown || {}) as { nssfTier1?: Cents; nssfTier2?: Cents };
          return [r.e.nssfNo || "-", name(r), M(r.p.gross), M(bd.nssfTier1 ?? 0), M(bd.nssfTier2 ?? 0), M(r.p.nssfEmployee), M(r.p.nssfEmployer), M(r.p.nssfEmployee + r.p.nssfEmployer)];
        });
        break;
      case "shif":
        title = `SHIF Contribution Return — ${run.name}`;
        columns = ["SHIF No", "Employee", "National ID", "Gross Pay", "SHIF"];
        moneyCols = [3, 4];
        data = rows.map((r) => [r.e.shifNo || "-", name(r), r.e.nationalId || "-", M(r.p.gross), M(r.p.shif)]);
        break;
      case "housing":
        title = `Affordable Housing Levy Return — ${run.name}`;
        columns = ["KRA PIN", "Employee", "Gross Pay", "Employee AHL", "Employer AHL", "Total AHL"];
        moneyCols = [2, 3, 4, 5];
        data = rows.map((r) => [r.e.kraPin || "-", name(r), M(r.p.gross), M(r.p.housingLevyEmployee), M(r.p.housingLevyEmployer), M(r.p.housingLevyEmployee + r.p.housingLevyEmployer)]);
        break;
      case "bank":
        title = `Bank Payment Schedule — ${run.name}`;
        columns = ["Employee", "Bank", "Account No", "Net Pay", "Reference"];
        moneyCols = [3];
        data = rows.map((r) => [name(r), r.e.bankName || "-", r.e.bankAccount || "-", M(r.p.netPay), `SAL-${run.period}-${r.e.empNo}`]);
        break;
      case "p9":
        title = `P9 Tax Deduction Card Summary — ${run.name}`;
        columns = ["Employee", "KRA PIN", "Basic", "Benefits", "Gross", "Pension/NSSF", "Taxable", "PAYE Charged", "Reliefs", "PAYE Deducted"];
        moneyCols = [2, 3, 4, 5, 6, 7, 8, 9];
        data = rows.map((r) => [name(r), r.e.kraPin || "-", M(r.p.basic), M(r.p.allowances), M(r.p.gross), M(r.p.nssfEmployee + r.p.pension), M(r.p.taxableIncome), M(r.p.payeBeforeRelief), M(r.p.personalRelief + r.p.insuranceRelief), M(r.p.paye)]);
        break;
      case "muster": {
        /* Muster roll: the statutory attendance-and-pay register the labour
         * office asks for on inspection, with a signature column for cash/
         * witnessed payment acknowledgement. */
        title = `Muster Roll — ${run.name}`;
        columns = ["Emp No", "Employee", "National ID", "Position", "Days", "Gross", "Total Deductions", "Net Pay", "Signature"];
        moneyCols = [5, 6, 7];
        data = rows.map((r) => [
          r.e.empNo, name(r), r.e.nationalId || "-", r.e.position,
          `${r.p.daysPayable}/${r.p.daysInPeriod}`,
          M(r.p.gross), M(r.p.totalDeductions), M(r.p.netPay), "",
        ]);
        break;
      }
      case "journal": {
        title = `Payroll Journal / GL Posting — ${run.name}`;
        columns = ["Account", "Description", "Debit", "Credit"];
        moneyCols = [2, 3];
        const sum = (f: (p: (typeof rows)[number]["p"]) => Cents): Cents => rows.reduce((a, r) => a + f(r.p), 0);
        const basic = sum((p) => p.basic);
        const allow = sum((p) => p.allowances + p.overtime + p.adjustmentEarnings);
        const nssfEr = sum((p) => p.nssfEmployer);
        const ahlEr = sum((p) => p.housingLevyEmployer);
        const paye = sum((p) => p.paye);
        const nssfAll = sum((p) => p.nssfEmployee + p.nssfEmployer);
        const shif = sum((p) => p.shif);
        const ahlAll = sum((p) => p.housingLevyEmployee + p.housingLevyEmployer);
        const helb = sum((p) => p.helb);
        const sacco = sum((p) => p.sacco);
        const loanRec = sum((p) => p.loanDeduction);
        const pension = sum((p) => p.pension);
        const net = sum((p) => p.netPay);
        data = [
          ["6100-01", "Basic Salaries Expense", M(basic), M(0)],
          ["6100-02", "Allowances & Overtime Expense", M(allow), M(0)],
          ["6100-03", "Employer NSSF Expense", M(nssfEr), M(0)],
          ["6100-04", "Employer Housing Levy Expense", M(ahlEr), M(0)],
          ["2200-01", "PAYE Payable (KRA)", M(0), M(paye)],
          ["2200-02", "NSSF Payable", M(0), M(nssfAll)],
          ["2200-03", "SHIF Payable", M(0), M(shif)],
          ["2200-04", "Housing Levy Payable", M(0), M(ahlAll)],
          ["2200-05", "HELB Payable", M(0), M(helb)],
          ["2200-06", "SACCO Remittances", M(0), M(sacco)],
          ["2200-07", "Loan Recoveries", M(0), M(loanRec)],
          ["2200-08", "Pension Payable", M(0), M(pension)],
          ["2100-01", "Net Salaries Payable", M(0), M(net)],
        ];
        break;
      }
      default:
        throw new HttpError(400, "Unknown report type");
    }

    /* Totals: sum money columns in integer cents, then format — never sum the
     * formatted strings or floats. */
    const totals = columns.map((_, ci) => {
      if (!moneyCols.includes(ci)) return "";
      const cents = data.reduce((a, row) => {
        const v = String(row[ci]);
        return a + Math.round(Number(v) * 100);
      }, 0);
      return fromCents(cents);
    });

    return NextResponse.json({ title, run, columns, rows: data, totals });
  }),
);
