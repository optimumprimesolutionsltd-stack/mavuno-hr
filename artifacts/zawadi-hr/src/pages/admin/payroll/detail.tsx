import { useRoute, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetPayrollRun, useActionPayrollRun,
  getGetPayrollRunQueryKey, getListPayrollRunsQueryKey
} from "@workspace/api-client-react";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle, Send, PlayCircle, RotateCcw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function PayrollDetail() {
  const [, params] = useRoute("/admin/payroll/:id");
  const id = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-4 max-w-[1200px] mx-auto">
        <div className="h-8 w-64 bg-muted rounded" />
        <Card className="h-64" />
      </div>
    );
  }

  const { run, payslips } = data as any;

  const handleAction = (action: string) => {
    actionMutation.mutate({ id, data: { action: action as any } });
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/payroll"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">{run?.name}</h1>
          <p className="text-muted-foreground text-sm font-mono">{run?.period} • {run?.runType?.replace("_", " ")}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant="outline" className={`font-mono text-xs px-3 py-1 border-primary/50 ${run?.status === "paid" ? "bg-primary/20 text-primary" : ""}`}>
            STATUS: {run?.status?.replace("_", " ").toUpperCase()}
          </Badge>

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
              <Button size="sm" onClick={() => handleAction("approve")} disabled={actionMutation.isPending} className="font-mono bg-primary text-primary-foreground hover:bg-primary/90">
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
            <Button size="sm" variant="destructive" onClick={() => handleAction("reverse")} disabled={actionMutation.isPending} className="font-mono">
              <RotateCcw className="h-4 w-4 mr-2" /> REVERSE RUN
            </Button>
          )}
        </div>
      </div>

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

      <Card className="border-border/50 shadow-sm bg-card/30">
        <CardHeader className="border-b border-border/30">
          <CardTitle className="font-mono text-sm">INDIVIDUAL PAYSLIPS</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips && payslips.length > 0 ? (
                payslips.map((item: any, i: number) => {
                  const slip = item.slip ?? item;
                  const emp = item.emp ?? item.employee ?? {};
                  return (
                    <TableRow key={slip.id || i} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">{emp.empNo || "-"}</TableCell>
                      <TableCell className="font-medium text-sm">{emp.firstName} {emp.lastName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMoney(slip.gross ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.paye ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.nssfEmployee ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(slip.shif ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(slip.netPay ?? 0)}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-mono text-sm">
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
