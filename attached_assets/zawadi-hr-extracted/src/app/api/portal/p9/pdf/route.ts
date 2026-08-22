import { NextResponse } from "next/server";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { getEmployeeP9 } from "@/lib/p9";
import { num0, kes2 } from "@/lib/format";
import PDFDocument from "pdfkit";

export const GET = route({ permission: "self:read" }, async ({ principal, req }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const year = new URL(req.url).searchParams.get("year") ?? String(new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) throw new HttpError(422, "Year must be YYYY");

    const p9 = await getEmployeeP9(tx, principal.orgId, principal.employeeId, year);
    if (!p9) throw new HttpError(404, "Employee not found");

    const e = p9.employee;
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    doc.fontSize(16).font("Helvetica-Bold").text("P9 TAX DEDUCTION CARD", { align: "center" });
    doc.fontSize(10).font("Helvetica").text(`Year of Income: ${year}`, { align: "center" });
    doc.moveDown(1);

    doc.fontSize(9).font("Helvetica-Bold").text(`Employee: ${e.name}   |   Staff No: ${e.empNo}`);
    doc.font("Helvetica").text(`KRA PIN: ${e.kraPin ?? "-"}   |   National ID: ${e.nationalId ?? "-"}`);
    doc.moveDown(1);

    const headers = ["Month","Basic","Gross Pay","NSSF/Pension","Taxable","PAYE Charged","Reliefs","PAYE Deducted"];
    const colWidths = [55, 60, 65, 65, 65, 65, 55, 65];
    let y = doc.y;
    const startX = doc.page.margins.left;

    const drawRow = (cells: string[], bold = false) => {
      let x = startX;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
      cells.forEach((c, i) => {
        doc.text(c, x, y, { width: colWidths[i], align: i === 0 ? "left" : "right" });
        x += colWidths[i];
      });
      y += 16;
    };

    drawRow(headers, true);
    doc.moveTo(startX, y - 4).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y - 4).stroke();

    if (p9.months.length === 0) {
      doc.font("Helvetica").fontSize(9).text("No paid payroll runs found for this year.", startX, y);
      y += 20;
    } else {
      for (const r of p9.months) {
        drawRow([
          r.period,
          num0(r.basic),
          num0(r.gross),
          num0(r.definedContribution),
          num0(r.taxable),
          num0(r.payeCharged),
          num0(r.personalRelief + r.insuranceRelief),
          num0(r.payeDeducted),
        ]);
      }
      doc.moveTo(startX, y - 4).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y - 4).stroke();
      drawRow([
        "TOTAL",
        num0(p9.totals.basic),
        num0(p9.totals.gross),
        num0(p9.totals.definedContribution),
        num0(p9.totals.taxable),
        num0(p9.totals.payeCharged),
        num0(p9.totals.personalRelief + p9.totals.insuranceRelief),
        num0(p9.totals.payeDeducted),
      ], true);
    }

    doc.y = y + 20;
    doc.fontSize(9).font("Helvetica-Bold")
      .text(`Total PAYE Deducted for ${year}: ${kes2(p9.totals.payeDeducted)}`, startX, doc.y);
    doc.moveDown(2);
    doc.fontSize(7.5).font("Helvetica").fillColor("#666").text(
      "This is a system-generated tax deduction card summary, covering paid payroll runs only. " +
      "Figures should be reconciled against filed KRA returns.",
      startX,
    );

    doc.end();
    const buffer = await done;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="P9-${e.empNo}-${year}.pdf"`,
      },
    });
  }),
);
