/**
 * KRA iTax CSV export utilities.
 * All money values coming in are integer cents; we divide by 100 and format to 2 d.p.
 */

export const P10_HEADERS = [
  "Employee's PIN",
  "Employee's Name",
  "Basic Salary/Wages",
  "Benefits in Kind",
  "Value of Quarter",
  "Total Gross Pay",
  "Owner Occupied Interest",
  "Defined Contribution / NSSF",
  "Chargeable Income",
  "Tax on Chargeable Income",
  "Personal Relief",
  "Insurance Relief",
  "Net PAYE Tax Payable",
] as const;

export const P9_HEADERS = [
  "Employee's PIN",
  "Employee's Name",
  "Basic Salary/Wages",
  "Benefits in Kind",
  "Value of Quarter",
  "Total Gross Pay",
  "Owner Occupied Interest",
  "Defined Contribution / NSSF",
  "Chargeable Income",
  "Tax Charged",
  "Personal Relief",
  "Insurance Relief",
  "Net PAYE Tax Payable",
] as const;

/** Convert integer cents to a KES decimal string (e.g. 123456 → "1234.56") */
export function centsToKes(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Build a properly-quoted CSV string from headers + rows (cents converted automatically) */
export function buildCsv(headers: readonly string[], rows: (string | number)[][]): string {
  const escape = (cell: string | number): string => {
    if (typeof cell === "number") return centsToKes(cell);
    const s = String(cell);
    // Quote if contains comma, double-quote, or newline
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\r\n");
}

/** Trigger a client-side CSV file download */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/** Build and immediately download a P10 CSV from the API response */
export function downloadP10Csv(data: {
  rows: Array<{
    kraPin: string;
    name: string;
    gross: number;
    benefits: number;
    quarters: number;
    totalGross: number;
    mortgageInterest: number;
    definedContribution: number;
    chargeablePay: number;
    taxChargeable: number;
    personalRelief: number;
    insuranceRelief: number;
    netPaye: number;
  }>;
  period: string;
  orgKraPin: string;
}): void {
  const csvRows = data.rows.map((r) => [
    r.kraPin,
    r.name,
    r.gross,
    r.benefits,
    r.quarters,
    r.totalGross,
    r.mortgageInterest,
    r.definedContribution,
    r.chargeablePay,
    r.taxChargeable,
    r.personalRelief,
    r.insuranceRelief,
    r.netPaye,
  ] as (string | number)[]);

  const csv = buildCsv(P10_HEADERS, csvRows);
  const orgPin = data.orgKraPin.replace(/[^A-Z0-9]/gi, "") || "ORG";
  downloadCsv(`P10_${data.period}_${orgPin}.csv`, csv);
}

// ── NSSF eCitizen bulk-upload format ────────────────────────────────────────

export const NSSF_HEADERS = [
  "NSSF No",
  "Employee Name",
  "Employer No",
  "Tier I Employee",
  "Tier I Employer",
  "Tier II Employee",
  "Tier II Employer",
  "Total",
] as const;

/** Build and immediately download an NSSF eCitizen CSV from the API response */
export function downloadNssfCsv(data: {
  rows: Array<{
    nssfNo: string;
    name: string;
    employerNo: string;
    tier1Employee: number;
    tier1Employer: number;
    tier2Employee: number;
    tier2Employer: number;
    total: number;
  }>;
  period: string;
  orgNssfEmployerNo: string;
}): void {
  const csvRows = data.rows.map((r) => [
    r.nssfNo,
    r.name,
    r.employerNo,
    r.tier1Employee,
    r.tier1Employer,
    r.tier2Employee,
    r.tier2Employer,
    r.total,
  ] as (string | number)[]);

  const csv = buildCsv(NSSF_HEADERS, csvRows);
  const empNo = data.orgNssfEmployerNo.replace(/[^A-Z0-9]/gi, "") || "ORG";
  downloadCsv(`NSSF_${data.period}_${empNo}.csv`, csv);
}

// ── SHIF SHA portal bulk-upload format ──────────────────────────────────────

export const SHIF_HEADERS = [
  "ID No",
  "Employee Name",
  "SHIF Amount",
] as const;

/** Build and immediately download a SHIF SHA portal CSV from the API response */
export function downloadShifCsv(data: {
  rows: Array<{
    nationalId: string;
    name: string;
    shifAmount: number;
  }>;
  period: string;
  orgName: string;
}): void {
  const csvRows = data.rows.map((r) => [
    r.nationalId,
    r.name,
    r.shifAmount,
  ] as (string | number)[]);

  const csv = buildCsv(SHIF_HEADERS, csvRows);
  const org = data.orgName.replace(/[^A-Z0-9]/gi, "").slice(0, 10) || "ORG";
  downloadCsv(`SHIF_${data.period}_${org}.csv`, csv);
}

/** Build and immediately download a P9 CSV from the API response */
export function downloadP9Csv(data: {
  rows: Array<{
    kraPin: string;
    name: string;
    annualGross: number;
    benefits: number;
    quarters: number;
    annualTotalGross: number;
    annualMortgageInterest: number;
    annualDefinedContribution: number;
    annualChargeablePay: number;
    annualTaxChargeable: number;
    annualPersonalRelief: number;
    annualInsuranceRelief: number;
    annualNetPaye: number;
  }>;
  year: string;
  orgKraPin: string;
}): void {
  const csvRows = data.rows.map((r) => [
    r.kraPin,
    r.name,
    r.annualGross,
    r.benefits,
    r.quarters,
    r.annualTotalGross,
    r.annualMortgageInterest,
    r.annualDefinedContribution,
    r.annualChargeablePay,
    r.annualTaxChargeable,
    r.annualPersonalRelief,
    r.annualInsuranceRelief,
    r.annualNetPaye,
  ] as (string | number)[]);

  const csv = buildCsv(P9_HEADERS, csvRows);
  const orgPin = data.orgKraPin.replace(/[^A-Z0-9]/gi, "") || "ORG";
  downloadCsv(`P9_${data.year}_${orgPin}.csv`, csv);
}
