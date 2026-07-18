import { useState, useEffect } from "react";
import { useGetReport, useListPayrollRuns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2, Info } from "lucide-react";
import { formatMoney } from "@/lib/utils";

const BASE_REPORT_TYPES = [
  { id: "paye",    label: "P10 — PAYE Return" },
  { id: "nssf",    label: "NSSF Return" },
  { id: "shif",    label: "SHIF Return" },
  { id: "housing", label: "Affordable Housing Levy" },
  { id: "bank",    label: "Bank Schedule / Payouts" },
  { id: "muster",  label: "Muster Roll (Full Payroll)" },
  { id: "gl",      label: "General Ledger Journal" },
  { id: "pension", label: "Pension Fund Return (Tier II)" },
  { id: "p9",      label: "P9 Annual Tax Certificate" },
];

export function Reports() {
  const { data: runs } = useListPayrollRuns();
  const [reportType, setReportType] = useState<string>("muster");
  const [runId, setRunId] = useState<number | undefined>();

  useEffect(() => {
    if (runs && runs.length > 0 && !runId) {
      setRunId(runs[0].id);
    }
  }, [runs]);

  const { data: report, isLoading } = useGetReport({
    query: { type: reportType, runId: runId },
    options: { query: { enabled: !!runId && !!reportType } },
  } as any);

  const tier2Provider = (report as any)?.tier2Provider ?? "nssf";
  const tier2ProviderName = (report as any)?.tier2ProviderName ?? "Private Pension Fund";

  const handleExport = () => {
    if (!report) return;
    const headers = report.columns.join(",");
    const csvRows = report.rows.map((r: any[]) =>
      r.map((cell, j) => {
        // money columns: convert cents to decimal for CSV
        const isMoneyLike = typeof cell === "number" && cell !== Math.floor(cell / 1) * 1 || typeof cell === "number";
        return typeof cell === "number"
          ? (cell / 100).toFixed(2)
          : `"${String(cell).replace(/"/g, '""')}"`;
      }).join(",")
    ).join("\n");
    const totalRow = report.totals
      .map((cell: any) => typeof cell === "number" ? (cell / 100).toFixed(2) : `"${cell}"`)
      .join(",");
    const csv = `${headers}\n${csvRows}\n${totalRow}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zawadi_${reportType}_${runId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const isMoneyCellIndex = (colIdx: number) =>
    typeof report?.rows?.[0]?.[colIdx] === "number";

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto flex flex-col h-[calc(100vh-100px)]">
      {/* Header & controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">REPORTS & STATUTORY</h1>
          <p className="text-muted-foreground text-sm">Generate compliance files and financial reports</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <Select value={runId?.toString() || ""} onValueChange={(v) => setRunId(parseInt(v))}>
            <SelectTrigger className="w-[200px] font-mono text-sm bg-card">
              <SelectValue placeholder="Select Run" />
            </SelectTrigger>
            <SelectContent>
              {runs?.map((r) => (
                <SelectItem key={r.id} value={r.id.toString()}>
                  {r.period} — {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[260px] font-mono text-sm bg-card border-primary/50">
              <SelectValue placeholder="Select Report" />
            </SelectTrigger>
            <SelectContent>
              {BASE_REPORT_TYPES.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>
                  {rt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className="font-mono shrink-0"
            onClick={handleExport}
            disabled={!report || isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            EXPORT CSV
          </Button>
        </div>
      </div>

      {/* Tier 2 provider notice — shown when NSSF or Pension report is selected */}
      {!isLoading && report && (reportType === "nssf" || reportType === "pension") && (
        <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs shrink-0 ${
          tier2Provider === "private"
            ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
            : "border-border/40 bg-muted/10 text-muted-foreground"
        }`}>
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {tier2Provider === "private" ? (
            <span>
              <strong className="font-mono">Tier II Provider: {tier2ProviderName}</strong> — NSSF return shows Tier I contributions only.
              Use the <strong>Pension Fund Return (Tier II)</strong> report to get the {tier2ProviderName} remittance schedule.
            </span>
          ) : (
            <span>
              <strong className="font-mono">Tier II Provider: NSSF</strong> — Both Tier I and Tier II contributions are included in this NSSF return.
              To use a private pension provider for Tier II, update your statutory configuration.
            </span>
          )}
        </div>
      )}

      {/* Report table */}
      <Card className="border-border/50 bg-card/30 flex-1 flex flex-col min-h-0">
        <CardHeader className="py-4 border-b border-border/30 shrink-0 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-mono text-primary flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {report?.title ? report.title.toUpperCase() : "REPORT VIEWER"}
            </CardTitle>
            <CardDescription className="font-mono text-xs mt-1">
              {reportType === "muster"
                ? "All earnings and individual deduction line items per employee"
                : reportType === "nssf" && tier2Provider === "private"
                  ? `Tier I only — Tier II remitted to ${tier2ProviderName}`
                  : "Automatically formatted to statutory specifications"}
            </CardDescription>
          </div>
          {report && (
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {report.rows.length} {report.rows.length === 1 ? "employee" : "employees"}
            </Badge>
          )}
        </CardHeader>

        <div className="flex-1 overflow-auto bg-background/50">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : !report ? (
            <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              SELECT PARAMETERS TO GENERATE REPORT
            </div>
          ) : report.rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              NO DATA — this payroll run has no payslips yet
            </div>
          ) : (
            <Table className="whitespace-nowrap text-xs">
              <TableHeader className="bg-muted/80 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  {report.columns.map((col: string, i: number) => (
                    <TableHead
                      key={i}
                      className={`font-mono text-[11px] py-2 px-3 ${isMoneyCellIndex(i) ? "text-right" : ""}`}
                    >
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row: any[], i: number) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    {row.map((cell, j) => (
                      <TableCell
                        key={j}
                        className={`font-mono text-xs py-1.5 px-3 ${
                          typeof cell === "number" ? "text-right tabular-nums" : ""
                        } ${
                          // Zero-value money cells: dimmed
                          typeof cell === "number" && cell === 0 ? "text-muted-foreground/40" : ""
                        }`}
                      >
                        {typeof cell === "number" ? formatMoney(cell) : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

                {/* Totals row */}
                {report.totals && report.totals.some((t: any) => t !== "") && (
                  <TableRow className="bg-primary/5 hover:bg-primary/5 sticky bottom-0 z-10 border-t-2 border-border/60 font-bold">
                    {report.totals.map((cell: any, i: number) => (
                      <TableCell
                        key={i}
                        className={`font-mono text-xs py-2 px-3 font-bold ${
                          typeof cell === "number" ? "text-right tabular-nums text-primary" : ""
                        }`}
                      >
                        {i === 0 && !cell ? "TOTAL" : typeof cell === "number" ? formatMoney(cell) : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
