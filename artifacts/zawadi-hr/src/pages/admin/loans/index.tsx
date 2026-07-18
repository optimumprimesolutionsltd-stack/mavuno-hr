import { useState } from "react";
import { useListLoans, useListLoanRequests, useDecideLoanRequest, getListLoansQueryKey, getListLoanRequestsQueryKey } from "@workspace/api-client-react";
import { formatMoney, formatDate, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueLoanDialog } from "./issue-dialog";

export function LoansAdmin() {
  const [issuingLoan, setIssuingLoan] = useState(false);
  const { data: loans, isLoading: isLoadingLoans } = useListLoans();
  const { data: requests, isLoading: isLoadingRequests } = useListLoanRequests();
  const decideRequest = useDecideLoanRequest();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDecision = (id: number, action: 'approve' | 'reject') => {
    decideRequest.mutate(
      { id, data: { action } },
      {
        onSuccess: () => {
          toast({ title: "Decision recorded", description: `Loan request ${action}d.` });
          queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
          if (action === 'approve') queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Failed to record decision.";
          toast({ variant: "destructive", title: "Error", description: msg });
        }
      }
    );
  };

  const pendingRequests = requests?.filter(r => r.request.status === 'pending') || [];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">LOANS & ADVANCES</h1>
          <p className="text-muted-foreground text-sm">Manage employee loans, salary advances, and fringe benefits</p>
        </div>
        <Button className="font-mono bg-primary text-primary-foreground" onClick={() => setIssuingLoan(true)}>
          <Coins className="h-4 w-4 mr-2" />
          ISSUE LOAN DIRECTLY
        </Button>
        <IssueLoanDialog open={issuingLoan} onOpenChange={setIssuingLoan} />
      </div>

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
                    <TableHead className="font-mono text-xs text-right text-chart-2">FRINGE TAX</TableHead>
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
                          <div className="font-medium text-sm">{row.employee.firstName} {row.employee.lastName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px] capitalize">{row.loan.type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatMoney(row.loan.principal)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(row.loan.balance)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatMoney(row.loan.monthlyInstallment)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatPercent(row.loan.interestRateBps)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-chart-2">{row.fringeBenefit ? formatMoney(row.fringeBenefit.monthlyTax) : '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-0">
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="py-4 border-b border-border/30">
              <CardTitle className="text-sm font-mono">PENDING REQUESTS</CardTitle>
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
                    <TableHead className="font-mono text-xs">REASON</TableHead>
                    <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingRequests ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">LOADING REQUESTS...</TableCell></TableRow>
                  ) : pendingRequests.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">NO PENDING REQUESTS</TableCell></TableRow>
                  ) : (
                    pendingRequests.map((row) => (
                      <TableRow key={row.request.id} className="hover:bg-muted/20">
                        <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(row.request.createdAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{row.employee.firstName} {row.employee.lastName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="font-mono text-[10px] capitalize">{row.request.type}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(row.request.amount)}</TableCell>
                        <TableCell className="text-center font-mono text-sm">{row.request.months} mo</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{row.request.reason || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 w-8 p-0 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => handleDecision(row.request.id, 'reject')}
                              disabled={decideRequest.isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 w-8 p-0 text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                              onClick={() => handleDecision(row.request.id, 'approve')}
                              disabled={decideRequest.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
