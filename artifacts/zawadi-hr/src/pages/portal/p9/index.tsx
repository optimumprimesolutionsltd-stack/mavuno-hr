import { useState } from "react";
import { useGetPortalP9 } from "@workspace/api-client-react";
import { formatMoney, fullName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function exportP9Pdf(p9: any, year: number) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("KENYA REVENUE AUTHORITY", pageW / 2, 18, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`TAX DEDUCTION CARD — YEAR ${year}`, pageW / 2, 25, { align: "center" });

  // ── Employer / Employee info block ────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("EMPLOYER PIN:", 14, 36);
  doc.text("EMPLOYER NAME:", 80, 36);
  doc.text("EMPLOYEE PIN:", 14, 42);
  doc.text("EMPLOYEE NAME:", 80, 42);

  doc.setFont("helvetica", "normal");
  doc.text("P000000000X", 42, 36);
  doc.text("ZAWADI HR DEMO ORG", 110, 36);
  doc.text(p9.employee.kraPin || "-", 42, 42);
  doc.text(fullName(p9.employee), 110, 42);

  // ── Monthly table ─────────────────────────────────────────────────────
  const months = p9.months as any[];
  const totals = p9.totals as any;

  const rows = months.map((m: any) => [
    m.month,
    formatMoney(m.basicSalary || 0),
    formatMoney(m.benefits || 0),
    formatMoney(m.grossPay || 0),
    formatMoney(m.pension || 0),
    formatMoney(m.chargeablePay || 0),
    formatMoney(m.taxOnPay || 0),
    formatMoney(m.relief || 0),
    formatMoney(m.paye || 0),
  ]);

  // totals row
  rows.push([
    "TOTALS",
    formatMoney(totals.basicSalary || 0),
    formatMoney(totals.benefits || 0),
    formatMoney(totals.grossPay || 0),
    formatMoney(totals.pension || 0),
    formatMoney(totals.chargeablePay || 0),
    formatMoney(totals.taxOnPay || 0),
    formatMoney(totals.relief || 0),
    formatMoney(totals.paye || 0),
  ]);

  autoTable(doc, {
    startY: 48,
    head: [[
      "MONTH",
      "BASIC SALARY",
      "BENEFITS",
      "GROSS PAY",
      "PENSION",
      "CHARGEABLE",
      "TAX ON PAY",
      "RELIEF",
      "PAYE",
    ]],
    body: rows,
    styles: { fontSize: 8, font: "helvetica", cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold", halign: "right" },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right", fontStyle: "bold", textColor: [20, 100, 60] },
    },
    // style the totals row differently
    willDrawCell: (data) => {
      if (data.row.index === rows.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 245, 240];
      }
    },
    margin: { left: 14, right: 14 },
  });

  // ── Footer ────────────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120);
  doc.text(
    "This certificate is computer generated. All amounts are in Kenyan Shillings (KES).",
    pageW / 2,
    finalY + 8,
    { align: "center" }
  );

  doc.save(`P9_${p9.employee.lastName}_${p9.employee.firstName}_${year}.pdf`);
}

export function PortalP9() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear - 1);
  const { data: p9, isLoading } = useGetPortalP9({ year });

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">P9 TAX CERTIFICATE</h1>
          <p className="text-muted-foreground text-sm">Your annual statutory tax deduction certificate for KRA filing</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[120px] font-mono">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className="font-mono"
            disabled={isLoading || !p9}
            onClick={() => p9 && exportP9Pdf(p9, year)}
          >
            <Download className="h-4 w-4 mr-2" /> PDF EXPORT
          </Button>
        </div>
      </div>

      <Card className="border-border/50 bg-card/30">
        <CardHeader className="border-b border-border/30 text-center py-8">
          <CardTitle className="font-mono text-xl tracking-widest">KENYA REVENUE AUTHORITY</CardTitle>
          <CardDescription className="font-mono uppercase mt-2">
            Tax Deduction Card Year {year}
          </CardDescription>
        </CardHeader>

        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>
        ) : !p9 ? (
          <div className="p-12 text-center text-muted-foreground font-mono">NO P9 DATA FOUND FOR {year}</div>
        ) : (
          <CardContent className="p-0">
            <div className="p-6 grid grid-cols-2 gap-4 border-b border-border/30 text-sm font-mono">
              <div><span className="text-muted-foreground">EMPLOYER PIN:</span> P000000000X</div>
              <div><span className="text-muted-foreground">EMPLOYER NAME:</span> ZAWADI HR DEMO ORG</div>
              <div><span className="text-muted-foreground">EMPLOYEE PIN:</span> {p9.employee.kraPin || '-'}</div>
              <div><span className="text-muted-foreground">EMPLOYEE NAME:</span> {fullName(p9.employee)}</div>
            </div>

            <div className="overflow-x-auto">
              <Table className="whitespace-nowrap">
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="font-mono text-xs">MONTH</TableHead>
                    <TableHead className="font-mono text-xs text-right">BASIC SALARY</TableHead>
                    <TableHead className="font-mono text-xs text-right">BENEFITS</TableHead>
                    <TableHead className="font-mono text-xs text-right">GROSS PAY</TableHead>
                    <TableHead className="font-mono text-xs text-right">PENSION</TableHead>
                    <TableHead className="font-mono text-xs text-right">CHARGEABLE</TableHead>
                    <TableHead className="font-mono text-xs text-right">TAX ON PAY</TableHead>
                    <TableHead className="font-mono text-xs text-right">RELIEF</TableHead>
                    <TableHead className="font-mono text-xs text-right text-primary">PAYE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p9.months.map((m: any, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                      <TableCell className="font-mono text-xs">{m.month}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.basicSalary || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.benefits || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.grossPay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.pension || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.chargeablePay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.taxOnPay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.relief || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-primary font-bold">{formatMoney(m.paye || 0)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/5 hover:bg-primary/5 border-t border-border/50">
                    <TableCell className="font-mono text-xs font-bold text-primary">TOTALS</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).basicSalary || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).benefits || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).grossPay || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).pension || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).chargeablePay || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).taxOnPay || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).relief || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-primary">{formatMoney((p9.totals as any).paye || 0)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
