/**
 * KRA iTax CSV export utilities.
 * All money values coming in are integer cents; we divide by 100 and format to 2 d.p.
 */
import ExcelJS from "exceljs";

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

// ── AHL (Affordable Housing Levy) bulk-upload format ────────────────────────

export const AHL_HEADERS = [
  "KRA PIN",
  "Employee Name",
  "National ID",
  "Employee AHL",
  "Employer AHL",
  "Total AHL",
] as const;

/** Build and immediately download an AHL CSV from the API response */
export function downloadAhlCsv(data: {
  rows: Array<{
    kraPin: string;
    name: string;
    nationalId: string;
    employeeAhl: number;
    employerAhl: number;
    totalAhl: number;
  }>;
  period: string;
  orgName: string;
}): void {
  const csvRows = data.rows.map((r) => [
    r.kraPin,
    r.name,
    r.nationalId,
    r.employeeAhl,
    r.employerAhl,
    r.totalAhl,
  ] as (string | number)[]);

  const csv = buildCsv(AHL_HEADERS, csvRows);
  const org = data.orgName.replace(/[^A-Z0-9]/gi, "").slice(0, 10) || "ORG";
  downloadCsv(`AHL_${data.period}_${org}.csv`, csv);
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

// ── Employee roster export ──────────────────────────────────────────────────

export const EMPLOYEE_EXPORT_HEADERS = [
  "Emp No",
  "First Name",
  "Middle Name",
  "Last Name",
  "Email",
  "Phone",
  "Gender",
  "National ID",
  "KRA PIN",
  "NSSF No",
  "SHIF No",
  "Department",
  "Position",
  "Employment Type",
  "Resident Status",
  "Salary Basis",
  "Pay Method",
  "Bank Name",
  "Bank Branch",
  "Bank Account",
  "M-Pesa Phone",
  "Basic Salary (KES)",
  "House Allowance (KES)",
  "Transport Allowance (KES)",
  "Other Allowance (KES)",
  "Non-Cash Benefit (KES)",
  "Insurance Premium (KES)",
  "Pension Employee (KES)",
  "Pension Employer (KES)",
  "Mortgage Interest (KES)",
  "HELB Monthly (KES)",
  "SACCO Monthly (KES)",
  "Disability Exemption",
  "Work Days/Week",
  "Works on Holidays",
  "Hire Date",
  "Status",
  "Date of Birth",
  "Region",
  "Education Level",
  "NOK Name",
  "NOK Relationship",
  "NOK Phone",
  "NOK Email",
] as const;

function cents(v: number | null | undefined): string {
  if (v == null) return "";
  return (v / 100).toFixed(2);
}

function centsNum(v: number | null | undefined): number | null {
  if (v == null) return null;
  return v / 100;
}

function str(v: string | null | undefined): string {
  return v ?? "";
}

/**
 * Build and immediately download the employee roster as a CSV file.
 * `rows` is the array returned by GET /api/employees — each item has
 * `{ employee: {...}, department: {...} | null }`.
 */
export function downloadEmployeesCsv(
  rows: Array<{ employee: Record<string, any>; department: Record<string, any> | null | undefined }>,
  filename = "employees.csv",
): void {
  const csvRows = rows.map((r) => {
    const e = r.employee;
    const dept = r.department;
    return [
      str(e.empNo),
      str(e.firstName),
      str(e.middleName),
      str(e.lastName),
      str(e.email),
      str(e.phone),
      str(e.gender),
      str(e.nationalId),
      str(e.kraPin),
      str(e.nssfNo),
      str(e.shifNo),
      str(dept?.name),
      str(e.position),
      str(e.employmentType),
      str(e.residentStatus),
      str(e.salaryBasis),
      str(e.payMethod),
      str(e.bankName),
      str(e.bankBranchName),
      str(e.bankAccount),
      str(e.mpesaPhone),
      cents(e.basicSalary),
      cents(e.houseAllowance),
      cents(e.transportAllowance),
      cents(e.otherAllowance),
      cents(e.nonCashBenefit),
      cents(e.insurancePremium),
      cents(e.pensionEmployee),
      cents(e.pensionEmployer),
      cents(e.mortgageInterest),
      cents(e.helbMonthly),
      cents(e.saccoMonthly),
      e.disabilityExemption ? "Yes" : "No",
      str(e.workDaysPerWeek),
      e.worksOnHolidays ? "Yes" : "No",
      str(e.hireDate),
      str(e.status),
      str(e.dateOfBirth),
      str(e.region),
      str(e.educationLevel),
      str(e.nokName),
      str(e.nokRelationship),
      str(e.nokPhone),
      str(e.nokEmail),
    ] as (string | number)[];
  });

  const csv = buildCsv(EMPLOYEE_EXPORT_HEADERS, csvRows);
  downloadCsv(filename, csv);
}

// Indices of money columns in EMPLOYEE_EXPORT_HEADERS (0-based)
const MONEY_COL_INDICES = new Set([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);

/**
 * Build and immediately download the employee roster as a formatted .xlsx file.
 * Headers are bold with a teal fill, columns are auto-sized, and money columns
 * are formatted as numbers so Excel/Sheets totals work natively.
 */
export async function downloadEmployeesXlsx(
  rows: Array<{ employee: Record<string, any>; department: Record<string, any> | null | undefined }>,
  filename = "employees.xlsx",
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zawadi HR";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Employees", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // ── Headers ────────────────────────────────────────────────────────────────
  const headerRow = sheet.addRow(Array.from(EMPLOYEE_EXPORT_HEADERS));
  headerRow.eachCell((cell, colIndex) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D9488" }, // emerald-600 — matches Zawadi brand
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF0F766E" } },
    };
    void colIndex; // suppress unused-variable
  });

  // ── Data rows ──────────────────────────────────────────────────────────────
  for (const r of rows) {
    const e = r.employee;
    const dept = r.department;
    const dataRow = sheet.addRow([
      str(e.empNo),
      str(e.firstName),
      str(e.middleName),
      str(e.lastName),
      str(e.email),
      str(e.phone),
      str(e.gender),
      str(e.nationalId),
      str(e.kraPin),
      str(e.nssfNo),
      str(e.shifNo),
      str(dept?.name),
      str(e.position),
      str(e.employmentType),
      str(e.residentStatus),
      str(e.salaryBasis),
      str(e.payMethod),
      str(e.bankName),
      str(e.bankBranchName),
      str(e.bankAccount),
      str(e.mpesaPhone),
      centsNum(e.basicSalary),
      centsNum(e.houseAllowance),
      centsNum(e.transportAllowance),
      centsNum(e.otherAllowance),
      centsNum(e.nonCashBenefit),
      centsNum(e.insurancePremium),
      centsNum(e.pensionEmployee),
      centsNum(e.pensionEmployer),
      centsNum(e.mortgageInterest),
      centsNum(e.helbMonthly),
      centsNum(e.saccoMonthly),
      e.disabilityExemption ? "Yes" : "No",
      str(e.workDaysPerWeek),
      e.worksOnHolidays ? "Yes" : "No",
      str(e.hireDate),
      str(e.status),
      str(e.dateOfBirth),
      str(e.region),
      str(e.educationLevel),
      str(e.nokName),
      str(e.nokRelationship),
      str(e.nokPhone),
      str(e.nokEmail),
    ]);

    // Apply number format to money columns
    dataRow.eachCell((cell, colIndex) => {
      if (MONEY_COL_INDICES.has(colIndex - 1)) {
        cell.numFmt = '#,##0.00';
      }
    });
  }

  // ── Auto-fit column widths ─────────────────────────────────────────────────
  sheet.columns.forEach((col, idx) => {
    const header = EMPLOYEE_EXPORT_HEADERS[idx] ?? "";
    let maxLen = header.length;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value == null ? "" : String(cell.value);
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(Math.max(maxLen + 2, 10), 40);
  });

  // ── Download ───────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
