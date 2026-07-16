import { useListPortalLoans } from "@workspace/api-client-react";
import { formatMoney, formatDate, formatPercent } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalLoans() {
  const { data: loans, isLoading } = useListPortalLoans();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">MY LOANS</h1>
        <p className="text-muted-foreground text-sm">View your active loans and salary advances</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <Card className="border-border/50 bg-card/30 animate-pulse h-64" />
        ) : !loans || loans.length === 0 ? (
          <Card className="border-border/50 bg-card/30">
            <CardContent className="p-12 text-center text-muted-foreground font-mono text-sm">
              YOU HAVE NO ACTIVE LOANS
            </CardContent>
          </Card>
        ) : (
          loans.map((row) => (
            <Card key={row.loan.id} className="border-border/50 bg-card/30 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
              <CardHeader className="border-b border-border/30 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="outline" className="mb-2 font-mono text-[10px] capitalize bg-background">{row.loan.type}</Badge>
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
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Installment</div>
                    <div className="font-mono text-sm font-medium">{formatMoney(row.loan.monthlyInstallment)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Interest Rate</div>
                    <div className="font-mono text-sm font-medium">{formatPercent(row.loan.interestRateBps)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Start Date</div>
                    <div className="font-mono text-sm font-medium">{formatDate(row.loan.startDate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <Badge variant={row.loan.status === 'active' ? 'default' : 'secondary'} className="font-mono text-[10px]">
                      {row.loan.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <h4 className="text-xs font-mono text-muted-foreground mb-3 border-b border-border/30 pb-2">REPAYMENT HISTORY</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow>
                        <TableHead className="font-mono text-xs py-2 h-8">DATE</TableHead>
                        <TableHead className="font-mono text-xs py-2 h-8">TYPE</TableHead>
                        <TableHead className="font-mono text-xs py-2 h-8 text-right">PRINCIPAL</TableHead>
                        <TableHead className="font-mono text-xs py-2 h-8 text-right">INTEREST</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.repayments && row.repayments.length > 0 ? (
                        row.repayments.map((rep: any, i) => (
                          <TableRow key={i} className="hover:bg-muted/10">
                            <TableCell className="font-mono text-xs py-2 text-muted-foreground">{formatDate(rep.date || rep.createdAt)}</TableCell>
                            <TableCell className="font-mono text-xs py-2 uppercase">{rep.type || 'PAYROLL DEDUCTION'}</TableCell>
                            <TableCell className="text-right font-mono text-xs py-2">{formatMoney(rep.principalAmount || 0)}</TableCell>
                            <TableCell className="text-right font-mono text-xs py-2 text-muted-foreground">{formatMoney(rep.interestAmount || 0)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground font-mono text-xs">
                            NO REPAYMENTS YET
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
