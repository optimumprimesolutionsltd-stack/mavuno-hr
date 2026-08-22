import PDFDocument from "pdfkit";

export interface P9EmployeeRow {
  empNo: string;
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
}

export interface P9FormData {
  orgName: string;
  orgKraPin?: string;
  year: string;
  rows: P9EmployeeRow[];
  totalPaye: number;
  totalGross: number;
  totalChargeablePay: number;
}

function kes(cents: number): string {
  if (cents === 0) return "0.00";
  const neg = cents < 0;
  const a = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(a / 100).toLocaleString("en-KE")}.${String(a % 100).padStart(2, "0")}`;
}

export function generateP9Pdf(data: P9FormData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: `P9 Annual Tax Return ${data.year}`, Author: "Mizani HR", Subject: "KRA P9" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PL = 28;
    const PT = 40;
    const PR = 28;
    const PW = doc.page.width - PL - PR;

    let y = PT;

    // ── KRA HEADER ─────────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(14).fill("#000000")
       .text("KENYA REVENUE AUTHORITY", PL, y, { width: PW, align: "center" });
    doc.font("Helvetica").fontSize(8).fill("#333333")
       .text("ISO 9001:2015 CERTIFIED", PL, y + 18, { width: PW, align: "center" });
    doc.font("Helvetica-Bold").fontSize(11).fill("#000000")
       .text("P9 EMPLOYER'S ANNUAL TAX DEDUCTION RETURN", PL, y + 34, { width: PW, align: "center" });

    y += 64;

    // ── EMPLOYER DETAILS ───────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
       .text("Employer's Name:", PL, y, { width: 90, align: "left" });
    doc.font("Helvetica").fontSize(8).fill("#000000")
       .text(data.orgName, PL + 92, y, { width: PW - 92, align: "left" });

    doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
       .text("Employer's PIN:", PL, y + 16, { width: 90, align: "left" });
    doc.font("Helvetica").fontSize(8).fill("#000000")
       .text(data.orgKraPin || "", PL + 92, y + 16, { width: 200, align: "left" });

    doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
       .text("Year of Income:", PL, y + 32, { width: 90, align: "left" });
    doc.font("Helvetica").fontSize(8).fill("#000000")
       .text(data.year, PL + 92, y + 32, { width: 100, align: "left" });

    y += 58;

    // ── EMPLOYEE SUMMARY TABLE ─────────────────────────────────────────────────
    const baseColSpec = [
      { label: "Employee's PIN", width: 80, money: false },
      { label: "Employee's Name", width: 120, money: false },
      { label: "Basic Salary", width: 60, money: true },
      { label: "Benefits in Kind", width: 60, money: true },
      { label: "Value of Quarters", width: 60, money: true },
      { label: "Total Gross Pay", width: 60, money: true },
      { label: "Owner Occupied Interest", width: 60, money: true },
      { label: "Defined Contribution / NSSF", width: 60, money: true },
      { label: "Chargeable Income", width: 60, money: true },
      { label: "Tax Charged", width: 60, money: true },
      { label: "Personal Relief", width: 60, money: true },
      { label: "Insurance Relief", width: 60, money: true },
      { label: "Net PAYE", width: 60, money: true },
    ];

    const baseTotalWidth = baseColSpec.reduce((s, c) => s + c.width, 0);
    const scale = Math.min(1, PW / baseTotalWidth);
    const colSpec = baseColSpec.map((c) => ({ ...c, width: c.width * scale }));
    const totalWidth = colSpec.reduce((s, c) => s + c.width, 0);
    const startX = PL + (PW - totalWidth) / 2;
    const rowHeight = 18;
    const headerHeight = 36;

    // Header
    doc.rect(startX, y, totalWidth, headerHeight).fill("#e0e0e0").stroke("#000000");
    let x = startX;
    for (const col of colSpec) {
      doc.moveTo(x, y).lineTo(x, y + headerHeight).stroke("#000000");
      doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
         .text(col.label, x + 2, y + 4, { width: col.width - 4, align: "center" });
      x += col.width;
    }
    doc.moveTo(x, y).lineTo(x, y + headerHeight).stroke("#000000");

    const tableTop = y + headerHeight;

    // Data rows
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const rowY = tableTop + i * rowHeight;
      if (i % 2 === 1) doc.rect(startX, rowY, totalWidth, rowHeight).fill("#f8f8f8");
      doc.rect(startX, rowY, totalWidth, rowHeight).stroke("#000000");

      const cells: (string | number)[] = [
        row.kraPin,
        row.name,
        row.annualGross,
        row.benefits,
        row.quarters,
        row.annualTotalGross,
        row.annualMortgageInterest,
        row.annualDefinedContribution,
        row.annualChargeablePay,
        row.annualTaxChargeable,
        row.annualPersonalRelief,
        row.annualInsuranceRelief,
        row.annualNetPaye,
      ];

      x = startX;
      for (let ci = 0; ci < colSpec.length; ci++) {
        const col = colSpec[ci];
        const cell = cells[ci];
        doc.moveTo(x, rowY).lineTo(x, rowY + rowHeight).stroke("#000000");
        if (col.money) {
          doc.font("Helvetica").fontSize(6).fill("#000000")
             .text(kes(Number(cell)), x + 2, rowY + 5, { width: col.width - 4, align: "right" });
        } else {
          doc.font("Helvetica").fontSize(6).fill("#000000")
             .text(String(cell), x + 2, rowY + 5, { width: col.width - 4, align: "left" });
        }
        x += col.width;
      }
      doc.moveTo(x, rowY).lineTo(x, rowY + rowHeight).stroke("#000000");
    }

    // Total row
    const totalY = tableTop + data.rows.length * rowHeight;
    doc.rect(startX, totalY, totalWidth, rowHeight).fill("#d0d0d0").stroke("#000000");
    x = startX;
    const totalCells: (string | number)[] = [
      "TOTAL", "", data.totalGross, 0, 0, data.totalGross, 0, 0, data.totalChargeablePay, 0, 0, 0, data.totalPaye,
    ];
    for (let ci = 0; ci < colSpec.length; ci++) {
      const col = colSpec[ci];
      const cell = totalCells[ci];
      doc.moveTo(x, totalY).lineTo(x, totalY + rowHeight).stroke("#000000");
      if (col.money) {
        doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
           .text(kes(Number(cell)), x + 2, totalY + 5, { width: col.width - 4, align: "right" });
      } else {
        doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
           .text(String(cell), x + 2, totalY + 5, { width: col.width - 4, align: "left" });
      }
      x += col.width;
    }
    doc.moveTo(x, totalY).lineTo(x, totalY + rowHeight).stroke("#000000");

    y = totalY + rowHeight + 20;

    // ── DECLARATION ────────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
       .text("DECLARATION", PL, y, { width: 100, align: "left" });
    y += 14;

    doc.font("Helvetica").fontSize(7).fill("#000000")
       .text("I declare that the particulars given above are correct and complete to the best of my knowledge and belief.", PL, y, { width: PW, align: "left" });
    y += 18;

    doc.font("Helvetica-Bold").fontSize(7).fill("#000000")
       .text("Signature: _________________________________", PL, y, { width: 240, align: "left" });
    doc.font("Helvetica-Bold").fontSize(7).fill("#000000")
       .text("Date: _________________________________", PL + 260, y, { width: 240, align: "left" });

    y += 28;

    doc.moveTo(PL, y - 8).lineTo(PL + PW, y - 8).stroke("#b8c2cc");
    doc.font("Helvetica").fontSize(6).fill("#667085")
       .text(`Generated by Mizani HR  •  P9 ${data.year}  •  ${data.rows.length} employees`, PL, y, { width: PW, align: "center" });

    doc.end();
  });
}
