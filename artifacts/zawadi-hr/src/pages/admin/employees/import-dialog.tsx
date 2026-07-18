import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { getListEmployeesQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle,
  AlertCircle, Loader2, ArrowLeft, ChevronRight,
} from "lucide-react";

// ─── Template definition ────────────────────────────────────────────────────

const COLUMNS = [
  { key: "firstName",          label: "First Name",             required: true,  example: "Jane" },
  { key: "lastName",           label: "Last Name",              required: true,  example: "Wanjiku" },
  { key: "email",              label: "Email",                  required: true,  example: "jane@company.co.ke" },
  { key: "position",           label: "Position",               required: true,  example: "Accountant" },
  { key: "hireDate",           label: "Hire Date (YYYY-MM-DD)", required: true,  example: "2024-01-15" },
  { key: "basicSalary",        label: "Basic Salary (KES)",     required: true,  example: "60000" },
  { key: "phone",              label: "Phone",                  required: false, example: "+254712345678" },
  { key: "gender",             label: "Gender (male/female/other)", required: false, example: "female" },
  { key: "nationalId",         label: "National ID",            required: false, example: "12345678" },
  { key: "kraPin",             label: "KRA PIN",                required: false, example: "A001234567B" },
  { key: "nssfNo",             label: "NSSF No.",               required: false, example: "1234567" },
  { key: "shifNo",             label: "SHIF No.",               required: false, example: "12345678" },
  { key: "payMethod",          label: "Pay Method (bank/mpesa/cash)", required: false, example: "bank" },
  { key: "bankName",           label: "Bank Name",              required: false, example: "Equity Bank" },
  { key: "bankAccount",        label: "Bank Account",           required: false, example: "0123456789" },
  { key: "bankBranchCode",     label: "Branch Code",            required: false, example: "076" },
  { key: "mpesaPhone",         label: "M-Pesa Phone",           required: false, example: "" },
  { key: "employmentType",     label: "Employment Type (permanent/contract/casual)", required: false, example: "permanent" },
  { key: "residentStatus",     label: "Resident Status (resident/non_resident)", required: false, example: "resident" },
  { key: "houseAllowance",     label: "House Allowance (KES)",  required: false, example: "10000" },
  { key: "transportAllowance", label: "Transport Allowance (KES)", required: false, example: "5000" },
];

function downloadTemplate() {
  const headers = COLUMNS.map(c => c.label);
  const example = COLUMNS.map(c => c.example);
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  // Style header row width
  ws["!cols"] = COLUMNS.map(() => ({ wch: 28 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "zawadi_employee_import_template.xlsx");
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  errors: string[];
  valid: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Map from normalized label → field key
const HEADER_MAP: Record<string, string> = {};
for (const col of COLUMNS) {
  HEADER_MAP[normalizeHeader(col.label)] = col.key;
  HEADER_MAP[normalizeHeader(col.key)] = col.key;
}

function mapRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [h, val] of Object.entries(raw)) {
    const mapped = HEADER_MAP[normalizeHeader(h)];
    if (mapped) out[mapped] = val?.toString().trim() ?? "";
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/;

function validateRow(row: Record<string, string>): string[] {
  const errs: string[] = [];
  if (!row.firstName?.trim()) errs.push("First Name required");
  if (!row.lastName?.trim()) errs.push("Last Name required");
  if (!row.email?.trim() || !row.email.includes("@")) errs.push("Valid Email required");
  if (!row.position?.trim()) errs.push("Position required");
  if (!row.hireDate?.trim() || !ISO_DATE.test(row.hireDate.trim())) errs.push("Hire Date must be YYYY-MM-DD");
  if (!row.basicSalary?.trim() || !MONEY_RE.test(row.basicSalary.trim()) || Number(row.basicSalary) <= 0)
    errs.push("Basic Salary must be a positive number");
  if (row.gender && !["male","female","other"].includes(row.gender.toLowerCase()))
    errs.push("Gender must be male/female/other");
  if (row.payMethod && !["bank","mpesa","cash"].includes(row.payMethod.toLowerCase()))
    errs.push("Pay Method must be bank/mpesa/cash");
  if (row.employmentType && !["permanent","contract","casual"].includes(row.employmentType.toLowerCase()))
    errs.push("Employment Type must be permanent/contract/casual");
  if (row.residentStatus && !["resident","non_resident"].includes(row.residentStatus.toLowerCase()))
    errs.push("Resident Status must be resident/non_resident");
  return errs;
}

function toApiRow(row: Record<string, string>) {
  return {
    firstName: row.firstName?.trim(),
    lastName: row.lastName?.trim(),
    email: row.email?.trim().toLowerCase(),
    position: row.position?.trim(),
    hireDate: row.hireDate?.trim(),
    basicSalary: row.basicSalary?.trim(),
    phone: row.phone?.trim() || undefined,
    gender: (row.gender?.trim().toLowerCase() || "male") as "male" | "female" | "other",
    nationalId: row.nationalId?.trim() || undefined,
    kraPin: row.kraPin?.trim() || undefined,
    nssfNo: row.nssfNo?.trim() || undefined,
    shifNo: row.shifNo?.trim() || undefined,
    payMethod: (row.payMethod?.trim().toLowerCase() || "bank") as "bank" | "mpesa" | "cash",
    bankName: row.bankName?.trim() || undefined,
    bankAccount: row.bankAccount?.trim() || undefined,
    bankBranchCode: row.bankBranchCode?.trim() || undefined,
    mpesaPhone: row.mpesaPhone?.trim() || undefined,
    employmentType: (row.employmentType?.trim().toLowerCase() || "permanent") as "permanent" | "contract" | "casual",
    residentStatus: (row.residentStatus?.trim().toLowerCase() || "resident") as "resident" | "non_resident",
    houseAllowance: row.houseAllowance?.trim() || "0",
    transportAllowance: row.transportAllowance?.trim() || "0",
    disabilityExemption: false,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Stage = "upload" | "preview" | "done";

export function ImportDialog({ open, onOpenChange }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setStage("upload");
    setDragging(false);
    setFileName("");
    setRows([]);
    setResult(null);
    setImporting(false);
  };

  const close = () => { onOpenChange(false); reset(); };

  const parseFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({ variant: "destructive", title: "Unsupported format", description: "Please upload an .xlsx, .xls or .csv file" });
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

        if (raw.length === 0) {
          toast({ variant: "destructive", title: "Empty sheet", description: "The file contains no data rows" });
          return;
        }

        const parsed: ParsedRow[] = raw.map((r, i) => {
          const mapped = mapRow(r);
          const errors = validateRow(mapped);
          return { index: i + 1, raw: mapped, errors, valid: errors.length === 0 };
        });

        setRows(parsed);
        setStage("preview");
      } catch {
        toast({ variant: "destructive", title: "Parse error", description: "Could not read the file. Make sure it is a valid Excel or CSV file." });
      }
    };
    reader.readAsArrayBuffer(file);
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
    const validRows = rows.filter(r => r.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const result = await customFetch<ImportResult>("/api/employees/bulk", {
        method: "POST",
        body: JSON.stringify({ rows: validRows.map(r => toApiRow(r.raw)) }),
        headers: { "Content-Type": "application/json" },
      });
      setResult(result);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err?.message ?? "Server error" });
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter(r => r.valid).length;
  const errorCount = rows.filter(r => !r.valid).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl bg-card border-border/60 max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-mono text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            IMPORT EMPLOYEES
          </DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file to bulk-import employees into the payroll roster.
          </DialogDescription>
        </DialogHeader>

        {/* ── Stage: Upload ─────────────────────────────────────────────── */}
        {stage === "upload" && (
          <div className="space-y-4 py-2">
            {/* Template download */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
              <div>
                <p className="text-sm font-medium font-mono">STEP 1 — DOWNLOAD TEMPLATE</p>
                <p className="text-xs text-muted-foreground mt-0.5">Get the correct column headers before filling in your data</p>
              </div>
              <Button variant="outline" size="sm" className="font-mono shrink-0" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                TEMPLATE.XLSX
              </Button>
            </div>

            {/* Drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
                ${dragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50 hover:bg-muted/20"}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              <Upload className={`h-10 w-10 mx-auto mb-3 transition-colors ${dragging ? "text-primary" : "text-muted-foreground"}`} />
              <p className="font-mono text-sm font-medium">
                {dragging ? "DROP TO UPLOAD" : "STEP 2 — UPLOAD YOUR FILE"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Drag & drop or click to browse · .xlsx, .xls, .csv</p>
            </div>
          </div>
        )}

        {/* ── Stage: Preview ────────────────────────────────────────────── */}
        {stage === "preview" && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {/* Summary bar */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 shrink-0">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-mono flex-1 truncate">{fileName}</span>
              <Badge variant="default" className="font-mono text-[10px] gap-1 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> {validCount} VALID
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive" className="font-mono text-[10px] gap-1 shrink-0">
                  <XCircle className="h-3 w-3" /> {errorCount} ERRORS
                </Badge>
              )}
            </div>

            {errorCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono shrink-0">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Rows with errors will be skipped. Fix them in your file and re-upload, or proceed to import the {validCount} valid rows.</span>
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-auto flex-1 min-h-0 rounded-lg border border-border/40">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="w-12 font-mono text-xs">#</TableHead>
                    <TableHead className="font-mono text-xs">STATUS</TableHead>
                    <TableHead className="font-mono text-xs">NAME</TableHead>
                    <TableHead className="font-mono text-xs">EMAIL</TableHead>
                    <TableHead className="font-mono text-xs">POSITION</TableHead>
                    <TableHead className="font-mono text-xs text-right">BASIC SALARY</TableHead>
                    <TableHead className="font-mono text-xs">HIRE DATE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.index}
                      className={row.valid ? "hover:bg-muted/10" : "bg-destructive/5 hover:bg-destructive/10"}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.index}</TableCell>
                      <TableCell>
                        {row.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <div title={row.errors.join("\n")}>
                            <XCircle className="h-4 w-4 text-destructive cursor-help" />
                          </div>
                        )}
                        {!row.valid && (
                          <div className="text-[10px] text-destructive font-mono mt-0.5 max-w-[180px]">
                            {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1} more` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {row.raw.firstName} {row.raw.lastName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.raw.email}</TableCell>
                      <TableCell className="text-xs">{row.raw.position}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-primary">
                        {row.raw.basicSalary ? `KES ${Number(row.raw.basicSalary).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.raw.hireDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── Stage: Done ───────────────────────────────────────────────── */}
        {stage === "done" && result && (
          <div className="py-4 space-y-4">
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="font-mono text-lg font-bold mt-2">IMPORT COMPLETE</h3>
              <p className="text-muted-foreground text-sm">
                {result.imported} employee{result.imported !== 1 ? "s" : ""} added to the roster
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                <div className="text-3xl font-mono font-bold text-emerald-400">{result.imported}</div>
                <div className="text-xs font-mono text-muted-foreground mt-1">IMPORTED</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/40 text-center">
                <div className="text-3xl font-mono font-bold text-muted-foreground">{result.skipped}</div>
                <div className="text-xs font-mono text-muted-foreground mt-1">SKIPPED</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-mono text-muted-foreground">SKIPPED ROWS</div>
                <div className="divide-y divide-border/30 max-h-48 overflow-auto">
                  {result.errors.map((e) => (
                    <div key={e.row} className="flex items-start gap-3 px-3 py-2 text-xs">
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
          {stage === "upload" && (
            <Button variant="outline" onClick={close} className="font-mono">CANCEL</Button>
          )}

          {stage === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setStage("upload"); setRows([]); setFileName(""); }} className="font-mono">
                <ArrowLeft className="h-4 w-4 mr-2" /> BACK
              </Button>
              <Button
                onClick={confirmImport}
                disabled={validCount === 0 || importing}
                className="font-mono"
              >
                {importing
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> IMPORTING...</>
                  : <><ChevronRight className="h-4 w-4 mr-2" /> IMPORT {validCount} EMPLOYEE{validCount !== 1 ? "S" : ""}</>
                }
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
