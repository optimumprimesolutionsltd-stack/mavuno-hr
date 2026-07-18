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
import { ArrowLeft, CheckCircle, Send, PlayCircle, RotateCcw, FileText, RefreshCw, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PayslipEditDialog } from "./payslip-edit-dialog";

export function PayrollDetail() {
  const [, params] = useRoute("/admin/payroll/:id");
  const id = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Edit payslip state
  const [editTarget, setEditTarget] = useState<{ slip: any; emp: any } | null>(null);

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
    mutationFn: () =>
      customFetch(`/api/payroll/${id}/recalculate`, { method: "POST" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
      const w = data?.warnings?.length ?? 0;
      toast({
        title: "Recalculated",
        description: `Payroll recalculated with current employee data.${w ? ` ${w} warning(s).` : ""}`,
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? "Recalculation failed";
      toast({ variant: "destructive", title: "Recalculate Failed", description: msg });
    },
  });

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

      {/* Edit payslip dialog */}
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
          <Badge
            variant="outline"
            className={`font-mono text-xs px-3 py-1 border-primary/50 ${run?.status === "paid" ? "bg-primary/20 text-primary" : ""}`}
          >
            STATUS: {run?.status?.replace("_", " ").toUpperCase()}
          </Badge>

          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending || actionMutation.isPending}
              className="font-mono gap-1.5"
              title="Recalculate all payslips using current employee salaries"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
              RECALCULATE
            </Button>
          )}
          {run?.status === "draft" && (
            <Button
              size="sm"
              onClick={() => handleAction("submit")}
              disabled={actionMutation.isPending}
              className="font-mono"
            >
              <Send className="h-4 w-4 mr-2" /> SUBMIT
            </Button>
          )}
          {run?.status === "pending_approval" && (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleAction("reject")}
                disabled={actionMutation.isPending}
                className="font-mono"
              >
                REJECT
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction("approve")}
                disabled={actionMutation.isPending}
                className="font-mono bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle className="h-4 w-4 mr-2" /> APPROVE
              </Button>
            </>
          )}
          {run?.status === "approved" && (
            <Button
              size="sm"
              onClick={() => handleAction("pay")}
              disabled={actionMutation.isPending}
              className="font-mono bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <PlayCircle className="h-4 w-4 mr-2" /> EXECUTE PAYOUT
            </Button>
          )}
          {run?.status === "paid" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleAction("reverse")}
              disabled={actionMutation.isPending}
              className="font-mono"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> REVERSE RUN
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">GROSS TOTAL</CardDescription>
            <CardTitle className="text-xl font-mono text-primary">{formatMoney(run?.grossTotal ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">NET PAYOUT</CardDescription>
            <CardTitle className="text-xl font-mono text-chart-2">{formatMoney(run?.netTotal ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">PAYE TOTAL</CardDescription>
            <CardTitle className="text-xl font-mono">{formatMoney(run?.payeTotal ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="py-4">
            <CardDescription className="font-mono text-xs">EMPLOYEE COUNT</CardDescription>
            <CardTitle className="text-xl font-mono">{run?.employeeCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {run?.status === "paid" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center text-sm font-medium text-primary">
              <CheckCircle className="h-5 w-5 mr-3" />
              FUNDS DISBURSED ON {formatDateTime(run?.paidAt || "")}
            </div>
            <Button variant="outline" size="sm" className="font-mono text-xs">
              <FileText className="h-4 w-4 mr-2" /> GENERATE BANK SCHEDULE
            </Button>
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
                {canEdit && <TableHead className="w-10" />}
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
                  return (
                    <TableRow key={slip.id || i} className="group hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {emp.empNo || "-"}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        <span>{emp.firstName} {emp.lastName}</span>
                        {hasOverrides && (
                          <span className="ml-2 text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            EDITED
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMoney(slip.gross ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.paye ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.nssfEmployee ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.shif ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(slip.netPay ?? 0)}</TableCell>
                      {canEdit && (
                        <TableCell className="p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditTarget({ slip, emp })}
                            title="Edit this payslip"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 8 : 7} className="text-center py-12 text-muted-foreground font-mono text-sm">
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
