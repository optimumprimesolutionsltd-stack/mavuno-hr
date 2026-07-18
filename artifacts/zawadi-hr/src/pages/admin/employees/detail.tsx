import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetEmployee } from "@workspace/api-client-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, User, Briefcase, Landmark, FileText, Pencil, UserX, AlertCircle,
} from "lucide-react";
import { EditEmployeeDialog } from "./edit-dialog";
import { TerminateDialog } from "./terminate-dialog";

export function EmployeeDetail() {
  const [, params] = useRoute("/admin/employees/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  const { data, isLoading, error } = useGetEmployee(id, {
    query: { enabled: !!id },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-48 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
        <AlertCircle className="h-10 w-10" />
        <p className="font-mono">EMPLOYEE NOT FOUND</p>
        <Button variant="outline" asChild>
          <Link href="/admin/employees"><ArrowLeft className="h-4 w-4 mr-2" />BACK</Link>
        </Button>
      </div>
    );
  }

  const { employee, department } = data;
  const isTerminated = employee.status === "terminated";

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/employees"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase truncate">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="text-muted-foreground text-sm font-mono">
            {employee.empNo} • {employee.position}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={isTerminated ? "destructive" : "default"}
            className="font-mono text-xs"
          >
            {employee.status.toUpperCase()}
          </Badge>
          {!isTerminated && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="font-mono gap-1.5"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                EDIT
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
                onClick={() => setTerminateOpen(true)}
              >
                <UserX className="h-3.5 w-3.5" />
                TERMINATE
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Terminated banner */}
      {isTerminated && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-destructive">Employee terminated</span>
            {(employee as any).terminationDate && (
              <span className="text-muted-foreground ml-2">
                effective {formatDate((employee as any).terminationDate)}
              </span>
            )}
            {(employee as any).terminationReason && (
              <span className="text-muted-foreground ml-2">
                — {(employee as any).terminationReason}
              </span>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-card border border-border/50 p-1">
          <TabsTrigger value="overview" className="font-mono text-xs">OVERVIEW</TabsTrigger>
          <TabsTrigger value="payroll" className="font-mono text-xs">PAY STRUCTURE</TabsTrigger>
          <TabsTrigger value="history" className="font-mono text-xs">PAYSLIPS</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Personal Info */}
            <Card className="border-border/50 shadow-sm bg-card/30">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                  <User className="h-4 w-4 mr-2 text-primary" />PERSONAL INFO
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  {/* Email — full width to prevent overflow */}
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-xs mb-0.5">Email</span>
                    <span className="break-all">{employee.email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Phone</span>
                    <span>{employee.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Gender</span>
                    <span className="capitalize">{employee.gender || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">National ID</span>
                    <span className="font-mono">{employee.nationalId || '-'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Employment */}
            <Card className="border-border/50 shadow-sm bg-card/30">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                  <Briefcase className="h-4 w-4 mr-2 text-primary" />EMPLOYMENT
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Department</span>
                    {department?.name || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Type</span>
                    <span className="capitalize">{employee.employmentType.replace('_', ' ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Hire Date</span>
                    {formatDate(employee.hireDate)}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Leave Bal.</span>
                    {employee.leaveBalance} days
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statutory IDs */}
            <Card className="border-border/50 shadow-sm bg-card/30">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                  <FileText className="h-4 w-4 mr-2 text-primary" />STATUTORY IDs
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">KRA PIN</span>
                    <span className="font-mono">{employee.kraPin || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">NSSF No</span>
                    <span className="font-mono">{employee.nssfNo || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">SHIF No</span>
                    <span className="font-mono">{employee.shifNo || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Resident Status</span>
                    <span className="capitalize">{employee.residentStatus.replace('_', ' ')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Banking */}
            <Card className="border-border/50 shadow-sm bg-card/30">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                  <Landmark className="h-4 w-4 mr-2 text-primary" />BANKING
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Pay Method</span>
                    <span className="capitalize">{employee.payMethod}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs mb-0.5">Bank</span>
                    {employee.bankName || '-'}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-xs mb-0.5">Account No</span>
                    <span className="font-mono">{employee.bankAccount || '-'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Pay Structure tab ── */}
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
                  {[
                    ["House Allowance", employee.houseAllowance],
                    ["Transport Allowance", employee.transportAllowance],
                    ["Other Allowances", employee.otherAllowance],
                    ["Non-Cash Benefit", employee.nonCashBenefit],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex justify-between items-center py-2 text-sm">
                      <span>{label}</span>
                      <span className="font-mono">{formatMoney(Number(val) || 0)}</span>
                    </div>
                  ))}
                </div>

                <h4 className="text-xs font-mono text-muted-foreground mt-6 mb-2">DEDUCTIONS & BENEFITS</h4>
                <div className="space-y-1">
                  {[
                    ["Insurance Premium Relief", employee.insurancePremium, "text-chart-2"],
                    ["Pension (Employee)", employee.pensionEmployee, "text-chart-2"],
                    ["Pension (Employer)", employee.pensionEmployer, "text-chart-2"],
                    ["HELB Deduction", employee.helbMonthly, "text-destructive"],
                    ["SACCO Deduction", employee.saccoMonthly, "text-destructive"],
                    ["Mortgage Interest", employee.mortgageInterest, "text-chart-2"],
                  ].map(([label, val, cls]) => (
                    <div key={String(label)} className={`flex justify-between items-center py-2 text-sm ${cls}`}>
                      <span>{label}</span>
                      <span className="font-mono">{formatMoney(Number(val) || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payslips tab ── */}
        <TabsContent value="history" className="mt-0">
          <Card className="border-border/50 shadow-sm bg-card/30">
            <CardContent className="p-0">
              {(data as any).payslips?.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {(data as any).payslips.map((item: any, i: number) => {
                    const slip = item.slip ?? item;
                    const run = item.run ?? {};
                    return (
                      <div key={slip.id ?? i} className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors">
                        <div>
                          <div className="font-mono text-sm font-semibold">{run.name ?? run.period ?? '-'}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {run.period} • {run.runType?.replace('_', ' ')}
                          </div>
                        </div>
                        <div className="flex items-center gap-6 sm:gap-8 text-right">
                          {[
                            ["GROSS", slip.gross],
                            ["PAYE", slip.paye],
                            ["NSSF", slip.nssfEmployee],
                          ].map(([lbl, v]) => (
                            <div key={String(lbl)}>
                              <div className="text-xs text-muted-foreground font-mono">{lbl}</div>
                              <div className="font-mono text-sm">{formatMoney(Number(v) || 0)}</div>
                            </div>
                          ))}
                          <div>
                            <div className="text-xs text-muted-foreground font-mono">NET PAY</div>
                            <div className="font-mono text-sm font-bold text-primary">{formatMoney(slip.netPay ?? 0)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

      {/* Dialogs */}
      <EditEmployeeDialog
        employee={employee as any}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <TerminateDialog
        employeeId={employee.id}
        employeeName={`${employee.firstName} ${employee.lastName}`}
        empNo={employee.empNo}
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        onSuccess={() => setLocation("/admin/employees")}
      />
    </div>
  );
}
