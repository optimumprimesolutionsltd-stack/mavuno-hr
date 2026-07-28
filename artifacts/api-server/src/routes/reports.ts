import { Router } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payslips, employees, organizations, statutoryFilings, departments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import type { Cents } from "../lib/money.js";
import type { StatutoryConfig } from "../lib/statutory-types.js";
import { generateP10Pdf, type P10CardData } from "../lib/pdf-p10.js";
import { generateP9Pdf } from "../lib/pdf-p9.js";
import { fullName } from "../lib/employee-name.js";

const router = Router();

// ── GET /departments?runId=X — Department cost breakdown ─────────────────────
router.get("/departments", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const runId = Number(req.query.runId || 0);
    if (!runId) throw new HttpError(400, "runId is required");

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, p.orgId)));
    if (!run) throw new HttpError(404, "Run not found");

    // Fetch all payslips with employee and department for this run
    const rows = await db
      .select({
        departmentId: employees.departmentId,
        gross: payslips.gross,
        paye: payslips.paye,
        nssfEmployee: payslips.nssfEmployee,
        netPay: payslips.netPay,
      })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));

    // Load departments for name lookup
    const deptList = await db.select().from(departments)
      .where(eq(departments.orgId, p.orgId));
    const deptMap = new Map(deptList.map((d) => [d.id, d]));

    // Aggregate by departmentId
    const aggMap = new Map<string, {
      departmentId: number | null;
      departmentName: string;
      employeeCount: number;
      grossTotal: number;
      payeTotal: number;
      nssfTotal: number;
      netTotal: number;
    }>();

    for (const row of rows) {
      const key = row.departmentId != null ? String(row.departmentId) : "__unassigned__";
      const dept = row.departmentId != null ? deptMap.get(row.departmentId) : undefined;
      const deptName = dept?.name ?? "Unassigned";

      const existing = aggMap.get(key);
      if (existing) {
        existing.employeeCount += 1;
        existing.grossTotal += row.gross ?? 0;
        existing.payeTotal += row.paye ?? 0;
        existing.nssfTotal += row.nssfEmployee ?? 0;
        existing.netTotal += row.netPay ?? 0;
      } else {
        aggMap.set(key, {
          departmentId: row.departmentId ?? null,
          departmentName: deptName,
          employeeCount: 1,
          grossTotal: row.gross ?? 0,
          payeTotal: row.paye ?? 0,
          nssfTotal: row.nssfEmployee ?? 0,
          netTotal: row.netPay ?? 0,
        });
      }
    }

    const result = Array.from(aggMap.values()).sort((a, b) => b.grossTotal - a.grossTotal);
    res.json(result);
  } catch (err) { next(err); }
});

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
      .select({ p: payslips, e: employees, d: departments })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(payslips.runId, runId), eq(payslips.orgId, p.orgId)));

    const name = (r: (typeof rows)[number]) => fullName(r.e);

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

      // ── Advanced Payroll Analysis — decision-ready payroll cost view ───────────
      case "advanced": {
        title = `Advanced Payroll Analysis — ${run.name}`;
        columns = [
          "Emp No", "Employee", "Department", "Salary Basis",
          "Basic Salary", "Allowances", "Gross Pay",
          "PAYE", "NSSF", "SHIF", "AHL", "Other Deductions",
          "Total Deductions", "Net Pay", "Employer Cost", "Net %",
        ];
        moneyCols = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        data = rows.map((r) => {
          const gross = r.p.gross || 0;
          const net = r.p.netPay || 0;
          const statutory = (r.p.paye || 0) + (r.p.nssfEmployee || 0) + (r.p.shif || 0) + (r.p.housingLevyEmployee || 0);
          const other = Math.max(0, (r.p.totalDeductions || 0) - statutory);
          const netPercent = gross > 0 ? Math.round((net / gross) * 10000) / 100 : 0;
          return [
            r.e.empNo, name(r), r.d?.name || "Unassigned",
            r.e.salaryBasis === "net" ? "Net / grossed-up" : "Gross",
            r.p.basic, r.p.allowances, gross, r.p.paye, r.p.nssfEmployee,
            r.p.shif, r.p.housingLevyEmployee, other, r.p.totalDeductions,
            net, r.p.employerCost, netPercent,
          ];
        });
        break;
      }

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
    if (type === "advanced" && data.length > 0) {
      const grossTotal = data.reduce((sum, row) => sum + (Number(row[6]) || 0), 0);
      const netTotal = data.reduce((sum, row) => sum + (Number(row[13]) || 0), 0);
      totals[15] = grossTotal > 0 ? Math.round((netTotal / grossTotal) * 10000) / 100 : 0;
    }

    res.json({ title, run, columns, rows: data, totals, tier2Provider, tier2ProviderName });
  } catch (err) { next(err); }
});

// ── GET /itax/p9?year=YYYY — KRA iTax P9 annual tax certificate ─────────────
router.get("/itax/p9", requireAuth("report:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const year = String(req.query.year ?? new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) throw new HttpError(422, "Invalid year parameter");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    // All paid runs in the given calendar year for this org
    const allRuns = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, p.orgId), eq(payrollRuns.status, "paid")));
    const yearRuns = allRuns.filter((r) => r.period.startsWith(year));

    if (yearRuns.length === 0) {
      return res.json({
        rows: [], warnings: [],
        orgKraPin: org?.kraPin ?? "", orgName: org?.name ?? "",
        year, totalPaye: 0, monthsIncluded: 0,
      });
    }

    const runIds = yearRuns.map((r) => r.id);
    const allSlips = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.orgId, p.orgId), inArray(payslips.runId, runIds)));

    // Aggregate per employee
    const byEmp = new Map<number, {
      emp: typeof allSlips[0]["emp"];
      gross: number; benefits: number; mortgageInterest: number;
      definedContribution: number; chargeablePay: number;
      taxChargeable: number; personalRelief: number;
      insuranceRelief: number; netPaye: number;
    }>();

    for (const { slip, emp } of allSlips) {
      const existing = byEmp.get(emp.id);
      if (existing) {
        existing.gross += slip.gross;
        existing.benefits += slip.nonCashBenefit;
        existing.mortgageInterest += slip.mortgageInterest;
        existing.definedContribution += slip.nssfEmployee + slip.pension;
        existing.chargeablePay += slip.taxableIncome;
        existing.taxChargeable += slip.payeBeforeRelief;
        existing.personalRelief += slip.personalRelief;
        existing.insuranceRelief += slip.insuranceRelief;
        existing.netPaye += slip.paye;
      } else {
        byEmp.set(emp.id, {
          emp,
          gross: slip.gross,
          benefits: slip.nonCashBenefit,
          mortgageInterest: slip.mortgageInterest,
          definedContribution: slip.nssfEmployee + slip.pension,
          chargeablePay: slip.taxableIncome,
          taxChargeable: slip.payeBeforeRelief,
          personalRelief: slip.personalRelief,
          insuranceRelief: slip.insuranceRelief,
          netPaye: slip.paye,
        });
      }
    }

    const warnings: string[] = [];
    const rows = Array.from(byEmp.values()).map(({ emp, ...totals }) => {
      const name = `${emp.firstName} ${emp.lastName}`;
      if (!emp.kraPin) warnings.push(`${emp.empNo} — ${name}: missing KRA PIN (row will be rejected by iTax)`);
      return {
        empNo: emp.empNo,
        kraPin: emp.kraPin ?? "",
        name,
        annualGross: totals.gross,
        benefits: totals.benefits,
        quarters: 0,
        annualTotalGross: totals.gross,
        annualMortgageInterest: totals.mortgageInterest,
        annualDefinedContribution: totals.definedContribution,
        annualChargeablePay: totals.chargeablePay,
        annualTaxChargeable: totals.taxChargeable,
        annualPersonalRelief: totals.personalRelief,
        annualInsuranceRelief: totals.insuranceRelief,
        annualNetPaye: totals.netPaye,
        missingPin: !emp.kraPin,
      };
    });

    const totalPaye = rows.reduce((s, r) => s + r.annualNetPaye, 0);

    // Record filing for P9 (no specific runId — use null)
    await db.insert(statutoryFilings).values({
      orgId: p.orgId, runId: null, kind: "P9", period: year,
      itemCount: rows.length, totalAmount: totalPaye,
      status: "downloaded", filedAt: new Date(),
    });

    res.json({
      rows, warnings,
      orgKraPin: org?.kraPin ?? "",
      orgName: org?.name ?? "",
      year,
      totalPaye,
      monthsIncluded: yearRuns.length,
    });
  } catch (err) { next(err); }
});

// ── GET /p10-pdf?year=YYYY — KRA P10 annual tax deduction cards per employee ─
router.get("/p10-pdf", requireAuth("report:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const year = String(req.query.year ?? new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) throw new HttpError(422, "Invalid year parameter");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const allRuns = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, p.orgId), eq(payrollRuns.status, "paid")));
    const yearRuns = allRuns.filter((r) => r.period.startsWith(year));
    if (yearRuns.length === 0) throw new HttpError(404, `No paid payroll runs found for ${year}`);

    const runIds = yearRuns.map((r) => r.id);
    const runPeriodMap = new Map(yearRuns.map((r) => [r.id, r.period]));
    const allSlips = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.orgId, p.orgId), inArray(payslips.runId, runIds)));

    type SlipAgg = {
      emp: typeof allSlips[0]["emp"];
      months: Map<string, {
        basic: number; benefits: number; quarters: number; grossPay: number;
        definedContribution: number; affordableHousingLevy: number; shif: number;
        postRetirementMedical: number; ownerOccupiedInterest: number; totalDeductions: number;
        chargeablePay: number; taxCharged: number; personalRelief: number;
        insuranceRelief: number; payeTax: number;
      }>;
    };

    const byEmp = new Map<number, SlipAgg>();
    for (const { slip, emp } of allSlips) {
      const period = runPeriodMap.get(slip.runId) ?? `${year}-01`;
      const month = period.slice(5, 7);
      const monthName = new Date(`${year}-${month}-01`).toLocaleString("en-US", { month: "long" });

      let entry = byEmp.get(emp.id);
      if (!entry) {
        entry = { emp, months: new Map() };
        byEmp.set(emp.id, entry);
      }

      let m = entry.months.get(monthName);
      if (!m) {
        m = {
          basic: 0, benefits: 0, quarters: 0, grossPay: 0,
          definedContribution: 0, affordableHousingLevy: 0, shif: 0,
          postRetirementMedical: 0, ownerOccupiedInterest: 0, totalDeductions: 0,
          chargeablePay: 0, taxCharged: 0, personalRelief: 0, insuranceRelief: 0, payeTax: 0,
        };
        entry.months.set(monthName, m);
      }

      m.basic += slip.basic;
      m.benefits += slip.nonCashBenefit;
      m.quarters += 0; // not tracked separately
      m.grossPay += slip.gross;
      m.definedContribution += slip.nssfEmployee + slip.pension;
      m.affordableHousingLevy += slip.housingLevyEmployee;
      m.shif += slip.shif;
      m.postRetirementMedical += 0; // not tracked separately
      m.ownerOccupiedInterest += slip.mortgageInterest;
      m.totalDeductions += slip.nssfEmployee + slip.pension + slip.housingLevyEmployee + slip.shif + slip.mortgageInterest;
      m.chargeablePay += slip.taxableIncome;
      m.taxCharged += slip.payeBeforeRelief;
      m.personalRelief += slip.personalRelief;
      m.insuranceRelief += slip.insuranceRelief;
      m.payeTax += slip.paye;
    }

    const cards: P10CardData[] = Array.from(byEmp.values()).map(({ emp, months }) => {
      const allMonths = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ].map((month) => {
        const m = months.get(month);
        return {
          month,
          basic: m?.basic ?? 0,
          benefits: m?.benefits ?? 0,
          quarters: m?.quarters ?? 0,
          grossPay: m?.grossPay ?? 0,
          definedContribution: m?.definedContribution ?? 0,
          affordableHousingLevy: m?.affordableHousingLevy ?? 0,
          shif: m?.shif ?? 0,
          postRetirementMedical: m?.postRetirementMedical ?? 0,
          ownerOccupiedInterest: m?.ownerOccupiedInterest ?? 0,
          totalDeductions: m?.totalDeductions ?? 0,
          chargeablePay: m?.chargeablePay ?? 0,
          taxCharged: m?.taxCharged ?? 0,
          personalRelief: m?.personalRelief ?? 0,
          insuranceRelief: m?.insuranceRelief ?? 0,
          payeTax: m?.payeTax ?? 0,
        };
      });

      const totals = allMonths.reduce((acc, m) => ({
        month: "TOTAL",
        basic: acc.basic + m.basic,
        benefits: acc.benefits + m.benefits,
        quarters: acc.quarters + m.quarters,
        grossPay: acc.grossPay + m.grossPay,
        definedContribution: acc.definedContribution + m.definedContribution,
        affordableHousingLevy: acc.affordableHousingLevy + m.affordableHousingLevy,
        shif: acc.shif + m.shif,
        postRetirementMedical: acc.postRetirementMedical + m.postRetirementMedical,
        ownerOccupiedInterest: acc.ownerOccupiedInterest + m.ownerOccupiedInterest,
        totalDeductions: acc.totalDeductions + m.totalDeductions,
        chargeablePay: acc.chargeablePay + m.chargeablePay,
        taxCharged: acc.taxCharged + m.taxCharged,
        personalRelief: acc.personalRelief + m.personalRelief,
        insuranceRelief: acc.insuranceRelief + m.insuranceRelief,
        payeTax: acc.payeTax + m.payeTax,
      }), {
        month: "TOTAL", basic: 0, benefits: 0, quarters: 0, grossPay: 0,
        definedContribution: 0, affordableHousingLevy: 0, shif: 0, postRetirementMedical: 0,
        ownerOccupiedInterest: 0, totalDeductions: 0, chargeablePay: 0, taxCharged: 0,
        personalRelief: 0, insuranceRelief: 0, payeTax: 0,
      });

      return {
        orgName: org?.name ?? "",
        orgKraPin: org?.kraPin ?? undefined,
        year,
        employee: {
          empNo: emp.empNo,
          firstName: emp.firstName,
          lastName: emp.lastName,
          otherNames: emp.middleName ?? undefined,
          kraPin: emp.kraPin ?? undefined,
        },
        months: allMonths,
        totals,
      };
    });

    // Record P10 filing
    await db.insert(statutoryFilings).values({
      orgId: p.orgId, runId: null, kind: "P10", period: year,
      itemCount: cards.length, totalAmount: cards.reduce((s, c) => s + c.totals.payeTax, 0),
      status: "downloaded", filedAt: new Date(),
    });

    const pdfBuffer = await generateP10Pdf(cards);
    const orgPin = (org?.kraPin ?? "ORG").replace(/[^A-Z0-9]/gi, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="P10_${year}_${orgPin}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── GET /p9-pdf?year=YYYY — KRA P9 annual tax return form PDF ─────────────────
router.get("/p9-pdf", requireAuth("report:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const year = String(req.query.year ?? new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) throw new HttpError(422, "Invalid year parameter");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId));

    const allRuns = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, p.orgId), eq(payrollRuns.status, "paid")));
    const yearRuns = allRuns.filter((r) => r.period.startsWith(year));
    if (yearRuns.length === 0) throw new HttpError(404, `No paid payroll runs found for ${year}`);

    const runIds = yearRuns.map((r) => r.id);
    const allSlips = await db.select({ slip: payslips, emp: employees })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(and(eq(payslips.orgId, p.orgId), inArray(payslips.runId, runIds)));

    const byEmp = new Map<number, {
      emp: typeof allSlips[0]["emp"];
      gross: number; benefits: number; mortgageInterest: number;
      definedContribution: number; chargeablePay: number;
      taxChargeable: number; personalRelief: number;
      insuranceRelief: number; netPaye: number;
    }>();

    for (const { slip, emp } of allSlips) {
      const existing = byEmp.get(emp.id);
      if (existing) {
        existing.gross += slip.gross;
        existing.benefits += slip.nonCashBenefit;
        existing.mortgageInterest += slip.mortgageInterest;
        existing.definedContribution += slip.nssfEmployee + slip.pension;
        existing.chargeablePay += slip.taxableIncome;
        existing.taxChargeable += slip.payeBeforeRelief;
        existing.personalRelief += slip.personalRelief;
        existing.insuranceRelief += slip.insuranceRelief;
        existing.netPaye += slip.paye;
      } else {
        byEmp.set(emp.id, {
          emp,
          gross: slip.gross,
          benefits: slip.nonCashBenefit,
          mortgageInterest: slip.mortgageInterest,
          definedContribution: slip.nssfEmployee + slip.pension,
          chargeablePay: slip.taxableIncome,
          taxChargeable: slip.payeBeforeRelief,
          personalRelief: slip.personalRelief,
          insuranceRelief: slip.insuranceRelief,
          netPaye: slip.paye,
        });
      }
    }

    const rows = Array.from(byEmp.values()).map(({ emp, ...totals }) => ({
      empNo: emp.empNo,
      kraPin: emp.kraPin ?? "",
      name: fullName(emp),
      annualGross: totals.gross,
      benefits: totals.benefits,
      quarters: 0,
      annualTotalGross: totals.gross,
      annualMortgageInterest: totals.mortgageInterest,
      annualDefinedContribution: totals.definedContribution,
      annualChargeablePay: totals.chargeablePay,
      annualTaxChargeable: totals.taxChargeable,
      annualPersonalRelief: totals.personalRelief,
      annualInsuranceRelief: totals.insuranceRelief,
      annualNetPaye: totals.netPaye,
    }));

    const totalPaye = rows.reduce((s, r) => s + r.annualNetPaye, 0);
    const totalGross = rows.reduce((s, r) => s + r.annualGross, 0);
    const totalChargeablePay = rows.reduce((s, r) => s + r.annualChargeablePay, 0);

    await db.insert(statutoryFilings).values({
      orgId: p.orgId, runId: null, kind: "P9", period: year,
      itemCount: rows.length, totalAmount: totalPaye,
      status: "downloaded", filedAt: new Date(),
    });

    const pdfBuffer = await generateP9Pdf({
      orgName: org?.name ?? "",
      orgKraPin: org?.kraPin ?? undefined,
      year,
      rows,
      totalPaye,
      totalGross,
      totalChargeablePay,
    });

    const orgPin = (org?.kraPin ?? "ORG").replace(/[^A-Z0-9]/gi, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="P9_${year}_${orgPin}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

export default router;
