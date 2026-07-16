import { useRoute, Link } from "wouter";
import { useGetEmployee } from "@workspace/api-client-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, User, Building, Landmark, Mail, Phone, FileText, Briefcase } from "lucide-react";

export function EmployeeDetail() {
  const [, params] = useRoute("/admin/employees/:id");
  const id = parseInt(params?.id || "0", 10);
  
  const { data, isLoading } = useGetEmployee(id, {
    query: { enabled: !!id }
  });

  if (isLoading || !data) {
    return <div className="animate-pulse space-y-4 max-w-4xl mx-auto"><div className="h-8 w-32 bg-muted rounded"></div><Card className="h-64"></Card></div>;
  }

  const { employee, department } = data;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/employees"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">{employee.firstName} {employee.lastName}</h1>
          <p className="text-muted-foreground text-sm font-mono">{employee.empNo} • {employee.position}</p>
        </div>
        <div className="ml-auto">
          <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="font-mono text-xs">
            {employee.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-card border border-border/50 p-1">
          <TabsTrigger value="overview" className="font-mono text-xs">OVERVIEW</TabsTrigger>
          <TabsTrigger value="payroll" className="font-mono text-xs">PAY STRUCTURE</TabsTrigger>
          <TabsTrigger value="history" className="font-mono text-xs">PAYSLIPS</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">
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
                  <div><span className="text-muted-foreground block text-xs">Email</span>{employee.email}</div>
                  <div><span className="text-muted-foreground block text-xs">Phone</span>{employee.phone || '-'}</div>
                  <div><span className="text-muted-foreground block text-xs">National ID</span><span className="font-mono">{employee.nationalId || '-'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Gender</span><span className="capitalize">{employee.gender || '-'}</span></div>
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
                  <div><span className="text-muted-foreground block text-xs">Department</span>{department?.name || '-'}</div>
                  <div><span className="text-muted-foreground block text-xs">Type</span><span className="capitalize">{employee.employmentType.replace('_', ' ')}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Hire Date</span>{formatDate(employee.hireDate)}</div>
                  <div><span className="text-muted-foreground block text-xs">Leave Bal.</span>{employee.leaveBalance} days</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm bg-card/30">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                  <FileText className="h-4 w-4 mr-2 text-primary" />
                  STATUTORY IDs
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div><span className="text-muted-foreground block text-xs">KRA PIN</span><span className="font-mono">{employee.kraPin || '-'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">NSSF No</span><span className="font-mono">{employee.nssfNo || '-'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">SHIF No</span><span className="font-mono">{employee.shifNo || '-'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Resident Status</span><span className="capitalize">{employee.residentStatus}</span></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm bg-card/30">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                  <Landmark className="h-4 w-4 mr-2 text-primary" />
                  BANKING
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div><span className="text-muted-foreground block text-xs">Pay Method</span><span className="capitalize">{employee.payMethod}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Bank</span>{employee.bankName || '-'}</div>
                  <div className="col-span-2"><span className="text-muted-foreground block text-xs">Account No</span><span className="font-mono">{employee.bankAccount || '-'}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="mt-0">
          <Card className="border-border/50 shadow-sm bg-card/30">
            <CardHeader>
              <CardTitle className="font-mono">COMPENSATION STRUCTURE</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-2xl">
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="font-medium">Basic Salary</span>
                  <span className="font-mono text-primary font-bold text-lg">{formatMoney(employee.basicSalary)}</span>
                </div>
                
                <h4 className="text-xs font-mono text-muted-foreground mt-6 mb-2">ALLOWANCES</h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-2 text-sm">
                    <span>House Allowance</span>
                    <span className="font-mono">{formatMoney(employee.houseAllowance || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-sm">
                    <span>Transport Allowance</span>
                    <span className="font-mono">{formatMoney(employee.transportAllowance || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-sm">
                    <span>Other Allowances</span>
                    <span className="font-mono">{formatMoney(employee.otherAllowance || 0)}</span>
                  </div>
                </div>

                <h4 className="text-xs font-mono text-muted-foreground mt-6 mb-2">DEDUCTIONS & BENEFITS</h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-2 text-sm text-chart-2">
                    <span>Insurance Premium Relief</span>
                    <span className="font-mono">{formatMoney(employee.insurancePremium || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-sm text-chart-2">
                    <span>Pension (Employee)</span>
                    <span className="font-mono">{formatMoney(employee.pensionEmployee || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-sm text-destructive">
                    <span>HELB Deduction</span>
                    <span className="font-mono">{formatMoney(employee.helbMonthly || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-sm text-destructive">
                    <span>SACCO Deduction</span>
                    <span className="font-mono">{formatMoney(employee.saccoMonthly || 0)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <Card className="border-border/50 shadow-sm bg-card/30">
            <CardContent className="p-0">
              {data.payslips && data.payslips.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {/* Map payslips when schema provides structure */}
                  <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                    Payslip history will appear here after payroll runs.
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground font-mono text-sm">
                  NO PAYSLIP HISTORY
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
