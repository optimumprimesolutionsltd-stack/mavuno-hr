import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useGetEmployee, customFetch } from "@workspace/api-client-react";
import { formatMoney, formatDate, fullName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, User, Briefcase, Landmark, FileText, Pencil, UserX, AlertCircle, KeyRound, Loader2,
  CalendarDays, Check, X, Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EditEmployeeDialog } from "./edit-dialog";
import { TerminateDialog } from "./terminate-dialog";

export function EmployeeDetail() {
  const [, params] = useRoute("/admin/employees/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState<"personal" | "employment" | "payment" | "compliance">("personal");
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [portalResult, setPortalResult] = useState<{ tempPassword?: string; message: string } | null>(null);

  function openEdit(tab: "personal" | "employment" | "payment" | "compliance" = "personal") {
    setEditTab(tab);
    setEditOpen(true);
  }

  const grantPortal = useMutation({
    mutationFn: () =>
      customFetch(`/api/employees/${id}/portal-access`, { method: "POST" }) as Promise<{
        ok: boolean;
        tempPassword?: string;
        message: string;
      }>,
    onSuccess: (result) => {
      setPortalResult(result);
    },
    onError: (e: any) => {
      const msg = (e?.data as any)?.error ?? e?.message ?? "Failed to grant portal access";
      toast({ variant: "destructive", title: "Portal access failed", description: msg });
    },
  });

  const [editingLeave, setEditingLeave] = useState(false);
  const [leaveEntitlement, setLeaveEntitlement] = useState<number | "">(21);

  const patchLeaveBalance = useMutation({
    mutationFn: (days: number) =>
      customFetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveBalance: days * 10 }),
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Leave entitlement updated." });
      setEditingLeave(false);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e?.data?.error ?? e?.message });
    },
  });

  const { data, isLoading, error, refetch } = useGetEmployee(id, {
    query: { enabled: !!id },
  });

  // Sync edit field when data arrives
  const summary = (data as any)?.leaveBalanceSummary as
    | { entitlement: number; takenDays: number; remaining: number }
    | undefined;
  const currentEntitlement = summary?.entitlement ?? 21;

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
            {fullName(employee)}
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
                onClick={() => openEdit("personal")}
              >
                <Pencil className="h-3.5 w-3.5" />
                EDIT
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono gap-1.5"
                onClick={() => grantPortal.mutate()}
                disabled={grantPortal.isPending}
                title="Grant or view portal access for this employee"
              >
                {grantPortal.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <KeyRound className="h-3.5 w-3.5" />}
                PORTAL ACCESS
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

            {/* Leave Balance */}
            <Card className="border-border/50 shadow-sm bg-card/30 md:col-span-2">
              <CardHeader className="pb-3 border-b border-border/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
                    <CalendarDays className="h-4 w-4 mr-2 text-primary" />ANNUAL LEAVE BALANCE
                  </CardTitle>
                  {!isTerminated && !editingLeave && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="font-mono text-xs h-7 gap-1"
                      onClick={() => { setLeaveEntitlement(currentEntitlement); setEditingLeave(true); }}
                    >
                      <Pencil className="h-3 w-3" />EDIT ENTITLEMENT
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: "ENTITLED", value: currentEntitlement, color: "text-primary" },
                    { label: "TAKEN THIS YEAR", value: summary?.takenDays ?? 0, color: "text-amber-400" },
                    { label: "REMAINING", value: summary?.remaining ?? currentEntitlement, color: (summary?.remaining ?? currentEntitlement) <= 3 ? "text-destructive" : "text-emerald-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center p-4 rounded-lg bg-muted/20 border border-border/30">
                      <div className={`text-3xl font-mono font-bold ${color}`}>{value}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{label}</div>
                      <div className="text-xs text-muted-foreground">days</div>
                    </div>
                  ))}
                </div>
                {editingLeave && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <span className="text-sm font-mono text-muted-foreground shrink-0">Annual entitlement (days):</span>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={leaveEntitlement}
                      onChange={(e) => setLeaveEntitlement(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-24 h-8 px-2 rounded border border-border bg-background font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      className="font-mono gap-1 h-8"
                      disabled={patchLeaveBalance.isPending || leaveEntitlement === ""}
                      onClick={() => patchLeaveBalance.mutate(Number(leaveEntitlement))}
                    >
                      {patchLeaveBalance.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      SAVE
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-mono gap-1 h-8"
                      onClick={() => setEditingLeave(false)}
                    >
                      <X className="h-3 w-3" />CANCEL
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Pay Structure tab ── */}
        <TabsContent value="payroll" className="mt-0">
          <Card className="border-border/50 shadow-sm bg-card/30">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="font-mono">COMPENSATION STRUCTURE</CardTitle>
              {!isTerminated && (
                <Button size="sm" variant="outline" className="font-mono gap-1.5" onClick={() => openEdit("employment")}>
                  <Pencil className="h-3.5 w-3.5" />
                  EDIT SALARY
                </Button>
              )}
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
        defaultTab={editTab}
      />
      <TerminateDialog
        employeeId={employee.id}
        employeeName={fullName(employee)}
        empNo={employee.empNo}
        hireDate={employee.hireDate}
        basic={employee.basicSalary}
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        onSuccess={() => setLocation("/admin/employees")}
      />

      {/* Portal Access Result Dialog */}
      <Dialog open={!!portalResult} onOpenChange={(v) => { if (!v) setPortalResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              PORTAL ACCESS
            </DialogTitle>
            <DialogDescription>
              {portalResult?.tempPassword
                ? "New portal account created. Share the temporary password securely — it will not be shown again."
                : portalResult?.message}
            </DialogDescription>
          </DialogHeader>
          {portalResult?.tempPassword && (
            <div className="space-y-3 pt-2">
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-1.5">EMPLOYEE EMAIL</p>
                <Input readOnly value={employee.email} className="font-mono bg-muted/30" />
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-1.5">TEMPORARY PASSWORD</p>
                <div className="flex gap-2">
                  <Input readOnly value={portalResult.tempPassword} className="font-mono bg-muted/30 text-primary font-bold" />
                  <Button
                    variant="outline" size="icon" className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(portalResult!.tempPassword!);
                      toast({ title: "Copied", description: "Password copied to clipboard." });
                    }}
                    title="Copy to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The employee must change this password on first login.
              </p>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setPortalResult(null)} className="font-mono">DONE</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
