import { useGetPortalProfile } from "@workspace/api-client-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { User, Mail, Briefcase, Landmark, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PortalProfile() {
  const { data: profile, isLoading } = useGetPortalProfile();

  if (isLoading || !profile) {
    return <div className="animate-pulse space-y-4 max-w-4xl mx-auto"><div className="h-8 w-64 bg-muted rounded"></div><Card className="h-64"></Card></div>;
  }

  const { employee, payslips, leaveBalance } = profile;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">MY PROFILE</h1>
        <p className="text-muted-foreground text-sm">View your employment details and payslip history</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 shadow-sm bg-card/30">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
              <User className="h-4 w-4 mr-2 text-primary" />
              PERSONAL INFO
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div className="col-span-2">
                <span className="text-muted-foreground block text-xs">Full Name</span>
                <span className="font-medium text-lg">{employee.firstName} {employee.lastName}</span>
              </div>
              <div><span className="text-muted-foreground block text-xs">Email</span>{employee.email}</div>
              <div><span className="text-muted-foreground block text-xs">Phone</span>{employee.phone || '-'}</div>
              <div><span className="text-muted-foreground block text-xs">National ID</span><span className="font-mono">{employee.nationalId || '-'}</span></div>
              <div><span className="text-muted-foreground block text-xs">KRA PIN</span><span className="font-mono">{employee.kraPin || '-'}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm bg-card/30">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
              <Briefcase className="h-4 w-4 mr-2 text-primary" />
              EMPLOYMENT
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div><span className="text-muted-foreground block text-xs">Employee No</span><span className="font-mono">{employee.empNo}</span></div>
              <div><span className="text-muted-foreground block text-xs">Position</span>{employee.position}</div>
              <div><span className="text-muted-foreground block text-xs">Type</span><span className="capitalize">{employee.employmentType?.replace('_', ' ') ?? '-'}</span></div>
              <div><span className="text-muted-foreground block text-xs">Hire Date</span>{formatDate(employee.hireDate)}</div>
              <div className="col-span-2">
                <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <span className="text-xs font-mono text-primary">LEAVE BALANCE</span>
                  <span className="font-mono font-bold text-lg text-primary">{leaveBalance} DAYS</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm bg-card/30">
        <CardHeader className="border-b border-border/30">
          <CardTitle className="font-mono text-sm flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            PAYSLIP HISTORY
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-mono text-xs">PERIOD</TableHead>
                <TableHead className="font-mono text-xs text-right">GROSS PAY</TableHead>
                <TableHead className="font-mono text-xs text-right">DEDUCTIONS</TableHead>
                <TableHead className="font-mono text-xs text-right text-primary">NET PAY</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips && payslips.length > 0 ? (
                payslips.map((slip: any, i) => {
                  const deductions = (slip.paye || 0) + (slip.nssfEmployee || 0) + (slip.shif || 0) + (slip.housingLevyEmployee || 0);
                  return (
                    <TableRow key={i} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-sm">{slip.period || 'Unknown'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMoney(slip.grossPay || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">{formatMoney(deductions)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(slip.netPay || 0)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-sm">
                    NO PAYSLIPS AVAILABLE
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
