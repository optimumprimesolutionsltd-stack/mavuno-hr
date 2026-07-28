import PDFDocument from "pdfkit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PayslipPdfData {
  // Organisation
  orgName: string;
  orgKraPin?: string;
  orgNssfNo?: string;
  // Run
  period: string;
  runName: string;
  // Employee
  empNo: string;
  empName: string;
  position: string;
  employmentType: string;
  nationalId?: string;
  kraPin?: string;
  nssfNo?: string;
  shifNo?: string;
  bankName?: string;
  bankAccount?: string;
  mpesaPhone?: string;
  // Days
  daysPayable: number;
  daysInPeriod: number;
  // Earnings (all cents)
  basic: number;
  allowances: number;
  overtime: number;
  adjustmentEarnings: number;
  nonCashBenefit: number;
  gross: number;
  cashGross: number;
  // Statutory deductions
  paye: number;
  nssfEmployee: number;
  nssfTier1: number;
  nssfTier2: number;
  tier2Label?: string;
  shif: number;
  housingLevyEmployee: number;
  // Non-statutory deductions
  pension: number;
  helb: number;
  sacco: number;
  loanDeduction: number;
  adjustmentDeductions: number;
  // Summary
  totalDeductions: number;
  netPay: number;
  // Employer (info only)
  nssfEmployer: number;
  housingLevyEmployer: number;
  pensionEmployer: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function kes(cents: number): string {
  if (cents === 0) return "—";
  const neg = cents < 0;
  const a = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(a / 100).toLocaleString("en-KE")}.${String(a % 100).padStart(2, "0")}`;
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generatePayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `Payslip ${data.period} — ${data.empName}`,
        Author: data.orgName,
        Subject: "Employee Payslip",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Colour palette ─────────────────────────────────────────────────
    const BG      = "#0f172a";  // header bg (dark navy)
    const GREEN   = "#22c55e";  // accent
    const WHITE   = "#ffffff";
    const CARD    = "#f8fafc";  // light card bg
    const BORDER  = "#e2e8f0";  // row dividers
    const DARK    = "#0f172a";  // body text
    const MID     = "#475569";  // label text
    const LIGHT   = "#94a3b8";  // secondary label

    const PL = 40; // page left margin
    const PR = 40; // page right margin
    const PW = doc.page.width - PL - PR; // 515 pts

    let y = 0;

    // ── HEADER BAND ────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 88).fill(BG);

    // Logo text
    doc.fill(WHITE).font("Helvetica-Bold").fontSize(20)
       .text("ZAWADI", PL, 24, { continued: true })
       .fill(GREEN).text(".HR");

    // Org name under logo
    doc.fill(LIGHT).font("Helvetica").fontSize(9)
       .text(data.orgName.toUpperCase(), PL, 50, { width: 250 });

    // Period badge
    const badgeW = 90;
    const badgeX = doc.page.width - PR - badgeW;
    doc.rect(badgeX, 20, badgeW, 26).fill(GREEN);
    doc.fill(BG).font("Helvetica-Bold").fontSize(9)
       .text(data.period, badgeX, 27, { width: badgeW, align: "center" });

    // "PAYSLIP" label
    doc.fill(LIGHT).font("Helvetica").fontSize(8)
       .text("PAYSLIP", badgeX, 52, { width: badgeW, align: "center" });

    y = 104;

    // ── EMPLOYEE INFO ROW ──────────────────────────────────────────────
    // Name + position
    doc.fill(DARK).font("Helvetica-Bold").fontSize(14)
       .text(data.empName, PL, y);
    doc.fill(MID).font("Helvetica").fontSize(9)
       .text(`${data.empNo}  •  ${data.position}  •  ${data.employmentType.replace("_", " ")}`, PL, y + 18);

    y += 48;

    // Info grid — 3 columns × 2 rows
    const infoItems: [string, string][] = [
      ["KRA PIN",    data.kraPin     || "—"],
      ["NSSF No",    data.nssfNo     || "—"],
      ["SHIF No",    data.shifNo     || "—"],
      ["National ID", data.nationalId || "—"],
      ["Bank",       data.bankName ? `${data.bankName} · ${data.bankAccount}` : (data.mpesaPhone ? `M-Pesa ${data.mpesaPhone}` : "—")],
      ["Days Payable", `${data.daysPayable} / ${data.daysInPeriod}`],
    ];

    const colW3 = PW / 3;
    infoItems.forEach(([label, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = PL + col * colW3;
      const iy = y + row * 30;
      doc.fill(LIGHT).font("Helvetica").fontSize(7).text(label, x, iy);
      doc.fill(DARK).font("Helvetica").fontSize(9).text(val, x, iy + 10, { width: colW3 - 8 });
    });

    y += 75;

    // ── Divider ────────────────────────────────────────────────────────
    doc.moveTo(PL, y).lineTo(PL + PW, y).lineWidth(0.5).stroke(BORDER);
    y += 14;

    // ── Helper to draw a section ───────────────────────────────────────
    function sectionHeader(title: string) {
      doc.rect(PL, y, PW, 20).fill(BG);
      doc.fill(WHITE).font("Helvetica-Bold").fontSize(8)
         .text(title, PL + 8, y + 6, { width: PW - 16 });
      y += 24;
    }

    function dataRow(label: string, amount: number, opts: { bold?: boolean; greenBg?: boolean; indent?: boolean } = {}) {
      if (amount === 0 && !opts.bold) return; // skip zero rows
      if (opts.greenBg) {
        doc.rect(PL, y, PW, 22).fill(GREEN);
        doc.fill(BG).font("Helvetica-Bold").fontSize(10)
           .text(label, PL + 8, y + 6, { width: PW - 100, continued: false });
        doc.fill(BG).font("Helvetica-Bold").fontSize(10)
           .text(kes(amount), PL, y + 6, { width: PW - 8, align: "right" });
        y += 24;
      } else {
        doc.rect(PL, y, PW, 18).fill(y % 36 < 18 ? CARD : WHITE); // alternate row shading
        const labelX = opts.indent ? PL + 16 : PL + 8;
        const labelW = opts.indent ? PW - 120 : PW - 112;
        const color  = opts.bold ? DARK : MID;
        const font   = opts.bold ? "Helvetica-Bold" : "Helvetica";
        doc.fill(color).font(font).fontSize(9)
           .text(label, labelX, y + 4, { width: labelW });
        doc.fill(opts.bold ? DARK : MID).font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
           .text(kes(amount), PL, y + 4, { width: PW - 8, align: "right" });
        if (opts.bold) {
          doc.moveTo(PL, y + 18).lineTo(PL + PW, y + 18).lineWidth(0.5).stroke(BORDER);
        }
        y += 18;
      }
    }

    // ── EARNINGS ──────────────────────────────────────────────────────
    sectionHeader("EARNINGS");
    dataRow("Basic Salary",          data.basic);
    dataRow("Allowances",            data.allowances,         { indent: true });
    dataRow("Overtime Pay",          data.overtime,           { indent: true });
    dataRow("Bonus / Adjustments",   data.adjustmentEarnings, { indent: true });
    dataRow("Non-Cash Benefit",      data.nonCashBenefit,     { indent: true });
    dataRow("GROSS PAY",             data.gross,              { bold: true });

    y += 8;

    // ── STATUTORY DEDUCTIONS ───────────────────────────────────────────
    sectionHeader("STATUTORY DEDUCTIONS");
    dataRow("Income Tax (PAYE)",         data.paye);
    if (data.nssfTier1 > 0 || data.nssfTier2 > 0) {
      dataRow("NSSF — Tier I",           data.nssfTier1,       { indent: true });
      dataRow(data.tier2Label ?? "NSSF — Tier II", data.nssfTier2, { indent: true });
    } else {
      dataRow("NSSF",                    data.nssfEmployee);
    }
    dataRow("SHIF",                      data.shif);
    dataRow("Affordable Housing Levy",   data.housingLevyEmployee);

    y += 8;

    // ── OTHER DEDUCTIONS (only if any) ─────────────────────────────────
    const otherDed = data.pension + data.helb + data.sacco + data.loanDeduction + data.adjustmentDeductions;
    if (otherDed > 0) {
      sectionHeader("OTHER DEDUCTIONS");
      dataRow("Pension (Employee)",   data.pension);
      dataRow("HELB Repayment",       data.helb);
      dataRow("SACCO",                data.sacco);
      dataRow("Loan Repayment",       data.loanDeduction);
      dataRow("Other Deductions",     data.adjustmentDeductions);
      y += 8;
    }

    // ── TOTALS ─────────────────────────────────────────────────────────
    sectionHeader("SUMMARY");
    dataRow("Total Deductions",   data.totalDeductions, { bold: true });
    y += 4;
    dataRow("NET PAY",            data.netPay,          { greenBg: true });

    y += 12;

    // ── EMPLOYER CONTRIBUTIONS (info strip) ────────────────────────────
    const empContrib = data.nssfEmployer + data.housingLevyEmployer + data.pensionEmployer;
    if (empContrib > 0) {
      doc.rect(PL, y, PW, 16).fill(CARD);
      doc.fill(LIGHT).font("Helvetica").fontSize(7)
         .text(
           `EMPLOYER CONTRIBUTIONS (info) — NSSF: ${kes(data.nssfEmployer)}   AHL: ${kes(data.housingLevyEmployer)}   Pension: ${kes(data.pensionEmployer)}`,
           PL + 8, y + 4, { width: PW - 16 }
         );
      y += 20;
    }

    y += 16;

    // ── FOOTER ────────────────────────────────────────────────────────
    doc.moveTo(PL, y).lineTo(PL + PW, y).lineWidth(0.5).stroke(BORDER);
    doc.fill(LIGHT).font("Helvetica").fontSize(7)
       .text(
         `${data.orgName}${data.orgKraPin ? "  •  KRA PIN: " + data.orgKraPin : ""}  •  Payroll Period: ${data.period}  •  Generated by Zawadi HR`,
         PL, y + 8, { width: PW, align: "center" }
       );

    doc.end();
  });
}
