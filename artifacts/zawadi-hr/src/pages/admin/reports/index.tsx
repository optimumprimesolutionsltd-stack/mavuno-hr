import { useState, useEffect } from "react";
import { useGetReport, useListPayrollRuns, getGetReportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2, Info, AlertTriangle, FileSpreadsheet, FileDown } from "lucide-react";
import { downloadP9Csv, centsToKes } from "@/lib/itax-csv";
import { formatMoney } from "@/lib/utils";

const BASE_REPORT_TYPES = [
  { id: "advanced", label: "Advanced Payroll Analysis" },
  { id: "muster",   label: "Muster Roll (Full Payroll)" },
  { id: "paye",     label: "P10 — PAYE Return (KRA)" },
  { id: "p10-pdf",  label: "P10 Tax Cards (PDF)" },
  { id: "nssf",     label: "NSSF Contribution Return" },
  { id: "shif",     label: "SHIF Contribution Return" },
  { id: "housing",  label: "Affordable Housing Levy" },
  { id: "pension",  label: "Pension Fund Return (Tier II)" },
  { id: "bank",     label: "Bank Payment Schedule" },
  { id: "mpesa",    label: "M-Pesa Bulk Disbursement" },
  { id: "cash",     label: "Cash / Cheque List" },
  { id: "gl",       label: "General Ledger Journal" },
  { id: "p9",       label: "P9 Annual Tax Certificate" },
];

export function Reports() {
  const { data: runs } = useListPayrollRuns();
  const [reportType, setReportType] = useState<string>("muster");
  const [runId, setRunId] = useState<number | undefined>();
  const [p9Year, setP9Year] = useState<string>(String(new Date().getFullYear()));
  const [p9Loading, setP9Loading] = useState(false);
  const [p9Warnings, setP9Warnings] = useState<string[]>([]);
  const [p9PdfLoading, setP9PdfLoading] = useState(false);
  const [p10PdfLoading, setP10PdfLoading] = useState(false);

  useEffect(() => {
    if (runs && runs.length > 0 && !runId) {
      setRunId(runs[0].id);
    }
  }, [runs]);

  const { data: report, isLoading } = useGetReport(
    { type: reportType, runId: runId },
    { query: { queryKey: getGetReportQueryKey({ type: reportType, runId: runId }), enabled: !!runId && !!reportType } },
  );

  const tier2Provider = (report as any)?.tier2Provider ?? "nssf";
  const tier2ProviderName = (report as any)?.tier2ProviderName ?? "Private Pension Fund";
  const ledger = (report as any)?.ledger;

  const downloadPdf = async (url: string, filename: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem("zawadi_session_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      setP9Warnings([]);
    } catch (err: any) {
      setP9Warnings([err?.message ?? "Failed to download PDF."]);
    } finally {
      setLoading(false);
    }
  };

  const handleP9Download = async () => {
    setP9Loading(true);
    setP9Warnings([]);
    try {
      const token = sessionStorage.getItem("zawadi_session_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(`/api/reports/itax/p9?year=${p9Year}`, { headers });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.warnings?.length) setP9Warnings(data.warnings);
      if (data.rows?.length === 0) {
        setP9Warnings([`No paid payroll runs found for ${p9Year}.`]);
        return;
      }
      downloadP9Csv(data);
    } catch (err: any) {
      setP9Warnings([err?.message ?? "Failed to download P9 CSV."]);
    } finally {
      setP9Loading(false);
    }
  };

  const handleP9PdfDownload = async () => {
    const orgPin = "ORG";
    await downloadPdf(`/api/reports/p9-pdf?year=${p9Year}`, `P9_${p9Year}_${orgPin}.zip`, setP9PdfLoading);
  };

  const handleP10PdfDownload = async () => {
    const orgPin = "ORG";
    await downloadPdf(`/api/reports/p10-pdf?year=${p9Year}`, `P10_${p9Year}_${orgPin}.pdf`, setP10PdfLoading);
  };

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
    typeof report?.rows?.[0]?.[colIdx] === "number" && !(reportType === "advanced" && colIdx === 15);

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

          {reportType !== "p9" && reportType !== "p10-pdf" && (
            <Button
              variant="outline"
              className="font-mono shrink-0"
              onClick={handleExport}
              disabled={!report || isLoading}
            >
              <Download className="h-4 w-4 mr-2" />
              EXPORT CSV
            </Button>
          )}

          {(reportType === "p9" || reportType === "p10-pdf") && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2020}
                max={2035}
                value={p9Year}
                onChange={(e) => { setP9Year(e.target.value); setP9Warnings([]); }}
                className="w-24 h-9 px-2 rounded border border-border bg-card font-mono text-sm text-center"
                title="Tax year for annual statutory return"
              />
              {reportType === "p9" && (
                <>
                  <Button
                    className="font-mono shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={handleP9Download}
                    disabled={p9Loading}
                  >
                    {p9Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    {p9Loading ? "GENERATING..." : "DOWNLOAD iTAX P9 CSV"}
                  </Button>
                  <Button
                    variant="outline"
                    className="font-mono shrink-0 gap-1.5"
                    onClick={handleP9PdfDownload}
                    disabled={p9PdfLoading}
                  >
                    {p9PdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    {p9PdfLoading ? "GENERATING..." : "P9 FORMS ZIP"}
                  </Button>
                </>
              )}
              {reportType === "p10-pdf" && (
                <Button
                  className="font-mono shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
                  onClick={handleP10PdfDownload}
                  disabled={p10PdfLoading}
                >
                  {p10PdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  {p10PdfLoading ? "GENERATING..." : "DOWNLOAD P10 CARDS PDF"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* P9 warnings / status */}
      {reportType === "p9" && p9Warnings.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
          <div className="space-y-0.5">
            {p9Warnings.map((w, i) => (
              <div key={i} className="font-mono text-amber-300">{w}</div>
            ))}
          </div>
        </div>
      )}

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

      {reportType === "gl" && report && ledger && (
        <div className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-xs shrink-0 ${
          ledger.balanced
            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            : "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400"
        }`}>
          <div className="font-mono">
            <strong>{ledger.balanced ? "BALANCED JOURNAL" : "UNBALANCED JOURNAL"}</strong>
            {!ledger.balanced && (
              <span className="ml-2">
                Difference: {formatMoney(Math.abs(ledger.difference))}
              </span>
            )}
          </div>
          <div className="font-mono whitespace-nowrap">
            DR {formatMoney(ledger.debitTotal)} &nbsp;|&nbsp; CR {formatMoney(ledger.creditTotal)}
          </div>
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
              {reportType === "advanced"
                ? "Payroll cost, deductions, take-home pay and employer cost per employee"
                : reportType === "muster"
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
                        {typeof cell === "number"
                          ? reportType === "advanced" && j === 15
                            ? `${Number(cell).toFixed(2)}%`
                            : formatMoney(cell)
                          : cell}
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
                        {i === 0 && !cell
                          ? "TOTAL"
                          : typeof cell === "number"
                            ? reportType === "advanced" && i === 15
                              ? `${Number(cell).toFixed(2)}%`
                              : formatMoney(cell)
                            : cell}
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
