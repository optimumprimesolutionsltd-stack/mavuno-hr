import PDFDocument from "pdfkit";

export interface P10MonthRow {
  month: string; // e.g. "January"
  basic: number;
  benefits: number;
  quarters: number;
  grossPay: number;
  definedContribution: number;
  affordableHousingLevy: number;
  shif: number;
  postRetirementMedical: number;
  ownerOccupiedInterest: number;
  totalDeductions: number;
  chargeablePay: number;
  taxCharged: number;
  personalRelief: number;
  insuranceRelief: number;
  payeTax: number;
}

export interface P10CardData {
  orgName: string;
  orgKraPin?: string;
  year: string;
  employee: {
    empNo: string;
    firstName: string;
    lastName: string;
    otherNames?: string;
    kraPin?: string;
  };
  months: P10MonthRow[];
  totals: P10MonthRow;
}

function kes(cents: number): string {
  if (cents === 0) return "";
  const neg = cents < 0;
  const a = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(a / 100).toLocaleString("en-KE")}.${String(a % 100).padStart(2, "0")}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BASE_HEADER_COLS = [
  { label: "MONTH", width: 52, money: false },
  { label: "Basic\nSalary", width: 52, money: true },
  { label: "Benefits-\nNonCash", width: 48, money: true },
  { label: "Value of\nQuarters", width: 48, money: true },
  { label: "Total Gross\nPay", width: 52, money: true },
  { label: "Defined Contribution\nRetirement Scheme", width: 62, money: true },
  { label: "Affordable\nHousing Levy\n(AHL)", width: 48, money: true },
  { label: "Social Health\nInsurance Fund\n(SHIF)", width: 48, money: true },
  { label: "Post\nRetirement\nMedical Fund\n(PRMF)", width: 48, money: true },
  { label: "Owner-\nOccupied\nInterest", width: 48, money: true },
  { label: "Total\nDeductions", width: 52, money: true },
  { label: "Chargeable\nPay (D-J)", width: 52, money: true },
  { label: "Tax\nCharged", width: 48, money: true },
  { label: "Personal\nRelief", width: 48, money: true },
  { label: "Insurance\nRelief", width: 48, money: true },
  { label: "PAYE Tax\n(L-M-N)", width: 52, money: true },
];

export function generateP10Pdf(cards: P10CardData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: "P10 Tax Deduction Card", Author: "Mavuno HR", Subject: "KRA P10" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PL = 28;
    const PT = 28;
    const PR = 28;
    const PW = doc.page.width - PL - PR;

    let cardIndex = 0;
    for (const card of cards) {
      if (cardIndex > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
      cardIndex++;
      let y = PT;

      // ── KRA HEADER ───────────────────────────────────────────────────────────
      doc.font("Helvetica-Bold").fontSize(12).fill("#000000")
         .text("KENYA REVENUE AUTHORITY", PL + 40, y, { width: 300, align: "left" });
      doc.font("Helvetica").fontSize(8).fill("#333333")
         .text("ISO 9001:2015 CERTIFIED", PL + 40, y + 14, { width: 300, align: "left" });
      doc.font("Helvetica").fontSize(9).fill("#000000")
         .text("KENYA REVENUE AUTHORITY DOMESTIC TAXES DEPARTMENT TAX DEDUCTION CARD YEAR 20", PL + 40, y + 30, { width: 500, align: "left" });
      doc.font("Helvetica-Bold").fontSize(10).fill("#000000")
         .text(card.year.slice(-2), PL + 486, y + 30, { width: 40, align: "left" });

      // Appendix label
      doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
         .text("APPENDIX 2A", PL, y + 14, { width: 90, align: "left" });

      // Right side PIN label
      doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
         .text("Employer's PIN", PL + PW - 160, y, { width: 80, align: "left" });
      doc.font("Helvetica").fontSize(8).fill("#000000")
         .text(card.orgKraPin || "", PL + PW - 80, y, { width: 80, align: "left" });
      doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
         .text("Employee's PIN", PL + PW - 160, y + 20, { width: 80, align: "left" });
      doc.font("Helvetica").fontSize(8).fill("#000000")
         .text(card.employee.kraPin || "", PL + PW - 80, y + 20, { width: 80, align: "left" });

      y += 52;

      // ── EMPLOYER / EMPLOYEE DETAILS ───────────────────────────────────────────
      doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
         .text("Employers Name", PL, y, { width: 100, align: "left" });
      doc.font("Helvetica").fontSize(8).fill("#000000")
         .text(card.orgName, PL + 90, y, { width: 300, align: "left" });

      doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
         .text("Employee's Main Name", PL, y + 16, { width: 110, align: "left" });
      doc.font("Helvetica").fontSize(8).fill("#000000")
         .text(`${card.employee.firstName} ${card.employee.lastName}`, PL + 110, y + 16, { width: 300, align: "left" });

      doc.font("Helvetica-Bold").fontSize(8).fill("#000000")
         .text("Employee's Other Names", PL, y + 32, { width: 120, align: "left" });
      doc.font("Helvetica").fontSize(8).fill("#000000")
         .text(card.employee.otherNames || "", PL + 120, y + 32, { width: 300, align: "left" });

      y += 54;

      // ── MONTHLY TABLE ───────────────────────────────────────────────────────
      const tableTop = y;
      const rowHeight = 22;
      const headerHeight = 48;
       const baseTotalWidth = BASE_HEADER_COLS.reduce((s, c) => s + c.width, 0);
       const scale = Math.min(1, PW / baseTotalWidth);
       const colSpec = BASE_HEADER_COLS.map((c) => ({ ...c, width: c.width * scale }));
      const totalWidth = colSpec.reduce((s, c) => s + c.width, 0);
      const startX = PL + (PW - totalWidth) / 2;
      let x = startX;

      // Header background
      doc.rect(startX, tableTop, totalWidth, headerHeight).fill("#e0e0e0");
      doc.rect(startX, tableTop, totalWidth, headerHeight).stroke("#000000");

      // Header lines and text
      x = startX;
      for (const col of colSpec) {
        doc.moveTo(x, tableTop).lineTo(x, tableTop + headerHeight).stroke("#000000");
        doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
           .text(col.label, x + 2, tableTop + 4, { width: col.width - 4, align: "center" });
        x += col.width;
      }
      doc.moveTo(x, tableTop).lineTo(x, tableTop + headerHeight).stroke("#000000");
      doc.moveTo(startX, tableTop + headerHeight).lineTo(startX + totalWidth, tableTop + headerHeight).stroke("#000000");

      // Map months data by label
      const monthMap = new Map(card.months.map(m => [m.month, m]));

      // Data rows
      for (let i = 0; i < MONTHS.length; i++) {
        const monthName = MONTHS[i];
        const row = monthMap.get(monthName);
        const rowY = tableTop + headerHeight + i * rowHeight;

        // Alternate shading
        if (i % 2 === 1) doc.rect(startX, rowY, totalWidth, rowHeight).fill("#f8f8f8");
        doc.rect(startX, rowY, totalWidth, rowHeight).stroke("#000000");

        x = startX;
        const cells: (string | number)[] = [
          monthName,
          row?.basic ?? 0,
          row?.benefits ?? 0,
          row?.quarters ?? 0,
          row?.grossPay ?? 0,
          row?.definedContribution ?? 0,
          row?.affordableHousingLevy ?? 0,
          row?.shif ?? 0,
          row?.postRetirementMedical ?? 0,
          row?.ownerOccupiedInterest ?? 0,
          row?.totalDeductions ?? 0,
          row?.chargeablePay ?? 0,
          row?.taxCharged ?? 0,
          row?.personalRelief ?? 0,
          row?.insuranceRelief ?? 0,
          row?.payeTax ?? 0,
        ];

        for (let ci = 0; ci < colSpec.length; ci++) {
          const col = colSpec[ci];
          const cell = cells[ci];
          doc.moveTo(x, rowY).lineTo(x, rowY + rowHeight).stroke("#000000");
          if (ci === 0) {
            doc.font("Helvetica").fontSize(6).fill("#000000")
               .text(String(cell), x + 2, rowY + 7, { width: col.width - 4, align: "left" });
          } else {
            doc.font("Helvetica").fontSize(6).fill("#000000")
               .text(kes(Number(cell)), x + 2, rowY + 7, { width: col.width - 4, align: "right" });
          }
          x += col.width;
        }
        doc.moveTo(x, rowY).lineTo(x, rowY + rowHeight).stroke("#000000");
      }

      // Total row
      const totalY = tableTop + headerHeight + MONTHS.length * rowHeight;
      doc.rect(startX, totalY, totalWidth, rowHeight).fill("#d0d0d0");
      doc.rect(startX, totalY, totalWidth, rowHeight).stroke("#000000");

      x = startX;
      const totalCells: (string | number)[] = [
        "TOTAL",
        card.totals.basic,
        card.totals.benefits,
        card.totals.quarters,
        card.totals.grossPay,
        card.totals.definedContribution,
        card.totals.affordableHousingLevy,
        card.totals.shif,
        card.totals.postRetirementMedical,
        card.totals.ownerOccupiedInterest,
        card.totals.totalDeductions,
        card.totals.chargeablePay,
        card.totals.taxCharged,
        card.totals.personalRelief,
        card.totals.insuranceRelief,
        card.totals.payeTax,
      ];
      for (let ci = 0; ci < colSpec.length; ci++) {
        const col = colSpec[ci];
        const cell = totalCells[ci];
        doc.moveTo(x, totalY).lineTo(x, totalY + rowHeight).stroke("#000000");
        if (ci === 0) {
          doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
             .text(String(cell), x + 2, totalY + 7, { width: col.width - 4, align: "left" });
        } else {
          doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
             .text(kes(Number(cell)), x + 2, totalY + 7, { width: col.width - 4, align: "right" });
        }
        x += col.width;
      }
      doc.moveTo(x, totalY).lineTo(x, totalY + rowHeight).stroke("#000000");

      y = totalY + rowHeight + 10;

       // ── BOTTOM NOTES ──────────────────────────────────────────────────────────
       doc.moveTo(PL, y - 5).lineTo(PL + PW, y - 5).stroke("#b8c2cc");
      doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
         .text("To be submitted by Employer at end of year", PL, y, { width: 200, align: "left" });
      y += 12;

      doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
         .text("TOTAL CHARGEABLE PAY (COL. K) Kshs.", PL, y, { width: 160, align: "left" });
      doc.font("Helvetica").fontSize(6).fill("#000000")
         .text(kes(card.totals.chargeablePay), PL + 160, y, { width: 100, align: "left" });

      doc.font("Helvetica-Bold").fontSize(6).fill("#000000")
         .text("TOTAL TAX (C", PL + 300, y, { width: 60, align: "left" });
      doc.font("Helvetica").fontSize(6).fill("#000000")
         .text(kes(card.totals.payeTax), PL + 360, y, { width: 100, align: "left" });

      y += 12;

      // Notes block (simplified)
      const notes = [
        "INSTRUCTIONS:",
        "(a) For all liable employees and where director/employer received benefits in addition to cash emoluments.",
        "(b) Where an employee is eligible to deduction on owner occuper interest.",
        "(c) Where an employee contributes to a post retirement medical fund.",
        "2. (a) Deductible interest in respect of any month prior to December 2024 must not exceed Kshs. 25,000/= and commencing December 2024 must not exceed Kshs. 30,000/=.",
        "(b) Deductible pension contribution in respect of any month prior to December 2024 must not exceed Kshs. 20,000/= and commencing December 2024 must not exceed Kshs. 30,000/=.",
        "(c) Deductible contribution to a post retirement medical fund in respect of any month is effective from December 2024, must not exceed Kshs. 15,000/=.",
        "(d) Deductible Contribution to the Social Health Insurance Fund (SHIF) and deductions made towards Affordable Housing Levy (AHL) are effective December 2024.",
        "(e) Personal Relief is Kshs. 2,400 per Month or 28,800 per year.",
        "(f) Insurance Relief is 15% of the Premium up to a Maximum of Kshs. 5,000 per month or Kshs. 60,000 per year.",
      ];
      doc.font("Helvetica").fontSize(5).fill("#000000");
      for (const note of notes) {
        doc.text(note, PL, y, { width: PW, align: "left" });
        y += 8;
      }
       doc.font("Helvetica").fontSize(6).fill("#667085")
          .text(`Generated by Mavuno HR  •  P10 ${card.year}  •  Employee ${card.employee.empNo}`, PL, doc.page.height - 18, { width: PW, align: "right" });
    }

    doc.end();
  });
}
