import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetPayrollRun, useActionPayrollRun, customFetch,
  getGetPayrollRunQueryKey, getListPayrollRunsQueryKey
} from "@workspace/api-client-react";
import { formatMoney, formatDateTime, fullName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, CheckCircle, Send, PlayCircle, RotateCcw, FileText,
  RefreshCw, Pencil, Mail, Download, TrendingDown, TrendingUp,
  FileSpreadsheet, AlertTriangle, ExternalLink, ChevronDown, ChevronUp,
  ArrowUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PayslipEditDialog } from "./payslip-edit-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { downloadP10Csv, downloadNssfCsv, downloadShifTemplate, downloadAhlCsv } from "@/lib/itax-csv";

// Status badge colour map
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    draft:            "border-muted-foreground/40 text-muted-foreground bg-muted/20",
    pending_approval: "border-amber-500/60 text-amber-500 bg-amber-500/10",
    approved:         "border-blue-500/60 text-blue-400 bg-blue-500/10",
    paid:             "border-emerald-500/60 text-emerald-400 bg-emerald-500/10",
    reversed:         "border-red-500/60 text-red-400 bg-red-500/10",
  };
  const cls = cfg[status] ?? "border-muted-foreground/40 text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-mono text-xs px-3 py-1 ${cls}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}

export function PayrollDetail() {
  const [, params] = useRoute("/admin/payroll/:id");
  const id = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<{ slip: any; emp: any } | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailIssues, setEmailIssues] = useState<string[]>([]);
  const [emailIssuesOpen, setEmailIssuesOpen] = useState(false);
  const [bulkPdfLoading, setBulkPdfLoading] = useState(false);
  const [varianceOpen, setVarianceOpen] = useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessMissing, setReadinessMissing] = useState<{ name: string; employeeNo: string; missingFields: string[] }[]>([]);
  const [itaxOpen, setItaxOpen] = useState(false);
  const [itaxData, setItaxData] = useState<any>(null);
  const [itaxLoading, setItaxLoading] = useState(false);
  const [nssfLoading, setNssfLoading] = useState(false);
  const [shifLoading, setShifLoading] = useState(false);
  const [ahlLoading, setAhlLoading] = useState(false);
  const [nssfEmailFailed, setNssfEmailFailed] = useState<string | null>(null);
  const [shifEmailFailed, setShifEmailFailed] = useState<string | null>(null);
  const [ahlEmailFailed, setAhlEmailFailed] = useState<string | null>(null);
  const [insuranceCorrectionPending, setInsuranceCorrectionPending] = useState(false);
  const [slipFilter, setSlipFilter] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data, isLoading } = useGetPayrollRun(id);

  const actionMutation = useActionPayrollRun({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
        toast({ title: "Success", description: "Payroll run updated." });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Action Failed", description: err?.message || "Failed to update payroll run." });
      },
    },
  });

  const recalcMutation = useMutation({
    mutationFn: () => customFetch(`/api/payroll/${id}/recalculate`, { method: "POST" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
      const w = data?.warnings?.length ?? 0;
      toast({
        title: "Recalculated",
        description: `Payroll recalculated.${w ? ` ${w} warning(s).` : ""}`,
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? "Recalculation failed";
      toast({ variant: "destructive", title: "Recalculate Failed", description: msg });
    },
  });

  const handleInsuranceCorrection = async () => {
    setInsuranceCorrectionPending(true);
    try {
      const result = await customFetch(`/api/payroll/${id}/apply-insurance-deductions`, { method: "POST" }) as any;
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
      toast({
        title: "Insurance deductions applied",
        description: result?.message ?? "The historical insurance deductions were applied.",
      });
    } catch (err: any) {
      const message = err?.data?.error ?? err?.message ?? "Insurance correction failed";
      toast({ variant: "destructive", title: "Insurance correction failed", description: message });
    } finally {
      setInsuranceCorrectionPending(false);
    }
  };

  const handleEmailPayslips = async () => {
    setEmailSending(true);
    try {
      const result = await customFetch(`/api/payroll/${id}/email-payslips`, { method: "POST" }) as any;
      const allOk = result.sent === result.total;
      const errors = Array.isArray(result.errors) ? result.errors : [];
      if (errors.length) {
        setEmailIssues(errors);
        setEmailIssuesOpen(true);
      }
      toast({
        variant: allOk ? "default" : "destructive",
        title: allOk ? `📧 Payslips Emailed` : `📧 Email Issues`,
        description: allOk
          ? `Sent all ${result.total} payslip${result.total !== 1 ? "s" : ""} successfully.`
          : `Sent ${result.sent}/${result.total} payslip${result.total !== 1 ? "s" : ""}. See the email issue details.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Email Failed", description: err?.message || "Could not send payslips." });
    } finally {
      setEmailSending(false);
    }
  };

  const handleDownloadPayslip = (slipId: number, empName: string, period: string) => {
    const token = sessionStorage.getItem("zawadi_session_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/payroll/${id}/payslips/${slipId}/pdf`, { headers })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${empName.replace(/ /g, "_")}_${period}.pdf`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(() => toast({ variant: "destructive", title: "Download failed" }));
  };

  const handleBulkPdfDownload = async () => {
    setBulkPdfLoading(true);
    try {
      const token = sessionStorage.getItem("zawadi_session_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const response = await fetch(`/api/payroll/${id}/payslips/bulk-pdf`, { headers });
      if (!response.ok) throw new Error("Failed to generate bulk PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payslips_${run?.period ?? id}.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download Failed", description: err?.message || "Could not generate bulk PDF." });
    } finally {
      setBulkPdfLoading(false);
    }
  };

  const handleItaxExport = async () => {
    setItaxLoading(true);
    setItaxOpen(true);
    try {
      const result = await customFetch(`/api/payroll/${id}/itax/p10`) as any;
      setItaxData(result);
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
    } catch (err: any) {
      toast({ variant: "destructive", title: "iTax Export Failed", description: err?.data?.error ?? err?.message });
      setItaxOpen(false);
    } finally {
      setItaxLoading(false);
    }
  };

  const handleNssfExport = async () => {
    setNssfLoading(true);
    setNssfEmailFailed(null);
    try {
      const result = await customFetch(`/api/payroll/${id}/itax/nssf`) as any;
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
      if (result.warnings?.length) {
        toast({
          variant: "destructive",
          title: `NSSF — ${result.warnings.length} warning(s)`,
          description: result.warnings.slice(0, 3).join("; "),
        });
      }
      if (result.emailSent === false) {
        setNssfEmailFailed(result.emailError ?? "Confirmation email could not be delivered.");
      }
      downloadNssfCsv(result);
    } catch (err: any) {
      toast({ variant: "destructive", title: "NSSF Export Failed", description: err?.data?.error ?? err?.message });
    } finally {
      setNssfLoading(false);
    }
  };

  const handleShifExport = async () => {
    setShifLoading(true);
    setShifEmailFailed(null);
    try {
      const result = await customFetch(`/api/payroll/${id}/itax/shif`) as any;
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
      if (result.warnings?.length) {
        toast({
          variant: "destructive",
          title: `SHIF — ${result.warnings.length} warning(s)`,
          description: result.warnings.slice(0, 3).join("; "),
        });
      }
      if (result.emailSent === false) {
        setShifEmailFailed(result.emailError ?? "Confirmation email could not be delivered.");
      }
      await downloadShifTemplate(result);
    } catch (err: any) {
      toast({ variant: "destructive", title: "SHIF Export Failed", description: err?.data?.error ?? err?.message });
    } finally {
      setShifLoading(false);
    }
  };

  const handleAhlExport = async () => {
    setAhlLoading(true);
    setAhlEmailFailed(null);
    try {
      const result = await customFetch(`/api/payroll/${id}/itax/ahl`) as any;
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
      if (result.warnings?.length) {
        toast({
          variant: "destructive",
          title: `AHL — ${result.warnings.length} warning(s)`,
          description: result.warnings.slice(0, 3).join("; "),
        });
      }
      if (result.emailSent === false) {
        setAhlEmailFailed(result.emailError ?? "Confirmation email could not be delivered.");
      }
      downloadAhlCsv(result);
    } catch (err: any) {
      toast({ variant: "destructive", title: "AHL Export Failed", description: err?.data?.error ?? err?.message });
    } finally {
      setAhlLoading(false);
    }
  };

  const { data: varianceData, isLoading: varianceLoading } = useQuery({
    queryKey: ["payroll-compare", id],
    queryFn: () => customFetch(`/api/payroll/${id}/compare`) as Promise<any>,
    enabled: id > 0 && !isLoading && !!(data as any)?.run && (data as any)?.run?.status !== "draft",
  });

  const { data: readinessData } = useQuery({
    queryKey: ["payroll-readiness", id],
    queryFn: () => customFetch(`/api/payroll/${id}/readiness`) as Promise<any>,
    enabled: id > 0 && !isLoading && ["draft", "pending_approval"].includes((data as any)?.run?.status ?? ""),
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-4 max-w-[1200px] mx-auto">
        <div className="h-8 w-64 bg-muted rounded" />
        <Card className="h-64" />
      </div>
    );
  }

  const { run, payslips, filings } = data as any;
  const canEdit = run?.status === "draft" || run?.status === "pending_approval";
  const p10Filing = (filings as any[])?.find((f: any) => f.kind === "P10");
  const nssfFiling = (filings as any[])?.find((f: any) => f.kind === "NSSF");
  const shifFiling = (filings as any[])?.find((f: any) => f.kind === "SHIF");
  const ahlFiling = (filings as any[])?.find((f: any) => f.kind === "AHL");

  const handleAction = (action: string) => {
    actionMutation.mutate({ id, data: { action: action as any } });
  };

  const handleSubmit = async () => {
    try {
      const result = await customFetch(`/api/payroll/${id}/readiness`) as any;
      if (!result.ok && result.missing?.length) {
        setReadinessMissing(result.missing);
        setReadinessOpen(true);
      } else {
        handleAction("submit");
      }
    } catch {
      handleAction("submit");
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10">

      <PayslipEditDialog
        runId={id}
        slip={editTarget?.slip ?? null}
        employee={editTarget?.emp ?? null}
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
      />

      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/payroll"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">{run?.name}</h1>
          <p className="text-muted-foreground text-sm font-mono">{run?.period} • {run?.runType?.replace("_", " ")}</p>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <StatusBadge status={run?.status ?? "draft"} />

          {canEdit && (
            <Button
              size="sm" variant="outline"
              onClick={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending || actionMutation.isPending}
              className="font-mono gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
              RECALCULATE
            </Button>
          )}
          {run?.status === "draft" && (
            <Button size="sm" onClick={handleSubmit} disabled={actionMutation.isPending} className="font-mono">
              <Send className="h-4 w-4 mr-2" /> SUBMIT
            </Button>
          )}
          {run?.status === "pending_approval" && (
            <>
              <Button size="sm" variant="destructive" onClick={() => handleAction("reject")} disabled={actionMutation.isPending} className="font-mono">
                REJECT
              </Button>
              <Button size="sm" onClick={() => handleAction("approve")} disabled={actionMutation.isPending} className="font-mono bg-blue-600 hover:bg-blue-700 text-white">
                <CheckCircle className="h-4 w-4 mr-2" /> APPROVE
              </Button>
            </>
          )}
          {run?.status === "approved" && (
            <Button size="sm" onClick={() => setPayConfirmOpen(true)} disabled={actionMutation.isPending} className="font-mono bg-primary text-primary-foreground hover:bg-primary/90">
              <PlayCircle className="h-4 w-4 mr-2" /> EXECUTE PAYOUT
            </Button>
          )}
          {run?.status === "paid" && (
            <>
              <Button
                size="sm" variant="outline"
                onClick={handleInsuranceCorrection}
                disabled={insuranceCorrectionPending}
                className="font-mono gap-1.5 border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${insuranceCorrectionPending ? "animate-spin" : ""}`} />
                {insuranceCorrectionPending ? "APPLYING..." : "APPLY INSURANCE DEDUCTIONS"}
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handleItaxExport}
                disabled={itaxLoading}
                className="font-mono gap-1.5 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
              >
                <FileSpreadsheet className={`h-3.5 w-3.5 ${itaxLoading ? "animate-pulse" : ""}`} />
                {itaxLoading ? "LOADING..." : "iTAX P10"}
                {p10Filing && !itaxLoading && (
                  <span className="ml-1 text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-mono">FILED</span>
                )}
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handleNssfExport}
                disabled={nssfLoading}
                className="font-mono gap-1.5 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
              >
                <Download className={`h-3.5 w-3.5 ${nssfLoading ? "animate-pulse" : ""}`} />
                {nssfLoading ? "LOADING..." : "NSSF CSV"}
                {nssfFiling && !nssfLoading && (
                  <span className="ml-1 text-[10px] bg-orange-500/20 text-orange-300 px-1 rounded font-mono">FILED</span>
                )}
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handleShifExport}
                disabled={shifLoading}
                className="font-mono gap-1.5 border-sky-500/50 text-sky-400 hover:bg-sky-500/10"
              >
                <Download className={`h-3.5 w-3.5 ${shifLoading ? "animate-pulse" : ""}`} />
                {shifLoading ? "LOADING..." : "SHIF XLSX"}
                {shifFiling && !shifLoading && (
                  <span className="ml-1 text-[10px] bg-sky-500/20 text-sky-300 px-1 rounded font-mono">FILED</span>
                )}
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handleAhlExport}
                disabled={ahlLoading}
                className="font-mono gap-1.5 border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
              >
                <Download className={`h-3.5 w-3.5 ${ahlLoading ? "animate-pulse" : ""}`} />
                {ahlLoading ? "LOADING..." : "AHL CSV"}
                {ahlFiling && !ahlLoading && (
                  <span className="ml-1 text-[10px] bg-violet-500/20 text-violet-300 px-1 rounded font-mono">FILED</span>
                )}
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handleEmailPayslips}
                disabled={emailSending}
                className="font-mono gap-1.5 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Mail className={`h-3.5 w-3.5 ${emailSending ? "animate-pulse" : ""}`} />
                {emailSending ? "SENDING..." : "EMAIL PAYSLIPS"}
              </Button>
              <Button
                size="sm" variant="destructive"
                onClick={() => handleAction("reverse")}
                disabled={actionMutation.isPending}
                className="font-mono"
              >
                <RotateCcw className="h-4 w-4 mr-2" /> REVERSE RUN
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">GROSS TOTAL</CardDescription>
            <CardTitle className="text-xl font-mono text-primary">{formatMoney(run?.grossTotal ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">NET PAYOUT</CardDescription>
            <CardTitle className="text-xl font-mono text-emerald-400">{formatMoney(run?.netTotal ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">PAYE TO KRA</CardDescription>
            <CardTitle className="text-xl font-mono">{formatMoney(run?.payeTotal ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">EMPLOYEES</CardDescription>
            <CardTitle className="text-xl font-mono">{run?.employeeCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Compliance banner — missing NSSF / SHIF numbers */}
      {canEdit && readinessData && !readinessData.ok && readinessData.missing?.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {readinessData.missing.length} EMPLOYEE{readinessData.missing.length !== 1 ? "S" : ""} MISSING STATUTORY NUMBERS — NSSF / SHIF FILINGS MAY BE REJECTED
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
            {readinessData.missing.map((m: { name: string; employeeNo: string; missingFields: string[] }) => (
              <li key={m.employeeNo} className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-amber-300/80">{m.name}</span>
                <span className="text-muted-foreground">({m.employeeNo})</span>
                <span className="text-amber-500">— {m.missingFields.join(", ")}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground font-mono">
            Update employee records in the Employees tab before submitting this payroll run.
          </p>
        </div>
      )}

      {/* Email delivery failure banners */}
      {nssfEmailFailed && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-400 font-mono text-xs">NSSF CONFIRMATION EMAIL NOT DELIVERED</p>
            <p className="text-xs text-red-300/80 mt-0.5">
              The NSSF remittance confirmation email could not be sent to your account.
              The CSV was still downloaded and the filing was recorded.
            </p>
            {nssfEmailFailed && (
              <p className="text-[11px] text-red-400/60 mt-1 font-mono">{nssfEmailFailed}</p>
            )}
          </div>
          <button onClick={() => setNssfEmailFailed(null)} className="text-red-400/60 hover:text-red-300 text-xs shrink-0">✕</button>
        </div>
      )}
      {shifEmailFailed && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-400 font-mono text-xs">SHIF CONFIRMATION EMAIL NOT DELIVERED</p>
            <p className="text-xs text-red-300/80 mt-0.5">
              The SHIF remittance confirmation email could not be sent to your account.
              The CSV was still downloaded and the filing was recorded.
            </p>
            {shifEmailFailed && (
              <p className="text-[11px] text-red-400/60 mt-1 font-mono">{shifEmailFailed}</p>
            )}
          </div>
          <button onClick={() => setShifEmailFailed(null)} className="text-red-400/60 hover:text-red-300 text-xs shrink-0">✕</button>
        </div>
      )}
      {ahlEmailFailed && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-400 font-mono text-xs">AHL CONFIRMATION EMAIL NOT DELIVERED</p>
            <p className="text-xs text-red-300/80 mt-0.5">
              The AHL remittance confirmation email could not be sent to your account.
              The CSV was still downloaded and the filing was recorded.
            </p>
            {ahlEmailFailed && (
              <p className="text-[11px] text-red-400/60 mt-1 font-mono">{ahlEmailFailed}</p>
            )}
          </div>
          <button onClick={() => setAhlEmailFailed(null)} className="text-red-400/60 hover:text-red-300 text-xs shrink-0">✕</button>
        </div>
      )}

      {/* iTax P10 Export Dialog */}
      <Dialog open={itaxOpen} onOpenChange={setItaxOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col border-border/50 bg-card/95 backdrop-blur-sm">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-mono flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              iTAX P10 RETURN — {itaxData?.period ?? run?.period}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              KRA Monthly PAYE Return • {itaxData?.orgName} • {itaxData?.orgKraPin || "⚠️ No org KRA PIN set"}
            </DialogDescription>
          </DialogHeader>

          {/* Warnings */}
          {itaxData?.warnings?.length > 0 && (
            <div className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold">
                <AlertTriangle className="h-4 w-4" />
                {itaxData.warnings.length} EMPLOYEE{itaxData.warnings.length > 1 ? "S" : ""} WITH MISSING KRA PIN
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {itaxData.warnings.map((w: string, i: number) => (
                  <li key={i} className="text-xs text-amber-300/80 font-mono">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto border border-border/40 rounded-lg bg-background/50">
            {itaxLoading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground font-mono text-sm">
                LOADING P10 DATA...
              </div>
            ) : itaxData ? (
              <Table className="text-xs whitespace-nowrap">
                <TableHeader className="bg-muted/80 sticky top-0">
                  <TableRow>
                    <TableHead className="font-mono text-[10px] px-2">PIN</TableHead>
                    <TableHead className="font-mono text-[10px] px-2">NAME</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">GROSS</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">BENEFITS</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">MORTGAGE INT.</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">DEF. CONTRIB.</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">CHARGEABLE</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">TAX CHGD</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">PERS. RELIEF</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right">INS. RELIEF</TableHead>
                    <TableHead className="font-mono text-[10px] px-2 text-right text-emerald-400">NET PAYE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itaxData.rows.map((row: any, i: number) => (
                    <TableRow key={i} className={`hover:bg-muted/20 ${row.missingPin ? "bg-amber-500/5" : ""}`}>
                      <TableCell className={`font-mono px-2 py-1.5 ${row.missingPin ? "text-amber-400" : ""}`}>
                        {row.kraPin || <span className="text-amber-400">MISSING</span>}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-[140px] truncate">{row.name}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5">{formatMoney(row.gross)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5 text-muted-foreground">{formatMoney(row.benefits)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5 text-muted-foreground">{formatMoney(row.mortgageInterest)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5 text-muted-foreground">{formatMoney(row.definedContribution)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5">{formatMoney(row.chargeablePay)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5">{formatMoney(row.taxChargeable)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5 text-muted-foreground">{formatMoney(row.personalRelief)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5 text-muted-foreground">{formatMoney(row.insuranceRelief)}</TableCell>
                      <TableCell className="text-right font-mono px-2 py-1.5 font-bold text-emerald-400">{formatMoney(row.netPaye)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground font-mono">
              {itaxData?.rows?.length ?? 0} employees • Total PAYE: {formatMoney(itaxData?.totalPaye ?? 0)}
              {itaxData && <span className="ml-3 text-emerald-400">✓ Download recorded as filed</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="font-mono" onClick={() => setItaxOpen(false)}>
                CLOSE
              </Button>
              <Button
                size="sm"
                className="font-mono gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!itaxData}
                onClick={() => itaxData && downloadP10Csv(itaxData)}
              >
                <Download className="h-3.5 w-3.5" />
                DOWNLOAD P10 CSV
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailIssuesOpen} onOpenChange={setEmailIssuesOpen}>
        <DialogContent className="max-w-xl border-border/50 bg-card/95 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2 text-red-400">
              <Mail className="h-4 w-4" />
              EMAIL DELIVERY ISSUES
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Payslip emails could not be delivered. The payroll run and PDF downloads are unaffected.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            {emailIssues.map((issue, index) => (
              <div key={`${issue}-${index}`} className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                {issue}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailIssuesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paid banner */}
      {run?.status === "paid" && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center text-sm font-medium text-emerald-400">
              <CheckCircle className="h-5 w-5 mr-3" />
              FUNDS DISBURSED — {formatDateTime(run?.paidAt || "")}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs"
                onClick={handleEmailPayslips}
                disabled={emailSending}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                {emailSending ? "SENDING..." : "EMAIL ALL PAYSLIPS"}
              </Button>
              {payslips?.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  onClick={handleBulkPdfDownload}
                  disabled={bulkPdfLoading}
                >
                  <Download className={`h-3.5 w-3.5 mr-1.5 ${bulkPdfLoading ? "animate-pulse" : ""}`} />
                  {bulkPdfLoading ? "GENERATING..." : "DOWNLOAD ALL PDFs"}
                </Button>
              )}
              <Button variant="outline" size="sm" className="font-mono text-xs" asChild>
                <a href={`/admin/reports?type=bank&runId=${id}`}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> BANK SCHEDULE
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month-on-month variance section */}
      {run?.status !== "draft" && (
        <Card className="border-border/50 bg-card/30">
          <CardHeader
            className="border-b border-border/30 py-3 cursor-pointer select-none flex flex-row items-center justify-between"
            onClick={() => setVarianceOpen((v) => !v)}
          >
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              {varianceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              MONTH-ON-MONTH VARIANCE
            </CardTitle>
            {varianceData?.previous && (
              <span className="text-xs text-muted-foreground font-mono">
                vs {varianceData.previous.period}
              </span>
            )}
          </CardHeader>
          {varianceOpen && (
            <CardContent className="p-0">
              {varianceLoading ? (
                <div className="py-8 text-center text-muted-foreground font-mono text-sm">LOADING...</div>
              ) : !varianceData?.previous ? (
                <div className="py-8 text-center text-muted-foreground font-mono text-sm">
                  No previous run to compare against
                </div>
              ) : (() => {
                const { rows, totals } = varianceData;
                const grossDelta = totals.previousGross > 0
                  ? ((totals.currentGross - totals.previousGross) / totals.previousGross) * 100
                  : 0;
                const fmtKsh = (cents: number) =>
                  `Ksh ${Math.round(cents / 100).toLocaleString()}`;
                const fmtPct = (curr: number, prev: number) => {
                  if (prev === 0) return curr > 0 ? "+∞%" : "—";
                  const d = ((curr - prev) / prev) * 100;
                  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
                };
                const pctColor = (curr: number, prev: number) => {
                  if (prev === 0 && curr === 0) return "text-muted-foreground";
                  const d = curr - prev;
                  if (d > 0) return "text-emerald-400";
                  if (d < 0) return "text-red-400";
                  return "text-muted-foreground";
                };
                return (
                  <>
                    <div className="px-4 py-2 border-b border-border/20 text-xs font-mono text-muted-foreground flex items-center gap-2">
                      <span>{rows.length} employees</span>
                      <span>·</span>
                      <span>Gross payroll</span>
                      {grossDelta >= 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                      <span className={grossDelta >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {grossDelta >= 0 ? "↑" : "↓"} {Math.abs(grossDelta).toFixed(1)}%
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead className="font-mono text-[10px] pl-4">EMPLOYEE</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">GROSS (curr)</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">GROSS (prev)</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">Δ%</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">PAYE (curr)</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">PAYE (prev)</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">Δ%</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">NET (curr)</TableHead>
                            <TableHead className="font-mono text-[10px] text-right">NET (prev)</TableHead>
                            <TableHead className="font-mono text-[10px] text-right pr-4">Δ%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row: any, i: number) => (
                            <TableRow key={i} className={`hover:bg-muted/20 ${row.isNew ? "bg-emerald-500/5" : row.isRemoved ? "bg-red-500/5" : ""}`}>
                              <TableCell className="pl-4 py-1.5">
                                <span className="font-mono text-muted-foreground mr-1.5">{row.empNo}</span>
                                {row.empName}
                                {row.isNew && (
                                  <span className="ml-2 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">NEW</span>
                                )}
                                {row.isRemoved && (
                                  <span className="ml-2 text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">FINAL</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono py-1.5">{fmtKsh(row.currentGross)}</TableCell>
                              <TableCell className="text-right font-mono py-1.5 text-muted-foreground">{fmtKsh(row.previousGross)}</TableCell>
                              <TableCell className={`text-right font-mono py-1.5 font-semibold ${pctColor(row.currentGross, row.previousGross)}`}>
                                {fmtPct(row.currentGross, row.previousGross)}
                              </TableCell>
                              <TableCell className="text-right font-mono py-1.5">{fmtKsh(row.currentPaye)}</TableCell>
                              <TableCell className="text-right font-mono py-1.5 text-muted-foreground">{fmtKsh(row.previousPaye)}</TableCell>
                              <TableCell className={`text-right font-mono py-1.5 font-semibold ${pctColor(row.currentPaye, row.previousPaye)}`}>
                                {fmtPct(row.currentPaye, row.previousPaye)}
                              </TableCell>
                              <TableCell className="text-right font-mono py-1.5 text-primary">{fmtKsh(row.currentNet)}</TableCell>
                              <TableCell className="text-right font-mono py-1.5 text-muted-foreground">{fmtKsh(row.previousNet)}</TableCell>
                              <TableCell className={`text-right font-mono py-1.5 font-semibold pr-4 ${pctColor(row.currentNet, row.previousNet)}`}>
                                {fmtPct(row.currentNet, row.previousNet)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Totals row */}
                          <TableRow className="border-t border-border/40 bg-muted/20 font-bold">
                            <TableCell className="pl-4 py-2 font-mono text-xs">TOTALS</TableCell>
                            <TableCell className="text-right font-mono py-2">{fmtKsh(totals.currentGross)}</TableCell>
                            <TableCell className="text-right font-mono py-2 text-muted-foreground">{fmtKsh(totals.previousGross)}</TableCell>
                            <TableCell className={`text-right font-mono py-2 ${pctColor(totals.currentGross, totals.previousGross)}`}>
                              {fmtPct(totals.currentGross, totals.previousGross)}
                            </TableCell>
                            <TableCell className="text-right font-mono py-2">{fmtKsh(totals.currentPaye)}</TableCell>
                            <TableCell className="text-right font-mono py-2 text-muted-foreground">{fmtKsh(totals.previousPaye)}</TableCell>
                            <TableCell className={`text-right font-mono py-2 ${pctColor(totals.currentPaye, totals.previousPaye)}`}>
                              {fmtPct(totals.currentPaye, totals.previousPaye)}
                            </TableCell>
                            <TableCell className="text-right font-mono py-2 text-primary">{fmtKsh(totals.currentNet)}</TableCell>
                            <TableCell className="text-right font-mono py-2 text-muted-foreground">{fmtKsh(totals.previousNet)}</TableCell>
                            <TableCell className={`text-right font-mono py-2 pr-4 ${pctColor(totals.currentNet, totals.previousNet)}`}>
                              {fmtPct(totals.currentNet, totals.previousNet)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          )}
        </Card>
      )}

      {/* Payslips table */}
      <Card className="border-border/50 shadow-sm bg-card/30">
        <CardHeader className="border-b border-border/30 flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-mono text-sm">INDIVIDUAL PAYSLIPS</CardTitle>
          <div className="flex items-center gap-3 flex-1 justify-end">
            <input
              type="search"
              placeholder="Filter by name or dept…"
              value={slipFilter}
              onChange={(e) => setSlipFilter(e.target.value)}
              className="h-8 w-48 rounded-md border border-border bg-background/50 px-3 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {canEdit && (
              <p className="text-xs text-muted-foreground hidden sm:block">
                Click <Pencil className="h-3 w-3 inline mx-0.5" /> to edit a payslip
              </p>
            )}
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {(["empno", "name", "dept", "basic", "gross", "deductions", "net"] as const).map((col, idx) => {
                  const labels: Record<string, string> = {
                    empno: "EMP NO", name: "EMPLOYEE", dept: "DEPARTMENT",
                    basic: "BASIC", gross: "GROSS",
                    deductions: "DEDUCTIONS", net: "NET PAY",
                  };
                  const isNumeric = ["basic", "gross", "deductions", "net"].includes(col);
                  const isActive = sortCol === col;
                  return (
                    <TableHead
                      key={col}
                      className={`font-mono text-xs select-none cursor-pointer hover:text-foreground transition-colors ${isNumeric ? "text-right" : ""} ${col === "net" ? "text-primary" : ""}`}
                      onClick={() => {
                        if (sortCol === col) {
                          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        } else {
                          setSortCol(col);
                          setSortDir("asc");
                        }
                      }}
                    >
                      <span className={`inline-flex items-center gap-1 ${isNumeric ? "flex-row-reverse" : ""}`}>
                        {labels[col]}
                        {isActive ? (
                          sortDir === "asc"
                            ? <ChevronUp className="h-3 w-3 shrink-0" />
                            : <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        )}
                      </span>
                    </TableHead>
                  );
                })}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips && payslips.length > 0 ? (
                (() => {
                  const filterLower = slipFilter.trim().toLowerCase();
                  const filtered = payslips.filter((item: any) => {
                    if (!filterLower) return true;
                    const slip = item.slip ?? item;
                    const emp = item.emp ?? {};
                    const dept = item.dept ?? {};
                    const empName = fullName(emp).toLowerCase();
                    const deptName = (dept.name ?? "").toLowerCase();
                    const empNo = (emp.empNo ?? "").toLowerCase();
                    return empName.includes(filterLower) || deptName.includes(filterLower) || empNo.includes(filterLower);
                  });

                  if (sortCol) {
                    filtered.sort((a: any, b: any) => {
                      const aSlip = a.slip ?? a; const aEmp = a.emp ?? a.employee ?? {}; const aDept = a.dept ?? {};
                      const bSlip = b.slip ?? b; const bEmp = b.emp ?? b.employee ?? {}; const bDept = b.dept ?? {};
                      let aVal: any, bVal: any;
                      if (sortCol === "empno") {
                        aVal = (aEmp.empNo ?? "").toLowerCase();
                        bVal = (bEmp.empNo ?? "").toLowerCase();
                      } else if (sortCol === "name") {
                        aVal = fullName(aEmp).toLowerCase();
                        bVal = fullName(bEmp).toLowerCase();
                      } else if (sortCol === "dept") {
                        aVal = (aDept.name ?? "").toLowerCase();
                        bVal = (bDept.name ?? "").toLowerCase();
                      } else if (sortCol === "basic") {
                        aVal = aEmp.basicSalary ?? 0; bVal = bEmp.basicSalary ?? 0;
                      } else if (sortCol === "gross") {
                        aVal = aSlip.gross ?? 0; bVal = bSlip.gross ?? 0;
                      } else if (sortCol === "deductions") {
                        aVal = aSlip.totalDeductions ?? 0; bVal = bSlip.totalDeductions ?? 0;
                      } else if (sortCol === "net") {
                        aVal = aSlip.netPay ?? 0; bVal = bSlip.netPay ?? 0;
                      }
                      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
                      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
                      return 0;
                    });
                  }

                  if (filtered.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-mono text-sm">
                          NO RESULTS FOR "{slipFilter}"
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return filtered.map((item: any, i: number) => {
                    const slip = item.slip ?? item;
                    const emp = item.emp ?? item.employee ?? {};
                    const dept = item.dept ?? {};
                    const hasOverrides = !!slip.breakdown?.overrides &&
                      Object.keys(slip.breakdown.overrides).some((k) => {
                        const v = slip.breakdown.overrides[k];
                        return v !== null && v !== 0 && v !== "" && v !== undefined;
                      });
                    const empName = fullName(emp);
                    return (
                      <TableRow key={slip.id || i} className="group hover:bg-muted/20">
                        <TableCell className="font-mono text-xs text-muted-foreground">{emp.empNo || "-"}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {emp.id ? (
                            <Link href={`/admin/employees/${emp.id}`} className="hover:underline underline-offset-2 text-foreground hover:text-primary transition-colors">
                              {empName}
                            </Link>
                          ) : (
                            <span>{empName}</span>
                          )}
                          {hasOverrides && (
                            <span className="ml-2 text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">EDITED</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dept.name || <span className="text-muted-foreground/40">—</span>}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(emp.basicSalary ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatMoney(slip.gross ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.totalDeductions ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(slip.netPay ?? 0)}</TableCell>
                        <TableCell className="p-1">
                          <div className="flex gap-0.5">
                            {canEdit && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setEditTarget({ slip, emp })}
                                title="Edit payslip"
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>
                            )}
                            {slip.id && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => handleDownloadPayslip(slip.id, empName, run?.period)}
                                title="Download PDF payslip"
                              >
                                <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-mono text-sm">
                    NO PAYSLIPS GENERATED YET
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pay confirmation dialog */}
      <Dialog open={payConfirmOpen} onOpenChange={setPayConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-primary" />
              CONFIRM PAYOUT
            </DialogTitle>
            <DialogDescription>
              This will mark the payroll run as paid and cannot be undone without a reversal. Are you sure you want to disburse{" "}
              <span className="font-semibold text-foreground">{formatMoney(run?.netPayTotal ?? 0)}</span> to{" "}
              <span className="font-semibold text-foreground">{run?.employeeCount ?? 0} employees</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" className="font-mono" onClick={() => setPayConfirmOpen(false)}>
              CANCEL
            </Button>
            <Button
              size="sm"
              className="font-mono bg-primary text-primary-foreground"
              disabled={actionMutation.isPending}
              onClick={() => { setPayConfirmOpen(false); handleAction("pay"); }}
            >
              {actionMutation.isPending ? "PROCESSING…" : "YES, DISBURSE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Readiness warning dialog — missing NSSF/SHIF numbers */}
      <Dialog open={readinessOpen} onOpenChange={setReadinessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              MISSING STATUTORY NUMBERS
            </DialogTitle>
            <DialogDescription>
              The following employees are missing NSSF or SHIF registration numbers. Contributions for these employees may be rejected by the authority.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-muted/40">
                  <th className="text-left px-3 py-2 font-mono text-muted-foreground">EMPLOYEE</th>
                  <th className="text-left px-3 py-2 font-mono text-muted-foreground">MISSING</th>
                </tr>
              </thead>
              <tbody>
                {readinessMissing.map((m) => (
                  <tr key={m.employeeNo} className="border-b border-border/20 last:border-0">
                    <td className="px-3 py-2 font-mono">{m.name} <span className="text-muted-foreground">({m.employeeNo})</span></td>
                    <td className="px-3 py-2 text-amber-400 font-mono">{m.missingFields.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" className="font-mono" onClick={() => setReadinessOpen(false)}>
              GO BACK
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="font-mono"
              onClick={() => { setReadinessOpen(false); handleAction("submit"); }}
            >
              SUBMIT ANYWAY
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
