import { useState } from "react";
import { useGetReport, useListPayrollRuns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/utils";

const REPORT_TYPES = [
  { id: "paye", label: "P10 - PAYE Return" },
  { id: "nssf", label: "NSSF Return" },
  { id: "shif", label: "SHIF Return" },
  { id: "housing", label: "Affordable Housing Levy" },
  { id: "bank", label: "Bank Schedule / Payouts" },
  { id: "muster", label: "Muster Roll (Master Payroll)" },
  { id: "journal", label: "General Ledger Journal" },
];

export function Reports() {
  const { data: runs } = useListPayrollRuns();
  const [reportType, setReportType] = useState<string>("muster");
  const [runId, setRunId] = useState<number | undefined>();

  // Set default runId once loaded
  if (runs && runs.length > 0 && !runId) {
    setRunId(runs[0].id);
  }

  const { data: report, isLoading } = useGetReport({
    query: { type: reportType, runId: runId },
    options: { query: { enabled: !!runId && !!reportType } }
  } as any); // Type override due to generation nuances

  const handleExport = () => {
    if (!report) return;
    
    // Simple CSV generator
    const headers = report.columns.join(",");
    const rows = report.rows.map(r => r.map(cell => `"${cell}"`).join(",")).join("\n");
    const totals = report.totals.length ? report.totals.map(cell => `"${cell}"`).join(",") : "";
    
    const csv = `${headers}\n${rows}\n${totals}`;
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

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto flex flex-col h-[calc(100vh-100px)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">REPORTS & STATUTORY</h1>
          <p className="text-muted-foreground text-sm">Generate compliance files and financial reports</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={runId?.toString() || ""} onValueChange={(v) => setRunId(parseInt(v))}>
            <SelectTrigger className="w-[200px] font-mono text-sm bg-card">
              <SelectValue placeholder="Select Run" />
            </SelectTrigger>
            <SelectContent>
              {runs?.map(r => (
                <SelectItem key={r.id} value={r.id.toString()}>
                  {r.period} - {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[250px] font-mono text-sm bg-card border-primary/50">
              <SelectValue placeholder="Select Report" />
            </SelectTrigger>
            <SelectContent>
              {REPORT_TYPES.map(rt => (
                <SelectItem key={rt.id} value={rt.id}>{rt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="font-mono shrink-0" onClick={handleExport} disabled={!report || isLoading}>
            <Download className="h-4 w-4 mr-2" /> EXPORT CSV
          </Button>
        </div>
      </div>

      <Card className="border-border/50 bg-card/30 flex-1 flex flex-col min-h-0">
        <CardHeader className="py-4 border-b border-border/30 shrink-0">
          <CardTitle className="text-sm font-mono text-primary flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            {report?.title ? report.title.toUpperCase() : "REPORT VIEWER"}
          </CardTitle>
          <CardDescription className="font-mono text-xs">
            Automatically formatted to KRA / NSSF / SHIF specifications
          </CardDescription>
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
          ) : (
            <Table className="whitespace-nowrap">
              <TableHeader className="bg-muted/80 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  {report.columns.map((col, i) => (
                    <TableHead key={i} className={`font-mono text-xs ${i > 1 ? 'text-right' : ''}`}>
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    {row.map((cell, j) => (
                      <TableCell key={j} className={`font-mono text-sm ${j > 1 ? 'text-right' : ''}`}>
                        {typeof cell === 'number' ? formatMoney(cell * 100) : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {report.totals && report.totals.length > 0 && (
                  <TableRow className="bg-primary/5 hover:bg-primary/5 sticky bottom-0 z-10 border-t border-border/50">
                    {report.totals.map((cell, i) => (
                      <TableCell key={i} className={`font-mono text-sm font-bold ${i > 1 ? 'text-right text-primary' : ''}`}>
                        {cell}
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
