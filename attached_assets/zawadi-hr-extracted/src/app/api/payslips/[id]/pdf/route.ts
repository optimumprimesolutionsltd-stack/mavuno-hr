import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { payslips, payrollRuns, employees, organizations } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { can } from "@/lib/auth/rbac";
import { num2, kes2 } from "@/lib/format";
import PDFDocument from "pdfkit";

/**
 * PASSWORD-PROTECTED PDF PAYSLIP.
 *
 * Payslips travel: they get emailed, forwarded to banks for loan applications,
 * left in shared downloads folders. Encrypting the PDF with a password the
 * employee already knows (national ID, falling back to staff number) means an
 * intercepted file is not an open salary disclosure. This mirrors standard
 * practice in Kenyan payroll bureaux.
 *
 * Access: an employee can fetch only their OWN payslip; payroll-privileged
 * roles can fetch any in their org. Draft-run payslips are visible only to
 * payroll roles — an employee must never see numbers that can still change.
 */
export const GET = route({ permission: "self:read" }, async ({ principal, params }) =>
  withTenant(principal.orgId, async (tx) => {
    const slipId = Number(params.id);

    const [row] = await tx
      .select({ p: payslips, e: employees, run: payrollRuns })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.id, slipId), eq(payslips.orgId, principal.orgId)));
    if (!row) throw new HttpError(404, "Payslip not found");

    const privileged = can(principal.role, "payroll:read");
    if (!privileged && row.e.id !== principal.employeeId) {
      throw new HttpError(403, "You can only download your own payslips");
    }
    if (!privileged && row.run.status !== "paid") {
      throw new HttpError(403, "This payslip is not finalised yet");
    }

    const [org] = await tx.select().from(organizations).where(eq(organizations.id, principal.orgId));

    const userPassword = row.e.nationalId || row.e.empNo;

    const doc = new PDFDocument({
      size: "A5", layout: "landscape", margin: 28,
      userPassword,                       // open password: employee's ID / staff no
      ownerPassword: undefined,
      permissions: { printing: "highResolution", modifying: false, copying: false },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    doc.fontSize(13).font("Helvetica-Bold").text(org.name, { align: "center" });
    doc.fontSize(9).font("Helvetica")
      .text(`PAYSLIP — ${row.run.name} (${row.run.period})`, { align: "center" });
    doc.moveDown(0.8);

    doc.fontSize(8.5).font("Helvetica-Bold")
      .text(`${row.e.firstName} ${row.e.lastName}  ·  ${row.e.empNo}  ·  ${row.e.position}`);
    doc.font("Helvetica")
      .text(`KRA PIN: ${row.e.kraPin ?? "—"}  ·  NSSF: ${row.e.nssfNo ?? "—"}  ·  SHIF: ${row.e.shifNo ?? "—"}`);
    doc.moveDown(0.8);

    const startX = doc.page.margins.left;
    const colW = (doc.page.width - startX * 2) / 2 - 8;
    let yL = doc.y, yR = doc.y;

    const line = (x: number, y: number, label: string, v: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      doc.text(label, x, y, { width: colW - 70 });
      doc.text(v, x + colW - 70, y, { width: 70, align: "right" });
      return y + 13;
    };

    doc.font("Helvetica-Bold").fontSize(8).text("EARNINGS", startX, yL); yL += 14;
    yL = line(startX, yL, "Basic Pay", num2(row.p.basic));
    yL = line(startX, yL, "Allowances", num2(row.p.allowances));
    if (row.p.overtime > 0) yL = line(startX, yL, "Overtime", num2(row.p.overtime));
    if (row.p.adjustmentEarnings > 0) yL = line(startX, yL, "Other Earnings", num2(row.p.adjustmentEarnings));
    if (row.p.nonCashBenefit > 0) yL = line(startX, yL, "Non-cash Benefit (taxable)", num2(row.p.nonCashBenefit));
    yL = line(startX, yL, "Gross Pay", num2(row.p.gross), true);
    yL += 6;
    yL = line(startX, yL, "Taxable Income", num2(row.p.taxableIncome));
    yL = line(startX, yL, "PAYE before relief", num2(row.p.payeBeforeRelief));
    yL = line(startX, yL, "Reliefs", num2(row.p.personalRelief + row.p.insuranceRelief));

    const xR = startX + colW + 16;
    doc.font("Helvetica-Bold").fontSize(8).text("DEDUCTIONS", xR, yR); yR += 14;
    yR = line(xR, yR, "PAYE", num2(row.p.paye));
    yR = line(xR, yR, "NSSF", num2(row.p.nssfEmployee));
    yR = line(xR, yR, "SHIF", num2(row.p.shif));
    yR = line(xR, yR, "Housing Levy", num2(row.p.housingLevyEmployee));
    if (row.p.pension > 0) yR = line(xR, yR, "Pension", num2(row.p.pension));
    if (row.p.helb > 0) yR = line(xR, yR, "HELB", num2(row.p.helb));
    if (row.p.sacco > 0) yR = line(xR, yR, "SACCO", num2(row.p.sacco));
    if (row.p.loanDeduction > 0) yR = line(xR, yR, "Loan Recovery", num2(row.p.loanDeduction));
    if (row.p.adjustmentDeductions > 0) yR = line(xR, yR, "Other Deductions", num2(row.p.adjustmentDeductions));
    yR = line(xR, yR, "Total Deductions", num2(row.p.totalDeductions), true);
    yR += 6;
    doc.font("Helvetica-Bold").fontSize(10)
      .text(`NET PAY: ${kes2(row.p.netPay)}`, xR, yR);

    const bottom = Math.max(yL, yR) + 24;
    doc.font("Helvetica").fontSize(6.5).fillColor("#666")
      .text(
        `This document is password-protected. Days payable: ${row.p.daysPayable}/${row.p.daysInPeriod}. Generated by ZawadiHR.`,
        startX, bottom, { width: doc.page.width - startX * 2 },
      );

    doc.end();
    const buffer = await done;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="PAYSLIP-${row.e.empNo}-${row.run.period}.pdf"`,
      },
    });
  }),
);
