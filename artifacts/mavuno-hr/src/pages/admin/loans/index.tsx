import { Fragment, useState } from "react";
import { useListLoans, useListLoanRequests, getListLoansQueryKey, getListLoanRequestsQueryKey, useUpdateLoanType } from "@workspace/api-client-react";
import { formatMoney, formatDate, formatPercent, fullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Pencil, FileText, ClipboardCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueLoanDialog } from "./issue-dialog";
import { EditLoanRequestDialog } from "./edit-request-dialog";
import { ApproveLoanDialog } from "./approve-dialog";
import { RequestLoanForDialog } from "./request-for-dialog";
import { CorrectLoanDialog } from "./correct-loan-dialog";
import { LoanMonthlySchedule } from "./monthly-schedule";
import { LoansByMonth } from "./by-month";
import { useLoanTypes, LOAN_TYPE_OPTIONS } from "@/lib/loan-config";

const monthName = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "short", year: "numeric" });

/**
 * When payroll deducts this loan -- the same rule as loanDueInPeriod() on the
 * server. An advance is recovered only over its own months from the issue
 * month; other loans every month until settled.
 */
function deductionNote(loan: any): { text: string; lapsed: boolean } {
  const [sy, sm] = String(loan.startDate).slice(0, 7).split("-").map(Number);
  if (loan.type !== "advance") return { text: `Deducts monthly from ${monthName(sy, sm)}`, lapsed: false };
  const months = loan.monthlyInstallment > 0 ? Math.max(1, Math.ceil(loan.principal / loan.monthlyInstallment)) : 1;
  const endIdx = sm - 1 + months - 1;
  const ey = sy + Math.floor(endIdx / 12), em = (endIdx % 12) + 1;
  const now = new Date();
  const lapsed = loan.balance > 0 && (now.getFullYear() * 12 + now.getMonth() + 1) > (ey * 12 + em);
  const span = months === 1 ? monthName(sy, sm) : `${monthName(sy, sm)} – ${monthName(ey, em)}`;
  return { text: `Deducts in ${span} payroll${months === 1 ? " only" : ""}`, lapsed };
}

export function LoansAdmin() {
  const [issuingLoan, setIssuingLoan] = useState(false);
  const [requestingFor, setRequestingFor] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [approveTarget, setApproveTarget] = useState<{ request: any; employee: any } | null>(null);
  const [expandedLoanId, setExpandedLoanId] = useState<number | null>(null);
  const [correctTarget, setCorrectTarget] = useState<{ loan: any; deducted: boolean } | null>(null);

  const { data: loans, isLoading: isLoadingLoans } = useListLoans();
  const offered = useLoanTypes("admin");
  const { data: requests, isLoading: isLoadingRequests } = useListLoanRequests();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Correcting the category a loan was posted under (e.g. "company" instead
  // of "advance") -- amount, months and interest are untouched, this only
  // fixes the label.
  const updateLoanType = useUpdateLoanType({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
        toast({ title: "Loan type updated" });
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Could not update loan type", description: (e?.data as any)?.error ?? e?.message });
      },
    },
  });

  const pendingRequests = requests?.filter(r => r.request.status === "pending") || [];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold uppercase leading-none">LOANS & ADVANCES</h1>
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
      <CorrectLoanDialog
        loan={correctTarget?.loan ?? null}
        deducted={!!correctTarget?.deducted}
        onClose={() => setCorrectTarget(null)}
      />
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
        <TabsList className="grid w-full max-w-lg grid-cols-3 mb-6 bg-card border border-border p-1">
          <TabsTrigger value="active" className="font-mono text-xs">ACTIVE LOANS</TabsTrigger>
          <TabsTrigger value="bymonth" className="font-mono text-xs">BY MONTH</TabsTrigger>
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
          <Card className="border-border bg-card">
            <CardHeader className="py-4 border-b border-border/30">
              <CardTitle className="text-sm font-mono">CURRENT PORTFOLIO</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                    <TableHead className="font-mono text-xs">TYPE</TableHead>
                    <TableHead className="font-mono text-xs text-right">PRINCIPAL</TableHead>
                    <TableHead className="font-mono text-xs text-right">BALANCE</TableHead>
                    <TableHead className="font-mono text-xs text-right">INSTALLMENT</TableHead>
                    <TableHead className="font-mono text-xs text-right">RATE</TableHead>
                    <TableHead className="font-mono text-xs text-right text-amber-700">FRINGE TAX / MO</TableHead>
                    <TableHead className="font-mono text-xs text-right">MONTHLY PLAN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLoans ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-mono">LOADING LOANS...</TableCell></TableRow>
                  ) : !loans || loans.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-mono">NO ACTIVE LOANS</TableCell></TableRow>
                  ) : (
                    loans.map((row) => {
                      const isExpanded = expandedLoanId === row.loan.id;
                      return (
                        <Fragment key={row.loan.id}>
                          <TableRow key={row.loan.id} className="hover:bg-muted/20">
                            <TableCell>
                              <div className="font-medium text-sm">{fullName(row.employee)}</div>
                              <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo} · issued {formatDate(row.loan.startDate)}</div>
                              {(() => {
                                const n = deductionNote(row.loan);
                                return (
                                  <div className={`text-[11px] mt-0.5 ${n.lapsed ? "text-amber-600" : "text-muted-foreground"}`}>
                                    {n.text}
                                    {n.lapsed && " — those months are past, so it is no longer deducted. Correct the date if it is wrong."}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={row.loan.type}
                                onValueChange={(type) => updateLoanType.mutate({ id: row.loan.id, data: { type: type as any } })}
                              >
                                <SelectTrigger
                                  className="h-6 w-auto min-w-0 gap-1 border-none bg-transparent p-0 font-mono text-[10px] capitalize [&>svg]:h-3 [&>svg]:w-3 hover:bg-muted/40 rounded px-1.5"
                                  title="Correct the loan type — amount, months and interest are unaffected"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {/* Offered types, plus this loan's own type even if switched off */}
                                  {LOAN_TYPE_OPTIONS
                                    .filter((t) => t.value === row.loan.type || offered.types.some((o) => o.value === t.value))
                                    .map((t) => (
                                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatMoney(row.loan.principal)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(row.loan.balance)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(row.loan.monthlyInstallment)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatPercent(row.loan.interestRateBps)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.fringeBenefit ? (
                                <span className="text-amber-700 font-medium">{formatMoney((row.fringeBenefit as any).monthlyTax)}</span>
                              ) : row.loan.type === "company" ? (
                                <span className="text-muted-foreground text-xs">—</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2 font-mono text-[10px]"
                                title="Correct the employee or date"
                                onClick={() => setCorrectTarget({ loan: row.loan, deducted: ((row.repayments as any[]) ?? []).length > 0 })}
                              >
                                <Pencil className="h-3.5 w-3.5" /> EDIT
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2 font-mono text-[10px]"
                                aria-expanded={isExpanded}
                                onClick={() => setExpandedLoanId(isExpanded ? null : row.loan.id)}
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {isExpanded ? "HIDE" : "VIEW"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${row.loan.id}-schedule`} className="bg-muted/5">
                              <TableCell colSpan={8} className="p-3">
                                <LoanMonthlySchedule loan={row.loan} repayments={row.repayments as any[]} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {loans && loans.some((r: any) => r.fringeBenefit) && (
              <div className="px-4 py-3 border-t border-border/30 bg-amber-500/5">
                <p className="text-xs text-amber-700 font-mono">
                  ⚠ FRINGE BENEFIT TAX — Employer pays 30% on the benefit derived from below-market company loans (KRA deemed rate applies). This cost is not deducted from employee pay.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Loan Requests ── */}
        <TabsContent value="bymonth" className="mt-0">
          <LoansByMonth loans={(loans as any[]) ?? []} />
        </TabsContent>

        <TabsContent value="requests" className="mt-0">
          <Card className="border-border bg-card">
            <CardHeader className="py-4 border-b border-border/30">
              <CardTitle className="text-sm font-mono">ALL REQUESTS</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
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
                              ? <span className="text-amber-700">{formatPercent(row.request.interestRateBps ?? 0)}</span>
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
