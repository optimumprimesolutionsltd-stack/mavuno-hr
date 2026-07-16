import { useState } from "react";
import { useGetPortalP9 } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2 } from "lucide-react";

export function PortalP9() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear - 1);
  const { data: p9, isLoading } = useGetPortalP9({ year });

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">P9 TAX CERTIFICATE</h1>
          <p className="text-muted-foreground text-sm">Your annual statutory tax deduction certificate for KRA filing</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[120px] font-mono">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="font-mono">
            <Download className="h-4 w-4 mr-2" /> PDF EXPORT
          </Button>
        </div>
      </div>

      <Card className="border-border/50 bg-card/30">
        <CardHeader className="border-b border-border/30 text-center py-8">
          <CardTitle className="font-mono text-xl tracking-widest">KENYA REVENUE AUTHORITY</CardTitle>
          <CardDescription className="font-mono uppercase mt-2">
            Tax Deduction Card Year {year}
          </CardDescription>
        </CardHeader>
        
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>
        ) : !p9 ? (
          <div className="p-12 text-center text-muted-foreground font-mono">NO P9 DATA FOUND FOR {year}</div>
        ) : (
          <CardContent className="p-0">
            <div className="p-6 grid grid-cols-2 gap-4 border-b border-border/30 text-sm font-mono">
              <div><span className="text-muted-foreground">EMPLOYER PIN:</span> P000000000X</div>
              <div><span className="text-muted-foreground">EMPLOYER NAME:</span> ZAWADI HR DEMO ORG</div>
              <div><span className="text-muted-foreground">EMPLOYEE PIN:</span> {p9.employee.kraPin || '-'}</div>
              <div><span className="text-muted-foreground">EMPLOYEE NAME:</span> {p9.employee.firstName} {p9.employee.lastName}</div>
            </div>

            <div className="overflow-x-auto">
              <Table className="whitespace-nowrap">
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="font-mono text-xs">MONTH</TableHead>
                    <TableHead className="font-mono text-xs text-right">BASIC SALARY</TableHead>
                    <TableHead className="font-mono text-xs text-right">BENEFITS</TableHead>
                    <TableHead className="font-mono text-xs text-right">GROSS PAY</TableHead>
                    <TableHead className="font-mono text-xs text-right">PENSION</TableHead>
                    <TableHead className="font-mono text-xs text-right">CHARGEABLE</TableHead>
                    <TableHead className="font-mono text-xs text-right">TAX ON PAY</TableHead>
                    <TableHead className="font-mono text-xs text-right">RELIEF</TableHead>
                    <TableHead className="font-mono text-xs text-right text-primary">PAYE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p9.months.map((m: any, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                      <TableCell className="font-mono text-xs">{m.month}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.basicSalary || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.benefits || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.grossPay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.pension || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.chargeablePay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.taxOnPay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(m.relief || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-primary font-bold">{formatMoney(m.paye || 0)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/5 hover:bg-primary/5 border-t border-border/50">
                    <TableCell className="font-mono text-xs font-bold text-primary">TOTALS</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).basicSalary || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).benefits || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).grossPay || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).pension || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).chargeablePay || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).taxOnPay || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{formatMoney((p9.totals as any).relief || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-primary">{formatMoney((p9.totals as any).paye || 0)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
