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

type DownloadKey = "p9" | "p10" | "muster" | "p10a" | "nssf" | "shif" | "ahl" | "leaveBalance";

function statusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: "border-muted-foreground/40 text-muted-foreground",
    pending_approval: "border-amber-500/60 text-amber-500",
    approved: "border-blue-500/60 text-blue-400",
    paid: "border-emerald-500/60 text-emerald-400",
    reversed: "border-red-500/60 text-red-400",
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
  const paidRuns = availableRuns.filter((run) => run.status === "paid");
  const canGenerateAnnualReports = selectedRun?.status === "paid";
  const canDownloadMusterRoll = selectedRun && selectedRun.status !== "reversed";

  useEffect(() => {
    if (selectedRunId || availableRuns.length === 0) return;
    const defaultRun = paidRuns[0] ?? availableRuns[0];
    setSelectedRunId(String(defaultRun.id));
  }, [availableRuns, paidRuns, selectedRunId]);

  const downloadBlob = async (
    key: DownloadKey,
    path: string,
    filename: string,
    successMessage: string,
  ) => {
    if (!selectedRun) return;
    setLoading(key);
    try {
      const token = sessionStorage.getItem("zawadi_session_token");
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
      const token = sessionStorage.getItem("zawadi_session_token");
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
          <h1 className="text-2xl font-bold tracking-tight font-mono">REPORTS</h1>
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
            Choose a payroll run. Annual certificates and statutory returns are available after the run is marked paid.
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

      {selectedRun && !canGenerateAnnualReports && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          Annual certificates and statutory returns unlock once <span className="font-mono">{runLabel}</span> is marked paid.
          The muster roll remains available unless the run is reversed.
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Annual employee reports</h2>
          <p className="text-sm text-muted-foreground">Year-to-date certificates are prepared from paid payroll runs in the selected run’s year.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReportCard
            icon={<FileArchive className="h-5 w-5 text-teal-400" />}
            title="P9 certificates ZIP"
            description="One annual P9 certificate PDF for every employee, bundled into a single ZIP file."
            actionLabel="DOWNLOAD P9 ZIP"
            loading={loading === "p9"}
            disabled={!canGenerateAnnualReports}
            onClick={() => downloadBlob("p9", `/api/payroll/${selectedRun?.id}/p9-certificates.zip`, `P9_Certificates_${year}.zip`, "Your annual P9 certificate ZIP is ready.")}
          />
          <ReportCard
            icon={<FileText className="h-5 w-5 text-cyan-400" />}
            title="Annual P10 tax cards"
            description="Annual P10 deduction cards for all employees included in paid payroll runs."
            actionLabel="DOWNLOAD P10 PDF"
            loading={loading === "p10"}
            disabled={!canGenerateAnnualReports}
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
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Leave</h2>
          <p className="text-sm text-muted-foreground">A current snapshot of every active employee's leave entitlement, usage, and remaining balance — not tied to a specific payroll run.</p>
        </div>
        <ReportCard
          icon={<Users className="h-5 w-5 text-cyan-400" />}
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
            icon={<Landmark className="h-5 w-5 text-emerald-400" />}
            title="KRA iTax P10A"
            description="Monthly PAYE return in KRA’s uploaded CSV layout."
            actionLabel="DOWNLOAD P10A"
            loading={loading === "p10a"}
            disabled={!canGenerateAnnualReports}
            onClick={() => downloadStatutoryExport("p10a")}
          />
          <ReportCard
            icon={<FileSpreadsheet className="h-5 w-5 text-orange-400" />}
            title="NSSF return"
            description="NSSF eCitizen workbook for the selected monthly run."
            actionLabel="DOWNLOAD NSSF"
            loading={loading === "nssf"}
            disabled={!canGenerateAnnualReports}
            onClick={() => downloadStatutoryExport("nssf")}
          />
          <ReportCard
            icon={<FileSpreadsheet className="h-5 w-5 text-sky-400" />}
            title="SHIF return"
            description="SHA portal workbook using the approved upload template."
            actionLabel="DOWNLOAD SHIF"
            loading={loading === "shif"}
            disabled={!canGenerateAnnualReports}
            onClick={() => downloadStatutoryExport("shif")}
          />
          <ReportCard
            icon={<FileCheck2 className="h-5 w-5 text-violet-400" />}
            title="AHL return"
            description="Affordable Housing Levy CSV for the selected run."
            actionLabel="DOWNLOAD AHL"
            loading={loading === "ahl"}
            disabled={!canGenerateAnnualReports}
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
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="border-border/60 bg-card/50 h-full">
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
          title={disabled ? "This report becomes available after payroll has been paid." : description}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "PREPARING…" : actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}