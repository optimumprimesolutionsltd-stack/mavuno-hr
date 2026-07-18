import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetPayrollRun, useActionPayrollRun, customFetch,
  getGetPayrollRunQueryKey, getListPayrollRunsQueryKey
} from "@workspace/api-client-react";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, CheckCircle, Send, PlayCircle, RotateCcw, FileText,
  RefreshCw, Pencil, Mail, Download, TrendingDown, TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PayslipEditDialog } from "./payslip-edit-dialog";

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

  const handleEmailPayslips = async () => {
    setEmailSending(true);
    try {
      const result = await customFetch(`/api/payroll/${id}/email-payslips`, { method: "POST" }) as any;
      toast({
        title: `📧 Payslips Emailed`,
        description: `Sent ${result.sent}/${result.total} payslip${result.total !== 1 ? "s" : ""} successfully.${result.errors?.length ? ` ${result.errors.length} failed.` : ""}`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Email Failed", description: err?.message || "Could not send payslips." });
    } finally {
      setEmailSending(false);
    }
  };

  const handleDownloadPayslip = (slipId: number, empName: string, period: string) => {
    const token = sessionStorage.getItem("zawadi_session_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
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

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-4 max-w-[1200px] mx-auto">
        <div className="h-8 w-64 bg-muted rounded" />
        <Card className="h-64" />
      </div>
    );
  }

  const { run, payslips } = data as any;
  const canEdit = run?.status === "draft" || run?.status === "pending_approval";

  const handleAction = (action: string) => {
    actionMutation.mutate({ id, data: { action: action as any } });
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
            <Button size="sm" onClick={() => handleAction("submit")} disabled={actionMutation.isPending} className="font-mono">
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
            <Button size="sm" onClick={() => handleAction("pay")} disabled={actionMutation.isPending} className="font-mono bg-primary text-primary-foreground hover:bg-primary/90">
              <PlayCircle className="h-4 w-4 mr-2" /> EXECUTE PAYOUT
            </Button>
          )}
          {run?.status === "paid" && (
            <>
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
              <Button variant="outline" size="sm" className="font-mono text-xs" asChild>
                <a href={`/admin/reports?type=bank&runId=${id}`}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> BANK SCHEDULE
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payslips table */}
      <Card className="border-border/50 shadow-sm bg-card/30">
        <CardHeader className="border-b border-border/30 flex flex-row items-center justify-between">
          <CardTitle className="font-mono text-sm">INDIVIDUAL PAYSLIPS</CardTitle>
          {canEdit && (
            <p className="text-xs text-muted-foreground">
              Click <Pencil className="h-3 w-3 inline mx-0.5" /> to edit any payslip before approving
            </p>
          )}
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-mono text-xs">EMP NO</TableHead>
                <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                <TableHead className="font-mono text-xs text-right">GROSS</TableHead>
                <TableHead className="font-mono text-xs text-right">PAYE</TableHead>
                <TableHead className="font-mono text-xs text-right">NSSF</TableHead>
                <TableHead className="font-mono text-xs text-right">SHIF</TableHead>
                <TableHead className="font-mono text-xs text-right text-primary">NET PAY</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips && payslips.length > 0 ? (
                payslips.map((item: any, i: number) => {
                  const slip = item.slip ?? item;
                  const emp = item.emp ?? item.employee ?? {};
                  const hasOverrides = !!slip.breakdown?.overrides &&
                    Object.keys(slip.breakdown.overrides).some((k) => {
                      const v = slip.breakdown.overrides[k];
                      return v !== null && v !== 0 && v !== "" && v !== undefined;
                    });
                  const empName = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
                  return (
                    <TableRow key={slip.id || i} className="group hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">{emp.empNo || "-"}</TableCell>
                      <TableCell className="font-medium text-sm">
                        <span>{empName}</span>
                        {hasOverrides && (
                          <span className="ml-2 text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">EDITED</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMoney(slip.gross ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.paye ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.nssfEmployee ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.shif ?? 0)}</TableCell>
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
                })
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
    </div>
  );
}
