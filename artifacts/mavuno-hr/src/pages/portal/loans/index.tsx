import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListPortalLoans, customFetch } from "@workspace/api-client-react";
import { formatMoney, formatDate, formatPercent } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, Clock, CheckCircle2, XCircle, Info } from "lucide-react";
import { LoanRequestDialog } from "./request-dialog";
import { LoanMonthlySchedule } from "@/pages/admin/loans/monthly-schedule";

function usePortalLoanRequests() {
  return useQuery({
    queryKey: ["portal-loan-requests"],
    queryFn: () => customFetch("/api/portal/loan-requests"),
  });
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending:  { label: "Pending",  variant: "outline",     icon: Clock },
  approved: { label: "Approved", variant: "default",     icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  company: "Company Loan", sacco: "SACCO Loan",
  advance: "Salary Advance", emergency: "Emergency Advance",
};

function fmtKes(n: number) {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PortalLoans() {
  const { data: loans, isLoading: loansLoading } = useListPortalLoans();
  const { data: requests, isLoading: requestsLoading } = usePortalLoanRequests();
  const [requestOpen, setRequestOpen] = useState(false);

  const pending = (requests as any[])?.filter((r) => r.status === "pending") ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">MY LOANS</h1>
          <p className="text-muted-foreground text-sm">View your active loans and salary advances</p>
        </div>
        <Button className="font-mono shrink-0" onClick={() => setRequestOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-2" />
          REQUEST LOAN
        </Button>
      </div>

      <LoanRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />

      <Tabs defaultValue="active">
        <TabsList className="grid w-full max-w-sm grid-cols-2 bg-card border border-border/50 p-1 mb-6">
          <TabsTrigger value="active" className="font-mono text-xs">ACTIVE LOANS</TabsTrigger>
          <TabsTrigger value="requests" className="font-mono text-xs flex items-center gap-1.5">
            MY REQUESTS
            {pending.length > 0 && (
              <Badge className="h-4 w-4 p-0 flex items-center justify-center rounded-full text-[9px]">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Active loans tab ── */}
        <TabsContent value="active" className="space-y-4 mt-0">
          {loansLoading ? (
            <Card className="border-border/50 bg-card/30 animate-pulse h-48" />
          ) : !loans || loans.length === 0 ? (
            <Card className="border-border/50 bg-card/30">
              <CardContent className="p-12 text-center text-muted-foreground font-mono text-sm">
                <p>YOU HAVE NO ACTIVE LOANS</p>
                <p className="text-xs mt-2 font-sans">Use the REQUEST LOAN button to apply for one</p>
              </CardContent>
            </Card>
          ) : (
            (loans as any[]).map((row) => {
              const fbt = row.fringeBenefit as { monthlyBenefit: number; monthlyTax: number } | null;
              return (
                <Card key={row.loan.id} className="border-border/50 bg-card/30 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl" />
                  <CardHeader className="border-b border-border/30 pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge variant="outline" className="mb-2 font-mono text-[10px] capitalize bg-background">
                          {TYPE_LABELS[row.loan.type] ?? row.loan.type}
                        </Badge>
                        <CardTitle className="font-mono text-xl text-primary">{formatMoney(row.loan.balance)}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">REMAINING BALANCE</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono text-muted-foreground">Original Amount</div>
                        <div className="font-mono font-medium">{formatMoney(row.loan.principal)}</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {[
                        ["Monthly Installment", formatMoney(row.loan.monthlyInstallment)],
                        ["Interest Rate", formatPercent(row.loan.interestRateBps)],
                        ["Start Date", formatDate(row.loan.startDate)],
                        ["Status", row.loan.status],
                      ].map(([label, val]) => (
                        <div key={String(label)}>
                          <div className="text-xs text-muted-foreground mb-1">{label}</div>
                          {label === "Status" ? (
                            <Badge variant={val === "active" ? "default" : "secondary"} className="font-mono text-[10px]">
                              {String(val).toUpperCase()}
                            </Badge>
                          ) : (
                            <div className="font-mono text-sm font-medium">{val}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Total repayable summary — compute remainingMonths from balance */}
                    {row.loan.monthlyInstallment > 0 && row.loan.balance > 0 && (
                      <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/10 px-4 py-2.5 mb-4 font-mono text-xs">
                        <span className="text-muted-foreground">
                          TOTAL REMAINING ({Math.ceil(row.loan.balance / row.loan.monthlyInstallment)} months)
                        </span>
                        <span className="font-bold">
                          {formatMoney(row.loan.balance)}
                        </span>
                      </div>
                    )}

                    {/* Fringe Benefit Tax notice (company loans only — employer cost) */}
                    {fbt && (
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 mb-4 text-xs text-amber-700 dark:text-amber-400">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                          <p className="font-mono font-semibold">FRINGE BENEFIT TAX (FBT) — EMPLOYER COST</p>
                          <p>
                            Your company loan carries an FBT of{" "}
                            <strong>KES {fmtKes(fbt.monthlyTax / 100)} / month</strong>{" "}
                            (benefit: KES {fmtKes(fbt.monthlyBenefit / 100)} / month). This is paid by your employer — it does{" "}
                            <em>not</em> reduce your take-home pay.
                          </p>
                        </div>
                      </div>
                    )}

                    <LoanMonthlySchedule loan={row.loan} repayments={row.repayments ?? []} />

                    <h4 className="text-xs font-mono text-muted-foreground mb-3 mt-5 border-b border-border/30 pb-2">REPAYMENT HISTORY</h4>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted/10">
                          <TableRow>
                            <TableHead className="font-mono text-xs py-2 h-8">DATE</TableHead>
                            <TableHead className="font-mono text-xs py-2 h-8">TYPE</TableHead>
                            <TableHead className="font-mono text-xs py-2 h-8 text-right">AMOUNT</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {row.repayments?.length > 0 ? (
                            row.repayments.map((rep: any, i: number) => (
                              <TableRow key={i} className="hover:bg-muted/10">
                                <TableCell className="font-mono text-xs py-2 text-muted-foreground">
                                  {formatDate(rep.date || rep.createdAt)}
                                </TableCell>
                                <TableCell className="font-mono text-xs py-2 uppercase">
                                  {rep.type || "PAYROLL DEDUCTION"}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs py-2">
                                  {formatMoney(rep.amount || rep.principalAmount || 0)}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-4 text-muted-foreground font-mono text-xs">
                                NO REPAYMENTS YET
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── My requests tab ── */}
        <TabsContent value="requests" className="mt-0">
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="border-b border-border/30 py-4">
              <CardTitle className="font-mono text-sm">MY LOAN REQUESTS</CardTitle>
            </CardHeader>
            {requestsLoading ? (
              <CardContent className="p-8 text-center text-muted-foreground font-mono text-sm animate-pulse">
                LOADING...
              </CardContent>
            ) : !(requests as any[])?.length ? (
              <CardContent className="p-12 text-center text-muted-foreground font-mono text-sm">
                <p>NO REQUESTS YET</p>
                <p className="text-xs mt-2 font-sans">Click REQUEST LOAN to submit your first application</p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="font-mono text-xs">DATE</TableHead>
                      <TableHead className="font-mono text-xs">TYPE</TableHead>
                      <TableHead className="font-mono text-xs text-right">AMOUNT</TableHead>
                      <TableHead className="font-mono text-xs text-center">TERM</TableHead>
                      <TableHead className="font-mono text-xs">REASON</TableHead>
                      <TableHead className="font-mono text-xs">STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(requests as any[]).map((r) => {
                      const s = STATUS_MAP[r.status] ?? STATUS_MAP.pending;
                      const Icon = s.icon;
                      return (
                        <TableRow key={r.id} className="hover:bg-muted/20">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {formatDate(r.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px] capitalize">
                              {TYPE_LABELS[r.type] ?? r.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold text-primary">
                            {formatMoney(r.amount)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {r.months} mo
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {r.reason || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.variant} className="font-mono text-[10px] gap-1">
                              <Icon className="h-3 w-3" />
                              {s.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
