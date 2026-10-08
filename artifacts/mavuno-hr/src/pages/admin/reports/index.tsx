import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { customFetch, useListPayrollRuns } from "@workspace/api-client-react";
import { downloadAhlCsv, downloadNssfWorkbook, downloadP10Csv, downloadShifTemplate } from "@/lib/itax-csv";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight,
  Calculator,
  Download,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Landmark,
  Loader2,
  ReceiptText,
  Users,
} from "lucide-react";

type DownloadKey = "p9" | "p10" | "muster" | "summary" | "p10a" | "nssf" | "shif" | "ahl" | "leaveBalance";

function statusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: "border-muted-foreground/40 text-muted-foreground",
    pending_approval: "border-amber-500/60 text-amber-700",
    approved: "border-blue-500/60 text-blue-700",
    paid: "border-emerald-500/60 text-emerald-700",
    reversed: "border-red-500/60 text-red-700",
  };
  return classes[status] ?? classes.draft;
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric",
  });
}

export function Reports() {
  const { data: runs, isLoading } = useListPayrollRuns();
  const { toast } = useToast();
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [loading, setLoading] = useState<DownloadKey | null>(null);

  const availableRuns = useMemo(() => (runs ?? []) as any[], [runs]);
  const selectedRun = availableRuns.find((run) => String(run.id) === selectedRunId);
  const fileableRuns = availableRuns.filter((run) => run.status === "approved" || run.status === "paid");
  // Monthly returns need final (approved) figures, not paid salaries: staff are
  // sometimes paid on the 15th, but the returns are due by the 9th. P9/P10 are
  // year-to-date certificates built from paid runs, so they still wait for paid.
  const canDownloadReturns = selectedRun?.status === "approved" || selectedRun?.status === "paid";
  const canGenerateAnnualReports = selectedRun?.status === "paid";
  const canDownloadMusterRoll = selectedRun && selectedRun.status !== "reversed";
  // Say exactly what to do next for the run's current status -- greyed-out
  // buttons alone confused people.
  const nextStep: Record<string, string> = {
    draft: "This payroll is still a draft. Open it, submit it and approve it.",
    pending_approval: "This payroll is waiting for approval. Open it and approve it.",
    reversed: "This payroll was reversed. Choose another month above.",
  };
  const returnsLockHint = selectedRun && !canDownloadReturns
    ? (selectedRun.status === "reversed" ? "Not available for a reversed payroll."
      : "Available once this payroll is approved.")
    : undefined;
  const annualLockHint = selectedRun && !canGenerateAnnualReports
    ? (selectedRun.status === "approved" ? "Available once this payroll is marked paid."
      : selectedRun.status === "reversed" ? "Not available for a reversed payroll."
      : "Available once this payroll is approved and marked paid.")
    : undefined;

  useEffect(() => {
    if (selectedRunId || availableRuns.length === 0) return;
    const defaultRun = fileableRuns[0] ?? availableRuns[0];
    setSelectedRunId(String(defaultRun.id));
  }, [availableRuns, fileableRuns, selectedRunId]);

  const downloadBlob = async (
    key: DownloadKey,
    path: string,
    filename: string,
    successMessage: string,
  ) => {
    if (!selectedRun) return;
    setLoading(key);
    try {
      const token = sessionStorage.getItem("mavuno_session_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(path, { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "The report could not be generated.");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("The generated report was empty.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
      toast({ title: "Download ready", description: successMessage });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Report download failed",
        description: error?.message ?? "The report could not be generated.",
      });
    } finally {
      setLoading(null);
    }
  };

  // Like downloadBlob, but not tied to a selected payroll run — for reports
  // (e.g. leave balances) that reflect current org-wide state rather than
  // one payroll cycle.
  const downloadOrgReport = async (
    key: DownloadKey,
    path: string,
    filename: string,
    successMessage: string,
  ) => {
    setLoading(key);
    try {
      const token = sessionStorage.getItem("mavuno_session_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(path, { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "The report could not be generated.");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("The generated report was empty.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
      toast({ title: "Download ready", description: successMessage });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Report download failed",
        description: error?.message ?? "The report could not be generated.",
      });
    } finally {
      setLoading(null);
    }
  };

  const downloadStatutoryExport = async (key: "p10a" | "nssf" | "shif" | "ahl") => {
    if (!selectedRun) return;
    setLoading(key);
    try {
      const result = await customFetch(`/api/payroll/${selectedRun.id}/itax/${key === "p10a" ? "p10" : key}`) as any;
      if (key === "p10a") {
        downloadP10Csv(result);
      } else if (key === "nssf") {
        await downloadNssfWorkbook({
          ...result,
          rows: result.rows.map((row: any) => ({
            ...row,
            firstName: row.firstName ?? "",
            lastName: row.lastName ?? "",
          })),
        });
      } else if (key === "shif") {
        await downloadShifTemplate(result);
      } else {
        downloadAhlCsv(result);
      }

      const warnings = result.warnings?.length
        ? ` ${result.warnings.length} employee record warning${result.warnings.length === 1 ? "" : "s"} need review.`
        : "";
      toast({
        title: "Statutory export downloaded",
        description: `The filing record has been updated.${warnings}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Statutory export failed",
        description: error?.data?.error ?? error?.message ?? "The return could not be generated.",
      });
    } finally {
      setLoading(null);
    }
  };

  const runLabel = selectedRun
    ? `${selectedRun.name} · ${formatPeriod(selectedRun.period)}`
    : "Select a payroll run";
  const year = selectedRun?.period?.slice(0, 4) ?? "YEAR";

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold uppercase leading-none">REPORTS</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Download annual tax certificates, payroll registers, and statutory returns from one place.
          </p>
        </div>
        <Link href="/admin/filings">
          <Button variant="outline" className="font-mono gap-2 w-full lg:w-auto">
            <History className="h-4 w-4" />
            FILING HISTORY
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="h-4 w-4 text-primary" />
            Report period
          </CardTitle>
          <CardDescription>
            Choose a payroll run. Monthly statutory returns are available once the run is approved; annual certificates once it is marked paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Select value={selectedRunId} onValueChange={setSelectedRunId} disabled={isLoading || availableRuns.length === 0}>
            <SelectTrigger className="font-mono sm:max-w-xl">
              <SelectValue placeholder={isLoading ? "Loading payroll runs…" : "No payroll runs available"} />
            </SelectTrigger>
            <SelectContent>
              {availableRuns.map((run) => (
                <SelectItem key={run.id} value={String(run.id)}>
                  {run.name} · {formatPeriod(run.period)} · {String(run.status).replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedRun && (
            <>
              <Badge variant="outline" className={`font-mono text-[10px] ${statusClass(selectedRun.status)}`}>
                {selectedRun.status.replace(/_/g, " ").toUpperCase()}
              </Badge>
              <Link href={`/admin/payroll/${selectedRun.id}`} className="sm:ml-auto">
                <Button variant="ghost" size="sm" className="font-mono gap-1.5 w-full">
                  VIEW PAYROLL RUN <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      {selectedRun && !canDownloadReturns && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px] text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Why are the P10A, NSSF, SHIF and AHL downloads greyed out?
            </p>
            <p className="text-amber-800/90 dark:text-amber-300/90 mt-0.5">
              They unlock once <span className="font-mono">{runLabel}</span> is <strong>approved</strong>. You do not
              have to wait until salaries are paid.{" "}
              {nextStep[selectedRun.status] ?? "Open the payroll and approve it."}{" "}
              Then come back here. The muster roll and payroll summary are available now.
            </p>
          </div>
          {selectedRun.status !== "reversed" && (
            <Link href={`/admin/payroll/${selectedRun.id}`}>
              <Button size="sm" className="font-mono">OPEN THIS PAYROLL</Button>
            </Link>
          )}
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Annual employee reports</h2>
          <p className="text-sm text-muted-foreground">Year-to-date certificates are prepared from paid payroll runs in the selected run’s year.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReportCard
            icon={<FileArchive className="h-5 w-5 text-teal-700" />}
            title="P9 certificates ZIP"
            description="One annual P9 certificate PDF for every employee, bundled into a single ZIP file."
            actionLabel="DOWNLOAD P9 ZIP"
            loading={loading === "p9"}
            disabled={!canGenerateAnnualReports}
            disabledHint={annualLockHint}
            onClick={() => downloadBlob("p9", `/api/payroll/${selectedRun?.id}/p9-certificates.zip`, `P9_Certificates_${year}.zip`, "Your annual P9 certificate ZIP is ready.")}
          />
          <ReportCard
            icon={<FileText className="h-5 w-5 text-cyan-700" />}
            title="Annual P10 tax cards"
            description="Annual P10 deduction cards for all employees included in paid payroll runs."
            actionLabel="DOWNLOAD P10 PDF"
            loading={loading === "p10"}
            disabled={!canGenerateAnnualReports}
            disabledHint={annualLockHint}
            onClick={() => downloadBlob("p10", `/api/payroll/${selectedRun?.id}/p10-pdf`, `P10_${year}.pdf`, "Your annual P10 tax cards are ready.")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Payroll register</h2>
          <p className="text-sm text-muted-foreground">Use this detailed earnings-and-deductions register to reconcile the selected payroll run.</p>
        </div>
        <ReportCard
          icon={<FileSpreadsheet className="h-5 w-5 text-primary" />}
          title="Muster roll"
          description="A run-specific CSV register with every employee, earning, deduction, insurance premium, and reconciliation total."
          actionLabel="DOWNLOAD MUSTER ROLL"
          loading={loading === "muster"}
          disabled={!canDownloadMusterRoll}
          onClick={() => downloadBlob("muster", `/api/payroll/${selectedRun?.id}/muster-roll.csv`, `Muster_Roll_${selectedRun?.period ?? "payroll"}.csv`, "Your payroll muster roll is ready.")}
        />
        <ReportCard
          icon={<Calculator className="h-5 w-5 text-amber-700" />}
          title="Payroll summary"
          description="A one-page cost summary for the selected run — total gross, each deduction type, net pay, and employer NSSF/Housing Levy contributions."
          actionLabel="DOWNLOAD SUMMARY"
          loading={loading === "summary"}
          disabled={!canDownloadMusterRoll}
          onClick={() => downloadBlob("summary", `/api/payroll/${selectedRun?.id}/summary.csv`, `Payroll_Summary_${selectedRun?.period ?? "payroll"}.csv`, "Your payroll summary is ready.")}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Leave</h2>
          <p className="text-sm text-muted-foreground">A current snapshot of every active employee's leave entitlement, usage, and remaining balance — not tied to a specific payroll run.</p>
        </div>
        <ReportCard
          icon={<Users className="h-5 w-5 text-cyan-700" />}
          title="Leave balance report"
          description="Entitlement, days taken this year, and remaining balance for every active employee."
          actionLabel="DOWNLOAD LEAVE BALANCES"
          loading={loading === "leaveBalance"}
          disabled={false}
          onClick={() => downloadOrgReport("leaveBalance", "/api/leaves/balance-report.csv", `Leave_Balance_Report_${new Date().toISOString().slice(0, 10)}.csv`, "Your leave balance report is ready.")}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Monthly statutory returns</h2>
          <p className="text-sm text-muted-foreground">These downloads record the export in filing history. Confirm the return after submitting it to the relevant authority.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ReportCard
            icon={<Landmark className="h-5 w-5 text-emerald-700" />}
            title="KRA iTax P10A"
            description="Monthly PAYE return in KRA’s uploaded CSV layout."
            actionLabel="DOWNLOAD P10A"
            loading={loading === "p10a"}
            disabled={!canDownloadReturns}
            disabledHint={returnsLockHint}
            onClick={() => downloadStatutoryExport("p10a")}
          />
          <ReportCard
            icon={<FileSpreadsheet className="h-5 w-5 text-orange-700" />}
            title="NSSF return"
            description="NSSF eCitizen workbook for the selected monthly run."
            actionLabel="DOWNLOAD NSSF"
            loading={loading === "nssf"}
            disabled={!canDownloadReturns}
            disabledHint={returnsLockHint}
            onClick={() => downloadStatutoryExport("nssf")}
          />
          <ReportCard
            icon={<FileSpreadsheet className="h-5 w-5 text-sky-700" />}
            title="SHIF return"
            description="SHA portal workbook using the approved upload template."
            actionLabel="DOWNLOAD SHIF"
            loading={loading === "shif"}
            disabled={!canDownloadReturns}
            disabledHint={returnsLockHint}
            onClick={() => downloadStatutoryExport("shif")}
          />
          <ReportCard
            icon={<FileCheck2 className="h-5 w-5 text-violet-700" />}
            title="AHL return"
            description="Affordable Housing Levy CSV for the selected run."
            actionLabel="DOWNLOAD AHL"
            loading={loading === "ahl"}
            disabled={!canDownloadReturns}
            disabledHint={returnsLockHint}
            onClick={() => downloadStatutoryExport("ahl")}
          />
        </div>
      </section>
    </div>
  );
}

function ReportCard({
  icon,
  title,
  description,
  actionLabel,
  loading,
  disabled,
  disabledHint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  loading: boolean;
  disabled: boolean;
  /** Shown under the button while it is disabled: why, and what to do. */
  disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <Card className="border-border/60 bg-card h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        <CardDescription className="min-h-10">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          className="w-full font-mono gap-2"
          onClick={onClick}
          disabled={disabled || loading}
          title={disabled ? (disabledHint ?? "This report becomes available after payroll has been paid.") : description}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "PREPARING…" : actionLabel}
        </Button>
        {disabled && disabledHint && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 text-center">{disabledHint}</p>
        )}
      </CardContent>
    </Card>
  );
}