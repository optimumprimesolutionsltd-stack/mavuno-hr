import { and, eq, ne, inArray, isNull, desc, asc } from "drizzle-orm";
import { z } from "zod";
import {
  employees, payrollRuns, payslips, organizations, statutoryConfigs,
} from "@workspace/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { resolveConfig } from "./statutory-resolve.js";
import { writeAudit } from "./audit.js";
import { toCents } from "./money.js";
import type { Principal } from "./session.js";
import type { Cents } from "./money.js";
import type { StatutoryConfig } from "./statutory-types.js";

type Tx = NodePgDatabase<typeof schema>;

const moneyString = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "must be a non-negative number");
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");

// Mirrors docs/design/payroll-onboarding-and-approval.md §3.7 — one row per
// employee per period, trusted verbatim from the prior system (no recompute).
export const historicalImportRowSchema = z.object({
  period,
  empNo: z.string().min(1, "required"),
  daysPayable: z.coerce.number().int().min(0).max(31),
  basic: moneyString,
  allowances: moneyString,
  nonCashBenefit: moneyString,
  gross: moneyString,
  nssfEmployee: moneyString,
  shif: moneyString,
  housingLevyEmployee: moneyString,
  pensionEmployee: moneyString,
  taxableIncome: moneyString,
  payeBeforeRelief: moneyString,
  personalRelief: moneyString,
  insuranceRelief: moneyString,
  paye: moneyString,
  helb: moneyString,
  sacco: moneyString,
  otherDeductions: moneyString,
  netPay: moneyString,
});

export type HistoricalImportRow = z.infer<typeof historicalImportRowSchema>;

export const HISTORICAL_IMPORT_MAX_ROWS = 5000;

/** The CSV column order the template and parser both use. */
export const HISTORICAL_IMPORT_COLUMNS = [
  "period", "empNo", "daysPayable", "basic", "allowances", "nonCashBenefit", "gross",
  "nssfEmployee", "shif", "housingLevyEmployee", "pensionEmployee",
  "taxableIncome", "payeBeforeRelief", "personalRelief", "insuranceRelief", "paye",
  "helb", "sacco", "otherDeductions", "netPay",
] as const;

interface RowError { row: number; message: string }

export interface HistoricalImportResult {
  dryRun: boolean;
  imported: number;   // rows that passed validation (written, unless dryRun)
  skipped: number;     // rows that failed validation
  errors: RowError[];
  runs: { period: string; runId: number | null; employeeCount: number }[];
}

/**
 * Finds a statutory config to satisfy payroll_runs.statutory_config_id for a
 * period the regular resolver can't cover. CSV-imported payslips are trusted
 * verbatim from the CSV — the snapshot is informational only, never used to
 * (re)compute anything — so falling back to the oldest config on file for the
 * country is fine. Returns null only if the country has no config at all.
 */
async function resolveConfigForImport(
  tx: Tx, orgId: number, countryCode: string, period: string,
): Promise<{ id: number; config: StatutoryConfig } | null> {
  try {
    return await resolveConfig(tx, orgId, countryCode, period);
  } catch {
    const [fallback] = await tx.select().from(statutoryConfigs)
      .where(and(eq(statutoryConfigs.countryCode, countryCode), isNull(statutoryConfigs.orgId)))
      .orderBy(asc(statutoryConfigs.effectiveFrom))
      .limit(1);
    if (!fallback) return null;
    return { id: fallback.id, config: fallback.config as StatutoryConfig };
  }
}

function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export async function importHistoricalRuns(
  tx: Tx,
  principal: Principal,
  rawRows: unknown[],
  opts: { dryRun: boolean },
  ip: string | null,
): Promise<HistoricalImportResult> {
  const { orgId } = principal;

  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  const cutoff = org?.payrollStartPeriod ?? new Date().toISOString().slice(0, 7);

  // ── Pass 1: structural validation ─────────────────────────────────────────
  const errors: RowError[] = [];
  const rows: (HistoricalImportRow & { rowNum: number })[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const parsed = historicalImportRowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const msg = Object.entries(flat.fieldErrors)
        .map(([f, e]) => `${f}: ${(e as string[]).join(", ")}`)
        .join("; ") || "Invalid row";
      errors.push({ row: i + 1, message: msg });
      continue;
    }
    if (parsed.data.period >= cutoff) {
      errors.push({ row: i + 1, message: `period ${parsed.data.period} is not before ${cutoff} (your payroll start month)` });
      continue;
    }
    rows.push({ ...parsed.data, rowNum: i + 1 });
  }

  // ── Pass 2: employee lookup + in-batch duplicate (period, empNo) ──────────
  const empNos = [...new Set(rows.map((r) => r.empNo))];
  const emps = empNos.length
    ? await tx.select({ id: employees.id, empNo: employees.empNo }).from(employees)
        .where(and(eq(employees.orgId, orgId), inArray(employees.empNo, empNos)))
    : [];
  const empByNo = new Map(emps.map((e) => [e.empNo, e.id]));

  const seenInPeriod = new Set<string>(); // `${period}:${empNo}`
  const acceptedRows: (HistoricalImportRow & { rowNum: number; employeeId: number })[] = [];

  for (const r of rows) {
    const employeeId = empByNo.get(r.empNo);
    if (!employeeId) {
      errors.push({ row: r.rowNum, message: `unknown empNo "${r.empNo}"` });
      continue;
    }
    const key = `${r.period}:${r.empNo}`;
    if (seenInPeriod.has(key)) {
      errors.push({ row: r.rowNum, message: `duplicate row for ${r.empNo} in ${r.period}` });
      continue;
    }
    seenInPeriod.add(key);
    acceptedRows.push({ ...r, employeeId });
  }

  // ── Pass 3: one historical run per distinct period ─────────────────────────
  const byPeriod = new Map<string, typeof acceptedRows>();
  for (const r of acceptedRows) {
    const list = byPeriod.get(r.period) ?? [];
    list.push(r);
    byPeriod.set(r.period, list);
  }

  const existingRuns = byPeriod.size
    ? await tx.select({ period: payrollRuns.period, runType: payrollRuns.runType }).from(payrollRuns)
        .where(and(
          eq(payrollRuns.orgId, orgId),
          inArray(payrollRuns.runType, ["regular", "historical"]),
          ne(payrollRuns.status, "reversed"),
          inArray(payrollRuns.period, [...byPeriod.keys()]),
        ))
    : [];
  const clashedPeriods = new Set(existingRuns.map((r) => r.period));

  const runsOut: HistoricalImportResult["runs"] = [];
  let imported = 0;

  for (const [per, periodRows] of byPeriod) {
    if (clashedPeriods.has(per)) {
      for (const r of periodRows) errors.push({ row: r.rowNum, message: `a payroll run for ${per} already exists` });
      continue;
    }

    const cfg = await resolveConfigForImport(tx, orgId, org?.countryCode ?? "KE", per);
    if (!cfg) {
      for (const r of periodRows) errors.push({ row: r.rowNum, message: `no statutory configuration is on file for this country — cannot record ${per}` });
      continue;
    }

    imported += periodRows.length;
    runsOut.push({ period: per, runId: null, employeeCount: periodRows.length });
    if (opts.dryRun) continue;

    const totals = { gross: 0 as Cents, net: 0 as Cents, paye: 0 as Cents, nssfE: 0 as Cents, shif: 0 as Cents, ahlE: 0 as Cents };
    const slipRows = periodRows.map((r) => {
      const basic = toCents(r.basic), allowances = toCents(r.allowances), nonCashBenefit = toCents(r.nonCashBenefit);
      const gross = toCents(r.gross);
      const nssfEmployee = toCents(r.nssfEmployee), shif = toCents(r.shif);
      const housingLevyEmployee = toCents(r.housingLevyEmployee), pension = toCents(r.pensionEmployee);
      const taxableIncome = toCents(r.taxableIncome), payeBeforeRelief = toCents(r.payeBeforeRelief);
      const personalRelief = toCents(r.personalRelief), insuranceRelief = toCents(r.insuranceRelief);
      const paye = toCents(r.paye), helb = toCents(r.helb), sacco = toCents(r.sacco);
      const otherDeductions = toCents(r.otherDeductions), netPay = toCents(r.netPay);
      const cashGross = (gross - nonCashBenefit) as Cents;
      const totalDeductions = (nssfEmployee + shif + housingLevyEmployee + pension + paye + helb + sacco + otherDeductions) as Cents;

      totals.gross = (totals.gross + gross) as Cents;
      totals.net = (totals.net + netPay) as Cents;
      totals.paye = (totals.paye + paye) as Cents;
      totals.nssfE = (totals.nssfE + nssfEmployee) as Cents;
      totals.shif = (totals.shif + shif) as Cents;
      totals.ahlE = (totals.ahlE + housingLevyEmployee) as Cents;

      return {
        orgId, employeeId: r.employeeId,
        basic, allowances, overtime: 0 as Cents, adjustmentEarnings: 0 as Cents, nonCashBenefit,
        gross, cashGross,
        nssfEmployee, nssfEmployer: 0 as Cents, shif,
        housingLevyEmployee, housingLevyEmployer: 0 as Cents,
        pension, pensionEmployer: 0 as Cents, mortgageInterest: 0 as Cents,
        taxableIncome, payeBeforeRelief, personalRelief, insuranceRelief, paye,
        helb, sacco, loanDeduction: 0 as Cents, adjustmentDeductions: otherDeductions,
        totalDeductions, netPay,
        // Employer-side contributions aren't in the CSV; gross is the closest
        // available approximation — this run is a record, not a cash-flow input.
        employerCost: gross,
        daysInPeriod: daysInMonth(per), daysPayable: r.daysPayable,
        breakdown: { source: "csv_historical_import", importedAt: new Date().toISOString() },
      };
    });

    const [y, m] = per.split("-").map(Number);
    const stamped = new Date();
    const paidAt = new Date(Date.UTC(y, m, 0, 12, 0, 0)); // last day of period
    const monthName = new Date(`${per}-01T00:00:00Z`)
      .toLocaleString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });

    const [run] = await tx.insert(payrollRuns).values({
      orgId, period: per, name: `${monthName} Payroll`, runType: "historical", status: "paid",
      statutoryConfigId: cfg.id, statutorySnapshot: cfg.config,
      employeeCount: periodRows.length,
      grossTotal: totals.gross, netTotal: totals.net, payeTotal: totals.paye,
      nssfEmployeeTotal: totals.nssfE, nssfEmployerTotal: 0, shifTotal: totals.shif,
      housingLevyEmployeeTotal: totals.ahlE, housingLevyEmployerTotal: 0,
      employerCostTotal: totals.gross,
      createdByUserId: principal.userId,
      submittedByUserId: principal.userId, submittedAt: stamped,
      approvedByUserId: principal.userId, approvedAt: stamped,
      paidByUserId: principal.userId, paidAt,
    }).returning();

    await tx.insert(payslips).values(slipRows.map((s) => ({ ...s, runId: run.id })));

    runsOut[runsOut.length - 1].runId = run.id;
  }

  if (!opts.dryRun && runsOut.some((r) => r.runId !== null)) {
    await writeAudit(tx, {
      orgId, action: "PAYROLL_HISTORICAL_IMPORTED", entity: "payroll_runs", entityId: null,
      detail: `CSV import: ${runsOut.filter((r) => r.runId).length} run(s), ${imported} payslip row(s)`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
      after: { runs: runsOut.filter((r) => r.runId) },
    });
  }

  return { dryRun: opts.dryRun, imported, skipped: errors.length, errors, runs: runsOut };
}
