import { useState } from "react";
import { useListLoans, useListLoanRequests, getListLoansQueryKey, getListLoanRequestsQueryKey } from "@workspace/api-client-react";
import { formatMoney, formatDate, formatPercent, fullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Pencil, FileText, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueLoanDialog } from "./issue-dialog";
import { EditLoanRequestDialog } from "./edit-request-dialog";
import { ApproveLoanDialog } from "./approve-dialog";
import { RequestLoanForDialog } from "./request-for-dialog";

export function LoansAdmin() {
  const [issuingLoan, setIssuingLoan] = useState(false);
  const [requestingFor, setRequestingFor] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [approveTarget, setApproveTarget] = useState<{ request: any; employee: any } | null>(null);

  const { data: loans, isLoading: isLoadingLoans } = useListLoans();
  const { data: requests, isLoading: isLoadingRequests } = useListLoanRequests();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pendingRequests = requests?.filter(r => r.request.status === "pending") || [];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">LOANS & ADVANCES</h1>
          <p className="text-muted-foreground text-sm">Manage employee loans, salary advances, and fringe benefits</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="font-mono" onClick={() => setRequestingFor(true)}>
            <FileText className="h-4 w-4 mr-2" />
            REQUEST LOAN FOR EMPLOYEE
          </Button>
          <Button className="font-mono bg-primary text-primary-foreground" onClick={() => setIssuingLoan(true)}>
            <Coins className="h-4 w-4 mr-2" />
            ISSUE LOAN DIRECTLY
          </Button>
        </div>
      </div>

      <IssueLoanDialog open={issuingLoan} onOpenChange={setIssuingLoan} />
      <RequestLoanForDialog open={requestingFor} onOpenChange={setRequestingFor} />
      <EditLoanRequestDialog
        request={editTarget}
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
      />
      <ApproveLoanDialog
        request={approveTarget?.request ?? null}
        employee={approveTarget?.employee ?? null}
        open={!!approveTarget}
        onOpenChange={(v) => { if (!v) setApproveTarget(null); }}
      />

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6 bg-card border border-border/50 p-1">
          <TabsTrigger value="active" className="font-mono text-xs">ACTIVE LOANS</TabsTrigger>
          <TabsTrigger value="requests" className="font-mono text-xs flex items-center gap-2">
            REQUESTS
            {pendingRequests.length > 0 && (
              <Badge variant="default" className="h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px]">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Active Loans ── */}
        <TabsContent value="active" className="space-y-4 mt-0">
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="py-4 border-b border-border/30">
              <CardTitle className="text-sm font-mono">CURRENT PORTFOLIO</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                    <TableHead className="font-mono text-xs">TYPE</TableHead>
                    <TableHead className="font-mono text-xs text-right">PRINCIPAL</TableHead>
                    <TableHead className="font-mono text-xs text-right">BALANCE</TableHead>
                    <TableHead className="font-mono text-xs text-right">INSTALLMENT</TableHead>
                    <TableHead className="font-mono text-xs text-right">RATE</TableHead>
                    <TableHead className="font-mono text-xs text-right text-amber-500">FRINGE TAX / MO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLoans ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">LOADING LOANS...</TableCell></TableRow>
                  ) : !loans || loans.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">NO ACTIVE LOANS</TableCell></TableRow>
                  ) : (
                    loans.map((row) => (
                      <TableRow key={row.loan.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="font-medium text-sm">{fullName(row.employee)}</div>
                          <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px] capitalize">{row.loan.type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatMoney(row.loan.principal)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(row.loan.balance)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(row.loan.monthlyInstallment)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatPercent(row.loan.interestRateBps)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.fringeBenefit ? (
                            <span className="text-amber-500 font-medium">{formatMoney((row.fringeBenefit as any).monthlyTax)}</span>
                          ) : row.loan.type === "company" ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {loans && loans.some((r: any) => r.fringeBenefit) && (
              <div className="px-4 py-3 border-t border-border/30 bg-amber-500/5">
                <p className="text-xs text-amber-600 font-mono">
                  ⚠ FRINGE BENEFIT TAX — Employer pays 30% on the benefit derived from below-market company loans (KRA deemed rate applies). This cost is not deducted from employee pay.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Loan Requests ── */}
        <TabsContent value="requests" className="mt-0">
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="py-4 border-b border-border/30">
              <CardTitle className="text-sm font-mono">ALL REQUESTS</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-mono text-xs">DATE</TableHead>
                    <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                    <TableHead className="font-mono text-xs">TYPE</TableHead>
                    <TableHead className="font-mono text-xs text-right">AMOUNT</TableHead>
                    <TableHead className="font-mono text-xs text-center">TERM</TableHead>
                    <TableHead className="font-mono text-xs text-center">RATE</TableHead>
                    <TableHead className="font-mono text-xs">REASON</TableHead>
                    <TableHead className="font-mono text-xs">STATUS</TableHead>
                    <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingRequests ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground font-mono">LOADING REQUESTS...</TableCell></TableRow>
                  ) : !requests || requests.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground font-mono">NO REQUESTS</TableCell></TableRow>
                  ) : (
                    requests.map((row) => {
                      const isPending = row.request.status === "pending";
                      return (
                        <TableRow key={row.request.id} className="hover:bg-muted/20">
                          <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(row.request.createdAt)}</TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{fullName(row.employee)}</div>
                            <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px] capitalize">{row.request.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(row.request.amount)}</TableCell>
                          <TableCell className="text-center font-mono text-sm">{row.request.months} mo</TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {row.request.type === "sacco"
                              ? <span className="text-amber-600">{formatPercent(row.request.interestRateBps ?? 0)}</span>
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">{row.request.reason || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={row.request.status === "approved" ? "default" : row.request.status === "rejected" ? "destructive" : "outline"}
                              className="font-mono text-[10px] capitalize"
                            >
                              {row.request.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isPending && (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  title="Edit request"
                                  onClick={() => setEditTarget(row.request)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 font-mono text-xs text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                                  onClick={() => setApproveTarget({ request: row.request, employee: row.employee })}
                                >
                                  <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                                  REVIEW
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
