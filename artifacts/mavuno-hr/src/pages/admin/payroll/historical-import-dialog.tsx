import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { customFetch, getListPayrollRunsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle,
  Loader2, ArrowLeft, ChevronRight,
} from "lucide-react";

// Reconstructs months already run on a previous payroll system from a CSV.
// docs/design/payroll-onboarding-and-approval.md §3.7 (Phase 5). Mirrors the
// employee bulk-import UX (src/pages/admin/employees/import-dialog.tsx), but
// validation is server-side only (dryRun) — the business rules (unknown
// empNo, period vs. the org's cutover, duplicate periods) need DB state a
// client-side pass can't see, so there's no point duplicating them here.

/** Parse a single CSV line, handling quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

interface ImportResult {
  dryRun: boolean;
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  runs: { period: string; runId: number | null; employeeCount: number }[];
}

type Stage = "upload" | "validating" | "review" | "importing" | "done";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HistoricalImportDialog({ open, onOpenChange }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setStage("upload"); setDragging(false); setFileName("");
    setRows([]); setDryRunResult(null); setFinalResult(null);
  };
  const close = () => { onOpenChange(false); reset(); };

  const downloadTemplate = async () => {
    try {
      const csv = await customFetch<string>("/api/payroll/historical/import/template");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mavuno_historical_payroll_import_template.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not download template", description: err?.message ?? "Server error" });
    }
  };

  const runDryRun = async (parsedRows: Record<string, string>[]) => {
    setStage("validating");
    try {
      const result = await customFetch<ImportResult>("/api/payroll/historical/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows, dryRun: true }),
      });
      setDryRunResult(result);
      setStage("review");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Validation failed", description: err?.data?.error ?? err?.message ?? "Server error" });
      setStage("upload");
    }
  };

  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.csv$/i)) {
      toast({ variant: "destructive", title: "Unsupported format", description: "Please upload a .csv file" });
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast({ variant: "destructive", title: "Empty file", description: "The CSV file contains no data rows" });
        return;
      }
      const headers = parseCSVLine(lines[0]).map(h => h.trim());
      const raw = lines.slice(1).map(line => {
        const vals = parseCSVLine(line);
        const record: Record<string, string> = {};
        headers.forEach((h, i) => { record[h] = (vals[i] ?? "").trim(); });
        return record;
      }).filter(r => Object.values(r).some(v => v));

      if (raw.length === 0) {
        toast({ variant: "destructive", title: "Empty file", description: "No data rows found" });
        return;
      }
      setRows(raw);
      await runDryRun(raw);
    } catch {
      toast({ variant: "destructive", title: "Parse error", description: "Could not read the CSV file." });
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  const confirmImport = async () => {
    setStage("importing");
    try {
      const result = await customFetch<ImportResult>("/api/payroll/historical/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun: false }),
      });
      setFinalResult(result);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err?.data?.error ?? err?.message ?? "Server error" });
      setStage("review");
    }
  };

  const willImport = dryRunResult?.imported ?? 0;
  const willSkip = dryRunResult?.skipped ?? 0;
  const createdRuns = finalResult?.runs.filter(r => r.runId) ?? [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl bg-card border-border/60 max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-mono text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            IMPORT HISTORICAL PAYROLL
          </DialogTitle>
          <DialogDescription>
            Reconstruct months already run on a previous system from a CSV. Builds your year-to-date
            and P9A — records are marked paid immediately; nothing is filed, paid out, or emailed.
          </DialogDescription>
        </DialogHeader>

        {/* ── Stage: Upload ─────────────────────────────────────────────── */}
        {stage === "upload" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
              <div>
                <p className="text-sm font-medium font-mono">STEP 1 — DOWNLOAD TEMPLATE</p>
                <p className="text-xs text-muted-foreground mt-0.5">One row per employee per month; get the exact column headers first</p>
              </div>
              <Button variant="outline" size="sm" className="font-mono shrink-0" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                TEMPLATE.CSV
              </Button>
            </div>

            <div
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
                ${dragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50 hover:bg-muted/20"}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              <Upload className={`h-10 w-10 mx-auto mb-3 transition-colors ${dragging ? "text-primary" : "text-muted-foreground"}`} />
              <p className="font-mono text-sm font-medium">
                {dragging ? "DROP TO UPLOAD" : "STEP 2 — UPLOAD YOUR CSV"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Drag & drop or click to browse · .csv only</p>
            </div>
          </div>
        )}

        {/* ── Stage: Validating ─────────────────────────────────────────── */}
        {stage === "validating" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-mono text-sm text-muted-foreground">VALIDATING {rows.length} ROW{rows.length !== 1 ? "S" : ""}...</p>
          </div>
        )}

        {/* ── Stage: Review (server dry-run result) ────────────────────── */}
        {stage === "review" && dryRunResult && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 shrink-0">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-mono flex-1 truncate">{fileName}</span>
              <Badge variant="default" className="font-mono text-[10px] gap-1 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> {willImport} VALID
              </Badge>
              {willSkip > 0 && (
                <Badge variant="destructive" className="font-mono text-[10px] gap-1 shrink-0">
                  <XCircle className="h-3 w-3" /> {willSkip} ERRORS
                </Badge>
              )}
            </div>

            {dryRunResult.runs.length > 0 && (
              <div className="rounded-lg border border-border/40 overflow-hidden shrink-0">
                <div className="px-3 py-2 bg-muted/40 text-xs font-mono text-muted-foreground">
                  {dryRunResult.runs.length} HISTORICAL RUN{dryRunResult.runs.length !== 1 ? "S" : ""} WILL BE CREATED
                </div>
                <div className="divide-y divide-border/30 max-h-32 overflow-auto">
                  {dryRunResult.runs.map(r => (
                    <div key={r.period} className="flex justify-between px-3 py-1.5 text-xs font-mono">
                      <span>{r.period}</span>
                      <span className="text-muted-foreground">{r.employeeCount} employee{r.employeeCount !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dryRunResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="px-3 py-2 bg-destructive/10 text-xs font-mono text-destructive shrink-0">
                  ROWS THAT WILL BE SKIPPED
                </div>
                <div className="divide-y divide-border/30 overflow-auto">
                  {dryRunResult.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 text-xs">
                      <span className="font-mono text-muted-foreground shrink-0">Row {e.row}</span>
                      <span className="text-destructive">{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stage: Importing ──────────────────────────────────────────── */}
        {stage === "importing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-mono text-sm text-muted-foreground">IMPORTING...</p>
          </div>
        )}

        {/* ── Stage: Done ───────────────────────────────────────────────── */}
        {stage === "done" && finalResult && (
          <div className="py-4 space-y-4 overflow-auto">
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="font-mono text-lg font-bold mt-2">IMPORT COMPLETE</h3>
              <p className="text-muted-foreground text-sm">
                {createdRuns.length} historical run{createdRuns.length !== 1 ? "s" : ""} recorded, {finalResult.imported} payslip{finalResult.imported !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                <div className="text-3xl font-mono font-bold text-emerald-400">{finalResult.imported}</div>
                <div className="text-xs font-mono text-muted-foreground mt-1">IMPORTED</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/40 text-center">
                <div className="text-3xl font-mono font-bold text-muted-foreground">{finalResult.skipped}</div>
                <div className="text-xs font-mono text-muted-foreground mt-1">SKIPPED</div>
              </div>
            </div>

            {createdRuns.length > 0 && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-mono text-muted-foreground">RUNS CREATED</div>
                <div className="divide-y divide-border/30 max-h-40 overflow-auto">
                  {createdRuns.map(r => (
                    <Link
                      key={r.period}
                      href={`/admin/payroll/${r.runId}`}
                      onClick={close}
                      className="flex justify-between px-3 py-2 text-xs font-mono hover:bg-muted/20 hover:text-primary transition-colors"
                    >
                      <span>{r.period}</span>
                      <span className="text-muted-foreground">{r.employeeCount} employees →</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {finalResult.errors.length > 0 && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-mono text-muted-foreground">SKIPPED ROWS</div>
                <div className="divide-y divide-border/30 max-h-40 overflow-auto">
                  {finalResult.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 text-xs">
                      <span className="font-mono text-muted-foreground shrink-0">Row {e.row}</span>
                      <span className="text-destructive">{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer actions ─────────────────────────────────────────────── */}
        <div className="flex justify-between pt-3 mt-1 border-t border-border/30 shrink-0">
          {(stage === "upload" || stage === "validating") && (
            <Button variant="outline" onClick={close} className="font-mono" disabled={stage === "validating"}>CANCEL</Button>
          )}

          {stage === "review" && (
            <>
              <Button
                variant="outline"
                onClick={() => { setStage("upload"); setRows([]); setFileName(""); setDryRunResult(null); }}
                className="font-mono"
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> BACK
              </Button>
              <Button onClick={confirmImport} disabled={willImport === 0} className="font-mono">
                <ChevronRight className="h-4 w-4 mr-2" /> IMPORT {willImport} ROW{willImport !== 1 ? "S" : ""}
              </Button>
            </>
          )}

          {stage === "done" && (
            <>
              <Button variant="outline" onClick={reset} className="font-mono">
                IMPORT ANOTHER
              </Button>
              <Button onClick={close} className="font-mono">DONE</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
