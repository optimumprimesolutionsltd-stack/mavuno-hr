/**
 * Everything an organisation holds, as a ZIP of CSVs.
 *
 * This exists because deletion exists. The privacy page tells people to export
 * before they delete — payroll records cannot be recreated and the duty to
 * retain them stays with the employer — so "export" had to stop meaning
 * "download each report one at a time and hope you got them all".
 *
 * CSV rather than JSON: the people who need this are accountants and HR
 * managers moving to another system or satisfying a KRA request. A spreadsheet
 * they can open is worth more than a structurally faithful dump they cannot.
 */
import { eq, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import {
  organizations,
  users,
  statutoryConfigs,
  departments,
  employees,
  timesheets,
  payAdjustments,
  payrollRuns,
  payslips,
  payoutBatches,
  statutoryFilings,
  leaveRequests,
  leaveDocuments,
  loanRequests,
  loans,
  loanRepayments,
  auditLogs,
  billingPayments,
  billingCredits,
  notifications,
} from "@workspace/db/schema";
import { createZip } from "./zip.js";

/**
 * What goes in, and what is held back.
 *
 * `sessions`, `password_reset_tokens` and `idempotency_keys` are absent on
 * purpose. They are live credentials and replay state, not the customer's
 * business records — exporting them would hand someone a file that can be used
 * to impersonate their staff, and they are worthless for the purpose the export
 * serves. `users` is included but `passwordHash` is stripped for the same
 * reason: who had access is a business record, the hash is not.
 */
interface ExportTable {
  file: string;
  table: PgTable;
  /** Columns never written out, regardless of what the table holds. */
  omit?: string[];
  note: string;
}

const TABLES: ExportTable[] = [
  { file: "organisation.csv", table: organizations, note: "Your company profile, plan and settings." },
  { file: "users.csv", table: users, omit: ["passwordHash"], note: "People with access to Mavuno HR. Password hashes are deliberately excluded." },
  { file: "employees.csv", table: employees, note: "The employee register: identity, statutory numbers, pay setup and next of kin." },
  { file: "departments.csv", table: departments, note: "Departments and cost centres." },
  { file: "payroll-runs.csv", table: payrollRuns, note: "Every payroll run with its totals and approval trail." },
  { file: "payslips.csv", table: payslips, note: "Per-employee, per-period payslip lines. This is the file a P9 can be rebuilt from." },
  { file: "timesheets.csv", table: timesheets, note: "Days and hours recorded per employee per period." },
  { file: "pay-adjustments.csv", table: payAdjustments, note: "One-off earnings and deductions applied to a period." },
  { file: "payout-batches.csv", table: payoutBatches, note: "Bank and M-Pesa payment files generated for each run." },
  { file: "statutory-filings.csv", table: statutoryFilings, note: "P9, P10, SHIF and NSSF returns generated, and when they were filed." },
  { file: "leave-requests.csv", table: leaveRequests, note: "Leave applications and their decisions." },
  { file: "leave-documents.csv", table: leaveDocuments, note: "Metadata for documents attached to leave requests." },
  { file: "loan-requests.csv", table: loanRequests, note: "Loan applications and their decisions." },
  { file: "loans.csv", table: loans, note: "Active and settled loans." },
  { file: "loan-repayments.csv", table: loanRepayments, note: "Repayments deducted through payroll." },
  { file: "billing-payments.csv", table: billingPayments, note: "Your subscription payments and receipts." },
  { file: "billing-credits.csv", table: billingCredits, note: "Credits applied to your account." },
  { file: "statutory-overrides.csv", table: statutoryConfigs, note: "Any tax configuration specific to your organisation. Shared country packs are not included — they are ours, not yours." },
  { file: "notifications.csv", table: notifications, note: "In-app notifications sent to your users." },
  { file: "audit-log.csv", table: auditLogs, note: "Who changed what and when, including the hash chain that makes the log tamper-evident." },
];

/** RFC 4180: quote everything, double any embedded quote. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): Buffer {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(","));
  }
  // BOM so Excel opens UTF-8 names (Kenyan names carry accents often enough)
  // without mangling them.
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

export interface OrgExport {
  filename: string;
  buffer: Buffer;
  rowCounts: Record<string, number>;
}

export async function buildOrgExport(orgId: number, orgName: string): Promise<OrgExport> {
  const files: { name: string; data: Buffer }[] = [];
  const rowCounts: Record<string, number> = {};

  for (const spec of TABLES) {
    const columns = getTableColumns(spec.table) as Record<string, unknown>;
    const names = Object.keys(columns).filter((c) => !spec.omit?.includes(c));

    // organizations is keyed by `id`, everything else by `orgId`. Selecting the
    // wrong one would either fail loudly or, worse, return another customer's
    // rows — so it is explicit rather than inferred.
    const idColumn =
      spec.table === organizations
        ? (columns.id as never)
        : (columns.orgId as never);

    const rows = (await db
      .select()
      .from(spec.table as never)
      .where(eq(idColumn, orgId))) as Record<string, unknown>[];

    rowCounts[spec.file] = rows.length;
    files.push({ name: spec.file, data: toCsv(names, rows) });
  }

  files.push({ name: "README.txt", data: readme(orgName, rowCounts) });

  return {
    filename: `mavuno-hr-export-${slug(orgName)}-${new Date().toISOString().slice(0, 10)}.zip`,
    buffer: createZip(files),
    rowCounts,
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organisation";
}

function readme(orgName: string, counts: Record<string, number>): Buffer {
  const lines = [
    `Mavuno HR — data export for ${orgName}`,
    `Generated ${new Date().toISOString()}`,
    "",
    "Every file is CSV, UTF-8 with a byte-order mark so Excel opens accented",
    "names correctly. Money is in cents: divide by 100 for shillings. Dates and",
    "times are ISO 8601 in UTC.",
    "",
    "WHAT IS IN HERE",
    "",
  ];
  for (const spec of TABLES) {
    lines.push(`  ${spec.file.padEnd(26)} ${counts[spec.file] ?? 0} rows`);
    lines.push(`  ${" ".repeat(26)} ${spec.note}`);
    lines.push("");
  }
  lines.push(
    "WHAT IS DELIBERATELY NOT IN HERE",
    "",
    "  Password hashes, login sessions and password-reset tokens. They are live",
    "  credentials rather than business records, and a file containing them",
    "  could be used to impersonate your staff.",
    "",
    "  The shared Kenyan tax configuration. That is ours and applies to every",
    "  customer; any override specific to you is in statutory-overrides.csv.",
    "",
    "IF YOU ARE EXPORTING BEFORE DELETING",
    "",
    "  Keep this somewhere safe and durable. You remain the employer, and the",
    "  KRA can still ask you to produce P9s and returns for past years after",
    "  your Mavuno HR account is gone. payslips.csv is the file those are",
    "  rebuilt from — it matters more than it looks.",
    "",
  );
  return Buffer.from(lines.join("\n"), "utf8");
}
