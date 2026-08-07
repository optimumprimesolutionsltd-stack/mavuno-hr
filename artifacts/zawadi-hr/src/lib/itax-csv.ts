/**
 * KRA iTax CSV export utilities.
 * All money values coming in are integer cents; we divide by 100 and format to 2 d.p.
 */
import ExcelJS from "exceljs";
import shifTemplateUrl from "@assets/Payroll_Template_1786084532401.xlsx?url";

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

/** KRA's simplified P10A CSV renders monetary values with thousands separators. */
function centsToP10aKes(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    residentStatus?: string;
    employeeType?: string;
    pwd?: string;
    exemptionCertificateNumber?: string;
    totalCashPay?: number;
    carBenefit?: number;
    mealsBenefit?: number;
    nonCashBenefits?: number;
    housingType?: string;
    housingBenefit?: number;
    otherBenefits?: number;
    gross: number;
    shif?: number;
    nssf?: number;
    otherPension?: number;
    postRetirementMedical?: number;
    mortgageInterest: number;
    affordableHousingLevy?: number;
    taxablePay?: number;
    personalRelief: number;
    insuranceRelief: number;
    paye?: number;
    selfAssessedPaye?: number;
  }>;
  period: string;
  orgKraPin: string;
}): void {
  const csvRows = data.rows.map((r) => [
    r.kraPin,
    r.name,
    r.residentStatus ?? "Resident",
    r.employeeType ?? "Primary Employee",
    r.pwd ?? "No",
    r.exemptionCertificateNumber ?? "",
    r.totalCashPay ?? r.gross,
    r.carBenefit ?? 0,
    r.mealsBenefit ?? 0,
    r.nonCashBenefits ?? 0,
    r.housingType ?? "Benefit not given",
    r.housingBenefit ?? 0,
    r.otherBenefits ?? 0,
    r.gross,
    r.shif ?? 0,
    r.nssf ?? 0,
    r.otherPension ?? 0,
    r.postRetirementMedical ?? 0,
    r.mortgageInterest,
    r.affordableHousingLevy ?? 0,
    r.taxablePay ?? 0,
    r.personalRelief,
    r.insuranceRelief,
    r.paye ?? 0,
    r.selfAssessedPaye ?? 0,
  ] as (string | number)[]);

  // KRA's simplified P10A upload is a headerless, positional CSV.
  // Keep the trailing newline and empty fields exactly as the reference export.
  const csv = csvRows.map((row) => row.map((cell) => {
    if (typeof cell === "number") return `"${centsToP10aKes(cell)}"`;
    return `"${String(cell ?? "").replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
  const orgPin = data.orgKraPin.replace(/[^A-Z0-9]/gi, "") || "ORG";
  downloadCsv(`P10A_${data.period}_${orgPin}.csv`, csv);
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

type NssfWorkbookData = {
  rows: Array<{
    empNo: string;
    firstName?: string;
    lastName?: string;
    name: string;
    nationalId?: string;
    nssfNo: string;
    tier1Employee: number;
    tier2Employee: number;
    total: number;
  }>;
  period: string;
  orgName?: string;
  orgNssfEmployerNo: string;
};

/** Build the nine-column NSSF XLSX schedule shown in the uploaded reference. */
export async function buildNssfWorkbook(data: NssfWorkbookData): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zawadi HR";
  const sheet = workbook.addWorksheet("Sheet1");
  const title = `NSSF_${data.period}_${data.orgNssfEmployerNo || "ORG"}`;
  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = title;
  sheet.getCell("B2").value = "EMPLOYER NUMBER";
  sheet.getCell("C2").value = data.orgNssfEmployerNo;
  sheet.getCell("B3").value = "EMPLOYER NAME";
  sheet.getCell("C3").value = data.orgName ?? "";
  sheet.getCell("B4").value = "MONTH OF CONTRIBUTION";
  sheet.getCell("C4").value = formatContributionMonth(data.period);

  const headers = [
    "PAYROLL NO",
    "EMPLOYEE'S NAME",
    "ID NO",
    "NSSF NO",
    "TIER 1 AMOUNT",
    "TIER 2 AMOUNT",
    "VOL. AMOUNT",
    "TOTAL AMOUNT",
  ];
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 2).value = header;
  });

  data.rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 6);
    excelRow.getCell(1).value = index + 1;
    excelRow.getCell(2).value = row.empNo;
    excelRow.getCell(3).value = row.name;
    excelRow.getCell(4).value = row.nationalId ?? "";
    excelRow.getCell(5).value = row.nssfNo;
    excelRow.getCell(6).value = row.tier1Employee / 100;
    excelRow.getCell(7).value = row.tier2Employee / 100;
    excelRow.getCell(8).value = 0;
    excelRow.getCell(9).value = row.total / 100;
    excelRow.getCell(1).numFmt = "0";
    excelRow.getCell(4).numFmt = "0";
    excelRow.getCell(5).numFmt = "0";
    excelRow.getCell(6).numFmt = "#,##0.00";
    excelRow.getCell(7).numFmt = "#,##0.00";
    excelRow.getCell(8).numFmt = "0.00";
    excelRow.getCell(9).numFmt = "#,##0.00";
  });

  [6, 28.35, 33.75, 10.8, 13.5, 17.55, 17.55, 14.85, 16.2]
    .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(5).font = { bold: true };
  return (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
}

function formatContributionMonth(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

export async function downloadNssfWorkbook(data: NssfWorkbookData): Promise<void> {
  const buffer = await buildNssfWorkbook(data);
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NSSF_${data.period}_${data.orgNssfEmployerNo || "ORG"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ── SHIF SHA portal Excel upload template ───────────────────────────────────

export const SHIF_HEADERS = [
  "PAYROLL NUMBER",
  "FIRSTNAME",
  "LASTNAME",
  "IDENTITY TYPE",
  "ID NO",
  "KRA PIN",
  "SHIF NO",
  "CONTRIBUTION AMOUNT",
  "PHONE",
] as const;

const SHIF_IDENTITY_TYPES = [
  "Refugee ID",
  "National ID",
  "Alien ID",
  "Passport Number",
] as const;

type ShifTemplateData = {
  rows: Array<{
    empNo: string;
    firstName: string;
    lastName: string;
    phone: string;
    kraPin: string;
    shifNo: string;
    nationalId: string;
    shifAmount: number;
  }>;
  period: string;
  orgName: string;
};

/** Build a SHIF workbook from the uploaded SHA template without changing its structure. */
export async function buildShifTemplate(data: ShifTemplateData): Promise<Uint8Array> {
  const response = await fetch(shifTemplateUrl);
  if (!response.ok) {
    throw new Error("The SHIF template could not be loaded.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer() as any);
  const sheet = workbook.getWorksheet("Sheet1");
  if (!sheet) throw new Error("The SHIF template is missing Sheet1.");

  data.rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 2);
    const values = [
      row.empNo,
      row.firstName,
      row.lastName,
      row.nationalId ? "National ID" : "",
      row.nationalId,
      row.kraPin,
      row.shifNo,
      row.shifAmount / 100,
      row.phone,
    ];
    values.forEach((value, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      cell.value = value;
    });
  });

  return (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
}

/** Build and immediately download the exact uploaded SHIF Excel template. */
export async function downloadShifTemplate(data: ShifTemplateData): Promise<void> {
  const buffer = await buildShifTemplate(data);
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const org = data.orgName.replace(/[^A-Z0-9]/gi, "").slice(0, 10) || "ORG";
  a.href = url;
  a.download = `SHIF_${data.period}_${org}.xlsx`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
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
