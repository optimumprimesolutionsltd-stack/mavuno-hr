import { createHash } from "crypto";
import { fromCents, type Cents } from "@/lib/money";

/**
 * STATUTORY RETURN FILES.
 *
 * Compliance filing is the reason an HR manager pays for payroll software.
 * Getting the numbers right is table stakes; producing the file the regulator
 * will actually accept is the product.
 *
 *   P10   - KRA monthly PAYE return (iTax CSV import)
 *   NSSF  - monthly by-member contribution schedule
 *   SHIF  - monthly health levy return
 *   AHL   - affordable housing levy return
 *   P9A   - annual per-employee tax deduction card
 */

export interface FilingRow {
  empNo: string;
  firstName: string;
  lastName: string;
  kraPin: string | null;
  nationalId: string | null;
  nssfNo: string | null;
  shifNo: string | null;
  employmentType: string;
  residentStatus: string;
  disabilityExemption: boolean;

  basic: Cents;
  allowances: Cents;
  nonCashBenefit: Cents;
  gross: Cents;
  nssfEmployee: Cents;
  nssfEmployer: Cents;
  shif: Cents;
  housingLevyEmployee: Cents;
  housingLevyEmployer: Cents;
  pension: Cents;
  mortgageInterest: Cents;
  taxableIncome: Cents;
  payeBeforeRelief: Cents;
  personalRelief: Cents;
  insuranceRelief: Cents;
  paye: Cents;
}

export interface FilingFile {
  kind: "P10" | "NSSF" | "SHIF" | "AHL" | "P9A";
  filename: string;
  content: string;
  itemCount: number;
  totalAmount: Cents;
  checksum: string;
  exceptions: { empNo: string; reason: string }[];
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const build = (
  kind: FilingFile["kind"], filename: string, lines: string[],
  itemCount: number, totalAmount: Cents, exceptions: FilingFile["exceptions"],
): FilingFile => {
  const content = lines.join("\r\n") + "\r\n";
  return { kind, filename, content, itemCount, totalAmount, checksum: sha256(content), exceptions };
};

/**
 * KRA P10 — monthly PAYE return, iTax CSV layout.
 *
 * The single most common cause of a rejected P10 is a missing or malformed KRA
 * PIN, which iTax rejects at upload with an unhelpful error. We catch it here
 * and name the employee, so it gets fixed before the deadline rather than at 
 * 11pm on the 9th.
 */
export function generateP10(
  rows: FilingRow[],
  ctx: { employerPin: string; employerName: string; period: string },
): FilingFile {
  const exceptions: FilingFile["exceptions"] = [];
  const valid = rows.filter((r) => {
    if (!r.kraPin || !/^[A-Z]\d{9}[A-Z]$/.test(r.kraPin)) {
      exceptions.push({
        empNo: r.empNo,
        reason: `Missing or invalid KRA PIN (${r.kraPin ?? "none"}) — iTax will reject this row`,
      });
      return false;
    }
    return true;
  });

  const lines = [
    `# KRA P10 PAYE Return | Employer PIN: ${ctx.employerPin} | ${esc(ctx.employerName)} | Period: ${ctx.period}`,
    [
      "PIN of Employee","Employee Name","Residential Status","Type of Employee",
      "Basic Salary","Housing/Other Allowances","Value of Non-Cash Benefit","Total Gross Pay",
      "Defined Contribution Retirement Scheme","Owner Occupied Interest",
      "Amount of Benefit (Chargeable)","Taxable Pay","Tax Payable",
      "Personal Relief","Insurance Relief","PAYE Deducted",
    ].join(","),
    ...valid.map((r) =>
      [
        r.kraPin!,
        esc(`${r.firstName} ${r.lastName}`),
        r.residentStatus === "resident" ? "Resident" : "Non-Resident",
        r.disabilityExemption ? "Disabled" : "Primary Employee",
        fromCents(r.basic),
        fromCents(r.allowances),
        fromCents(r.nonCashBenefit),
        fromCents(r.gross),
        // iTax groups NSSF + registered pension under DCRS.
        fromCents(r.nssfEmployee + r.pension),
        fromCents(r.mortgageInterest),
        fromCents(r.nonCashBenefit),
        fromCents(r.taxableIncome),
        fromCents(r.payeBeforeRelief),
        fromCents(r.personalRelief),
        fromCents(r.insuranceRelief),
        fromCents(r.paye),
      ].join(","),
    ),
  ];

  const total = valid.reduce((a, b) => a + b.paye, 0);
  return build("P10", `P10_${ctx.employerPin}_${ctx.period}.csv`, lines, valid.length, total, exceptions);
}

/** NSSF monthly by-member contribution schedule (Tier I + Tier II). */
export function generateNssf(
  rows: FilingRow[],
  ctx: { employerNo: string; employerName: string; period: string },
): FilingFile {
  const exceptions: FilingFile["exceptions"] = [];
  const valid = rows.filter((r) => {
    if (r.nssfEmployee === 0 && r.employmentType === "casual") return false; // legitimately exempt
    if (!r.nssfNo) {
      exceptions.push({ empNo: r.empNo, reason: "Missing NSSF membership number" });
      return false;
    }
    return true;
  });

  const lines = [
    `# NSSF Contribution Schedule | Employer: ${ctx.employerNo} | ${esc(ctx.employerName)} | ${ctx.period}`,
    ["NSSF No","National ID","Employee Name","Gross Pay","Employee Contribution","Employer Contribution","Total"].join(","),
    ...valid.map((r) =>
      [
        r.nssfNo!, r.nationalId ?? "", esc(`${r.firstName} ${r.lastName}`),
        fromCents(r.gross), fromCents(r.nssfEmployee), fromCents(r.nssfEmployer),
        fromCents(r.nssfEmployee + r.nssfEmployer),
      ].join(","),
    ),
  ];

  const total = valid.reduce((a, b) => a + b.nssfEmployee + b.nssfEmployer, 0);
  return build("NSSF", `NSSF_${ctx.employerNo}_${ctx.period}.csv`, lines, valid.length, total, exceptions);
}

/** SHIF monthly return (2.75% of gross, min KES 300). */
export function generateShif(
  rows: FilingRow[],
  ctx: { employerNo: string; employerName: string; period: string },
): FilingFile {
  const exceptions: FilingFile["exceptions"] = [];
  const valid = rows.filter((r) => {
    if (!r.shifNo && !r.nationalId) {
      exceptions.push({ empNo: r.empNo, reason: "Missing both SHIF number and National ID" });
      return false;
    }
    return true;
  });

  const lines = [
    `# SHIF Return | Employer: ${ctx.employerNo} | ${esc(ctx.employerName)} | ${ctx.period}`,
    ["SHIF No","National ID","Employee Name","Gross Pay","SHIF Contribution"].join(","),
    ...valid.map((r) =>
      [r.shifNo ?? "", r.nationalId ?? "", esc(`${r.firstName} ${r.lastName}`),
       fromCents(r.gross), fromCents(r.shif)].join(","),
    ),
  ];

  const total = valid.reduce((a, b) => a + b.shif, 0);
  return build("SHIF", `SHIF_${ctx.employerNo}_${ctx.period}.csv`, lines, valid.length, total, exceptions);
}

/** Affordable Housing Levy — 1.5% employee + 1.5% employer. */
export function generateAhl(
  rows: FilingRow[],
  ctx: { employerPin: string; employerName: string; period: string },
): FilingFile {
  const lines = [
    `# Affordable Housing Levy | Employer PIN: ${ctx.employerPin} | ${esc(ctx.employerName)} | ${ctx.period}`,
    ["KRA PIN","National ID","Employee Name","Gross Pay","Employee Levy","Employer Levy","Total"].join(","),
    ...rows.map((r) =>
      [r.kraPin ?? "", r.nationalId ?? "", esc(`${r.firstName} ${r.lastName}`),
       fromCents(r.gross), fromCents(r.housingLevyEmployee), fromCents(r.housingLevyEmployer),
       fromCents(r.housingLevyEmployee + r.housingLevyEmployer)].join(","),
    ),
  ];
  const total = rows.reduce((a, b) => a + b.housingLevyEmployee + b.housingLevyEmployer, 0);
  return build("AHL", `AHL_${ctx.employerPin}_${ctx.period}.csv`, lines, rows.length, total, []);
}

/** Reconciliation totals — what Finance posts to the GL and pays the regulator. */
export function reconcile(rows: FilingRow[]) {
  const t = (f: (r: FilingRow) => Cents) => rows.reduce((a, r) => a + f(r), 0);
  return {
    employees: rows.length,
    gross: t((r) => r.gross),
    paye: t((r) => r.paye),
    nssfEmployee: t((r) => r.nssfEmployee),
    nssfEmployer: t((r) => r.nssfEmployer),
    shif: t((r) => r.shif),
    ahlEmployee: t((r) => r.housingLevyEmployee),
    ahlEmployer: t((r) => r.housingLevyEmployer),
    /* What the employer actually remits, by regulator. */
    remitToKra: t((r) => r.paye) + t((r) => r.housingLevyEmployee) + t((r) => r.housingLevyEmployer),
    remitToNssf: t((r) => r.nssfEmployee) + t((r) => r.nssfEmployer),
    remitToShif: t((r) => r.shif),
  };
}
