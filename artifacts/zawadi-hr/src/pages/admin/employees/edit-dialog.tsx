import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListEmployeesQueryKey, getGetEmployeeQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, User, Briefcase, Landmark, Shield, AlertTriangle, Info as InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  gender: string;
  nationalId?: string | null;
  position: string;
  hireDate: string;
  employmentType: string;
  residentStatus: string;
  basicSalary: number;
  houseAllowance?: number | null;
  transportAllowance?: number | null;
  otherAllowance?: number | null;
  nonCashBenefit?: number | null;
  insurancePremium?: number | null;
  pensionEmployee?: number | null;
  pensionEmployer?: number | null;
  mortgageInterest?: number | null;
  helbMonthly?: number | null;
  saccoMonthly?: number | null;
  payMethod: string;
  bankName?: string | null;
  bankAccount?: string | null;
  bankBranchCode?: string | null;
  mpesaPhone?: string | null;
  kraPin?: string | null;
  nssfNo?: string | null;
  shifNo?: string | null;
  disabilityExemption?: boolean | null;
  departmentId?: number | null;
  workDaysPerWeek?: number | null;
  worksOnHolidays?: boolean | null;
}

interface Props {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: "personal" | "employment" | "payment" | "compliance";
}

function centsToStr(cents: number | null | undefined): string {
  if (!cents) return "0";
  return (Number(cents) / 100).toFixed(2);
}

export function EditEmployeeDialog({ employee, open, onOpenChange, defaultTab = "personal" }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", gender: "male", nationalId: "",
    position: "", hireDate: "", employmentType: "permanent", residentStatus: "resident",
    basicSalary: "", houseAllowance: "0", transportAllowance: "0", otherAllowance: "0",
    nonCashBenefit: "0", insurancePremium: "0", pensionEmployee: "0", pensionEmployer: "0",
    mortgageInterest: "0", helbMonthly: "0", saccoMonthly: "0",
    payMethod: "bank", bankName: "", bankAccount: "", bankBranchCode: "", mpesaPhone: "",
    kraPin: "", nssfNo: "", shifNo: "",
    workDaysPerWeek: "5", worksOnHolidays: "no",
  });

  // Populate form when employee changes
  useEffect(() => {
    if (!employee) return;
    setForm({
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      gender: employee.gender ?? "male",
      nationalId: employee.nationalId ?? "",
      position: employee.position ?? "",
      hireDate: employee.hireDate ?? "",
      employmentType: employee.employmentType ?? "permanent",
      residentStatus: employee.residentStatus ?? "resident",
      basicSalary: centsToStr(employee.basicSalary),
      houseAllowance: centsToStr(employee.houseAllowance),
      transportAllowance: centsToStr(employee.transportAllowance),
      otherAllowance: centsToStr(employee.otherAllowance),
      nonCashBenefit: centsToStr(employee.nonCashBenefit),
      insurancePremium: centsToStr(employee.insurancePremium),
      pensionEmployee: centsToStr(employee.pensionEmployee),
      pensionEmployer: centsToStr(employee.pensionEmployer),
      mortgageInterest: centsToStr(employee.mortgageInterest),
      helbMonthly: centsToStr(employee.helbMonthly),
      saccoMonthly: centsToStr(employee.saccoMonthly),
      payMethod: employee.payMethod ?? "bank",
      bankName: employee.bankName ?? "",
      bankAccount: employee.bankAccount ?? "",
      bankBranchCode: employee.bankBranchCode ?? "",
      mpesaPhone: employee.mpesaPhone ?? "",
      kraPin: employee.kraPin ?? "",
      nssfNo: employee.nssfNo ?? "",
      shifNo: employee.shifNo ?? "",
      workDaysPerWeek: String(employee.workDaysPerWeek ?? 5),
      worksOnHolidays: employee.worksOnHolidays ? "yes" : "no",
    });
  }, [employee]);

  const update = useMutation({
    mutationFn: () => {
      if (!employee) throw new Error("No employee");
      const payload: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        gender: form.gender,
        position: form.position,
        hireDate: form.hireDate || undefined,
        employmentType: form.employmentType,
        residentStatus: form.residentStatus,
        basicSalary: form.basicSalary || "0",
        houseAllowance: form.houseAllowance || "0",
        transportAllowance: form.transportAllowance || "0",
        otherAllowance: form.otherAllowance || "0",
        nonCashBenefit: form.nonCashBenefit || "0",
        insurancePremium: form.insurancePremium || "0",
        pensionEmployee: form.pensionEmployee || "0",
        pensionEmployer: form.pensionEmployer || "0",
        mortgageInterest: form.mortgageInterest || "0",
        helbMonthly: form.helbMonthly || "0",
        saccoMonthly: form.saccoMonthly || "0",
        payMethod: form.payMethod,
        workDaysPerWeek: form.workDaysPerWeek,
        worksOnHolidays: form.worksOnHolidays === "yes",
      };
      if (form.phone) payload.phone = form.phone;
      if (form.nationalId) payload.nationalId = form.nationalId;
      if (form.kraPin) payload.kraPin = form.kraPin;
      if (form.nssfNo) payload.nssfNo = form.nssfNo;
      if (form.shifNo) payload.shifNo = form.shifNo;
      if (form.bankName) payload.bankName = form.bankName;
      if (form.bankAccount) payload.bankAccount = form.bankAccount;
      if (form.bankBranchCode) payload.bankBranchCode = form.bankBranchCode;
      if (form.mpesaPhone) payload.mpesaPhone = form.mpesaPhone;

      return customFetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Employee details updated." });
      qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      if (employee) {
        qc.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employee.id) });
      }
      onOpenChange(false);
    },
    onError: (e: any) => {
      const msg = (e?.data as any)?.error ?? e?.message ?? "Update failed";
      toast({ variant: "destructive", title: "Update failed", description: msg });
    },
  });

  function handleSave() {
    if (!employee) return;
    if (!form.firstName.trim()) { toast({ variant: "destructive", title: "First name is required" }); return; }
    if (!form.lastName.trim()) { toast({ variant: "destructive", title: "Last name is required" }); return; }
    if (!form.email.trim()) { toast({ variant: "destructive", title: "Email is required" }); return; }
    if (!form.position.trim()) { toast({ variant: "destructive", title: "Position is required" }); return; }
    if (!form.basicSalary || parseFloat(form.basicSalary) <= 0) {
      toast({ variant: "destructive", title: "Basic salary must be greater than 0" }); return;
    }
    update.mutate();
  }

  if (!employee) return null;

  // ── Render helpers called as plain functions (NOT as React components) ──────
  // IMPORTANT: defining these as `const F = () => <jsx>` inside a component body
  // causes React to treat each render's F as a NEW component type, unmounting and
  // remounting all inputs on every keystroke (loses focus mid-type). Instead we
  // call them as plain functions: {textField(...)} / {selectField(...)}
  const textField = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <div className="space-y-1.5">
      <Label className="text-xs font-mono text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="bg-background/50"
      />
    </div>
  );

  const selectField = (
    label: string,
    key: keyof typeof form,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-mono text-muted-foreground">{label}</Label>
      <Select
        value={form[key] as string}
        onValueChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
      >
        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono">
            EDIT — {employee.firstName} {employee.lastName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4 bg-card border border-border/50">
            <TabsTrigger value="personal" className="font-mono text-xs gap-1.5">
              <User className="h-3.5 w-3.5" />PERSONAL
            </TabsTrigger>
            <TabsTrigger value="employment" className="font-mono text-xs gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />EMPLOYMENT
            </TabsTrigger>
            <TabsTrigger value="payment" className="font-mono text-xs gap-1.5">
              <Landmark className="h-3.5 w-3.5" />PAYMENT
            </TabsTrigger>
            <TabsTrigger value="compliance" className="font-mono text-xs gap-1.5">
              <Shield className="h-3.5 w-3.5" />COMPLIANCE
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4 px-1">

            {/* ── Personal ── */}
            <TabsContent value="personal" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {textField("FIRST NAME", "firstName")}
                {textField("LAST NAME", "lastName")}
              </div>
              {textField("EMAIL", "email", "email")}
              <div className="grid grid-cols-2 gap-4">
                {textField("PHONE", "phone", "text", "+254 7xx xxx xxx")}
                {textField("NATIONAL ID", "nationalId")}
              </div>
              {selectField("GENDER", "gender", [
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ])}
            </TabsContent>

            {/* ── Employment ── */}
            <TabsContent value="employment" className="mt-0 space-y-4">
              {textField("POSITION / JOB TITLE", "position")}
              <div className="grid grid-cols-2 gap-4">
                {textField("HIRE DATE", "hireDate", "date")}
                {selectField("EMPLOYMENT TYPE", "employmentType", [
                  { value: "permanent", label: "Permanent" },
                  { value: "contract", label: "Contract" },
                  { value: "casual", label: "Casual" },
                ])}
              </div>
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-mono text-muted-foreground mb-3">WORK SCHEDULE</p>
                <div className="grid grid-cols-2 gap-4">
                  {selectField("WORKING DAYS PER WEEK", "workDaysPerWeek", [
                    { value: "5", label: "5 days (Mon – Fri)" },
                    { value: "6", label: "6 days (Mon – Sat)" },
                  ])}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-mono text-muted-foreground">WORKS ON PUBLIC HOLIDAYS?</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default text-muted-foreground hover:text-foreground">
                              <InfoIcon className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px] text-center leading-relaxed">
                            This controls whether public holidays reduce an employee's leave balance. It does not affect salary — pay is always based on contracted days.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={form.worksOnHolidays as string}
                      onValueChange={(v) => setForm((f) => ({ ...f, worksOnHolidays: v }))}
                    >
                      <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No — holidays not counted</SelectItem>
                        <SelectItem value="yes">Yes — holidays count as leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-mono text-muted-foreground mb-3">COMPENSATION</p>
                <div className="grid grid-cols-2 gap-4">
                  {textField("BASIC SALARY (KES)", "basicSalary", "text", "50000.00")}
                  {textField("HOUSE ALLOWANCE", "houseAllowance", "text", "0")}
                  {textField("TRANSPORT ALLOWANCE", "transportAllowance", "text", "0")}
                  {textField("OTHER ALLOWANCE", "otherAllowance", "text", "0")}
                </div>
              </div>
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-mono text-muted-foreground mb-3">DEDUCTIONS</p>
                <div className="grid grid-cols-2 gap-4">
                  {textField("INSURANCE PREMIUM", "insurancePremium", "text", "0")}
                  {textField("PENSION (EMPLOYEE)", "pensionEmployee", "text", "0")}
                  {textField("PENSION (EMPLOYER)", "pensionEmployer", "text", "0")}
                  {textField("HELB MONTHLY", "helbMonthly", "text", "0")}
                  {textField("SACCO MONTHLY", "saccoMonthly", "text", "0")}
                  {textField("MORTGAGE INTEREST", "mortgageInterest", "text", "0")}
                </div>
              </div>
            </TabsContent>

            {/* ── Payment ── */}
            <TabsContent value="payment" className="mt-0 space-y-4">
              {selectField("PAY METHOD", "payMethod", [
                { value: "bank", label: "Bank Transfer" },
                { value: "mpesa", label: "M-Pesa" },
                { value: "cash", label: "Cash" },
              ])}
              {form.payMethod === "bank" && (
                <div className="space-y-4">
                  {textField("BANK NAME", "bankName", "text", "Equity Bank")}
                  <div className="grid grid-cols-2 gap-4">
                    {textField("BRANCH CODE", "bankBranchCode", "text", "001")}
                    {textField("ACCOUNT NUMBER", "bankAccount", "text", "0123456789")}
                  </div>
                </div>
              )}
              {form.payMethod === "mpesa" && textField("M-PESA PHONE", "mpesaPhone", "text", "+254 7xx xxx xxx")}
            </TabsContent>

            {/* ── Compliance ── */}
            <TabsContent value="compliance" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {textField("KRA PIN", "kraPin", "text", "A000000000B")}

                {/* NSSF No — required for statutory compliance */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                    NSSF NO
                    {!form.nssfNo && (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px]">Required for NSSF filing</span>
                      </span>
                    )}
                  </Label>
                  <Input
                    type="text"
                    value={form.nssfNo}
                    onChange={(e) => setForm((f) => ({ ...f, nssfNo: e.target.value }))}
                    placeholder="e.g. 1234567"
                    className={`bg-background/50 ${!form.nssfNo ? "border-amber-500/50 focus-visible:ring-amber-500/30" : ""}`}
                  />
                </div>

                {/* SHIF No — required for statutory compliance */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                    SHIF NO
                    {!form.shifNo && (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px]">Required for SHIF filing</span>
                      </span>
                    )}
                  </Label>
                  <Input
                    type="text"
                    value={form.shifNo}
                    onChange={(e) => setForm((f) => ({ ...f, shifNo: e.target.value }))}
                    placeholder="e.g. 1234567"
                    className={`bg-background/50 ${!form.shifNo ? "border-amber-500/50 focus-visible:ring-amber-500/30" : ""}`}
                  />
                </div>
              </div>
              {selectField("RESIDENT STATUS", "residentStatus", [
                { value: "resident", label: "Resident" },
                { value: "non_resident", label: "Non-Resident" },
              ])}
            </TabsContent>

          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t border-border/50 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="font-mono" onClick={handleSave} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            SAVE CHANGES
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
