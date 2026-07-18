import { useState } from "react";
import { useCreateEmployee, useListEmployees } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronRight, ChevronLeft, Check, User, Briefcase, Landmark, Shield } from "lucide-react";
import { getListEmployeesQueryKey } from "@workspace/api-client-react";

interface FormData {
  // Step 1 — Personal
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  nationalId: string;
  // Step 2 — Employment
  position: string;
  hireDate: string;
  employmentType: string;
  residentStatus: string;
  basicSalary: string;
  houseAllowance: string;
  transportAllowance: string;
  // Step 3 — Payment
  payMethod: string;
  bankName: string;
  bankAccount: string;
  bankBranchCode: string;
  mpesaPhone: string;
  // Step 4 — Compliance
  kraPin: string;
  nssfNo: string;
  shifNo: string;
}

const DEFAULTS: FormData = {
  firstName: "", lastName: "", email: "", phone: "", gender: "male", nationalId: "",
  position: "", hireDate: new Date().toISOString().slice(0, 10), employmentType: "permanent",
  residentStatus: "resident", basicSalary: "", houseAllowance: "0", transportAllowance: "0",
  payMethod: "bank", bankName: "", bankAccount: "", bankBranchCode: "", mpesaPhone: "",
  kraPin: "", nssfNo: "", shifNo: "",
};

const STEPS = [
  { label: "Personal", icon: User },
  { label: "Employment", icon: Briefcase },
  { label: "Payment", icon: Landmark },
  { label: "Compliance", icon: Shield },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OnboardDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(DEFAULTS);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createEmployee = useCreateEmployee();

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));
  const setVal = (field: keyof FormData) => (v: string) =>
    setForm(f => ({ ...f, [field]: v }));

  const close = () => { onOpenChange(false); setStep(0); setForm(DEFAULTS); };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!form.firstName.trim()) return "First name is required";
      if (!form.lastName.trim()) return "Last name is required";
      if (!form.email.trim() || !form.email.includes("@")) return "Valid email is required";
    }
    if (step === 1) {
      if (!form.position.trim()) return "Position is required";
      if (!form.hireDate) return "Hire date is required";
      if (!form.basicSalary || isNaN(Number(form.basicSalary)) || Number(form.basicSalary) <= 0)
        return "Valid basic salary is required";
    }
    if (step === 2) {
      if (form.payMethod === "bank" && !form.bankAccount.trim()) return "Bank account number is required";
      if (form.payMethod === "mpesa" && !form.mpesaPhone.trim()) return "M-Pesa phone is required";
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) { toast({ variant: "destructive", title: "Validation", description: err }); return; }
    setStep(s => s + 1);
  };

  const submit = () => {
    const err = validateStep();
    if (err) { toast({ variant: "destructive", title: "Validation", description: err }); return; }

    createEmployee.mutate({
      data: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone || undefined,
        gender: form.gender,
        nationalId: form.nationalId || undefined,
        kraPin: form.kraPin || undefined,
        nssfNo: form.nssfNo || undefined,
        shifNo: form.shifNo || undefined,
        position: form.position.trim(),
        hireDate: form.hireDate,
        employmentType: form.employmentType,
        residentStatus: form.residentStatus,
        payMethod: form.payMethod,
        bankName: form.bankName || undefined,
        bankAccount: form.bankAccount || undefined,
        bankBranchCode: form.bankBranchCode || undefined,
        mpesaPhone: form.mpesaPhone || undefined,
        // Backend moneyString expects KES string, e.g. "50000" → toCents → 5000000
        basicSalary: form.basicSalary as any,
        houseAllowance: (form.houseAllowance || "0") as any,
        transportAllowance: (form.transportAllowance || "0") as any,
        disabilityExemption: false,
      } as any,
    }, {
      onSuccess: (emp) => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: "Employee onboarded", description: `${emp.firstName} ${emp.lastName} added successfully` });
        close();
      },
      onError: (err: any) => {
        const msg = err?.message || "Failed to create employee";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">ONBOARD EMPLOYEE</DialogTitle>
          <DialogDescription>Add a new employee to the payroll roster</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={i} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${active ? "bg-primary text-primary-foreground" : done ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
                  {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-1 ${done ? "bg-primary/40" : "bg-border/50"}`} />}
              </div>
            );
          })}
        </div>

        {/* Step 0 — Personal */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">FIRST NAME *</Label>
              <Input value={form.firstName} onChange={set("firstName")} placeholder="John" className="bg-background/50" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">LAST NAME *</Label>
              <Input value={form.lastName} onChange={set("lastName")} placeholder="Kamau" className="bg-background/50" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">EMAIL *</Label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="john.kamau@company.co.ke" className="bg-background/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">PHONE</Label>
              <Input value={form.phone} onChange={set("phone")} placeholder="+254 7XX XXX XXX" className="bg-background/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">GENDER</Label>
              <Select value={form.gender} onValueChange={setVal("gender")}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">NATIONAL ID</Label>
              <Input value={form.nationalId} onChange={set("nationalId")} placeholder="12345678" className="bg-background/50" />
            </div>
          </div>
        )}

        {/* Step 1 — Employment */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">JOB TITLE / POSITION *</Label>
              <Input value={form.position} onChange={set("position")} placeholder="Software Engineer" className="bg-background/50" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">HIRE DATE *</Label>
              <Input type="date" value={form.hireDate} onChange={set("hireDate")} className="bg-background/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">EMPLOYMENT TYPE</Label>
              <Select value={form.employmentType} onValueChange={setVal("employmentType")}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">RESIDENT STATUS</Label>
              <Select value={form.residentStatus} onValueChange={setVal("residentStatus")}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resident">Resident</SelectItem>
                  <SelectItem value="non_resident">Non-Resident</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">BASIC SALARY (KES) *</Label>
              <Input type="number" value={form.basicSalary} onChange={set("basicSalary")} placeholder="50000" className="bg-background/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">HOUSE ALLOWANCE (KES)</Label>
              <Input type="number" value={form.houseAllowance} onChange={set("houseAllowance")} placeholder="0" className="bg-background/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">TRANSPORT ALLOWANCE (KES)</Label>
              <Input type="number" value={form.transportAllowance} onChange={set("transportAllowance")} placeholder="0" className="bg-background/50" />
            </div>
          </div>
        )}

        {/* Step 2 — Payment */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">PAYMENT METHOD</Label>
              <Select value={form.payMethod} onValueChange={setVal("payMethod")}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.payMethod === "bank" && (
              <>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">BANK NAME *</Label>
                  <Input value={form.bankName} onChange={set("bankName")} placeholder="Equity Bank" className="bg-background/50" autoFocus />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">ACCOUNT NUMBER *</Label>
                  <Input value={form.bankAccount} onChange={set("bankAccount")} placeholder="0123456789" className="bg-background/50" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">BRANCH CODE</Label>
                  <Input value={form.bankBranchCode} onChange={set("bankBranchCode")} placeholder="076" className="bg-background/50" />
                </div>
              </>
            )}
            {form.payMethod === "mpesa" && (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">M-PESA PHONE *</Label>
                <Input value={form.mpesaPhone} onChange={set("mpesaPhone")} placeholder="0712345678" className="bg-background/50" autoFocus />
              </div>
            )}
            {form.payMethod === "cash" && (
              <div className="col-span-2 text-muted-foreground text-sm py-4 text-center font-mono">Cash payroll — no account details needed.</div>
            )}
          </div>
        )}

        {/* Step 3 — Compliance */}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">KRA PIN</Label>
              <Input value={form.kraPin} onChange={set("kraPin")} placeholder="A000000000A" className="bg-background/50 font-mono" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">NSSF NO.</Label>
              <Input value={form.nssfNo} onChange={set("nssfNo")} placeholder="0000000" className="bg-background/50 font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">SHIF NO.</Label>
              <Input value={form.shifNo} onChange={set("shifNo")} placeholder="00000000" className="bg-background/50 font-mono" />
            </div>
            <div className="col-span-2 p-3 rounded-lg bg-muted/30 border border-border/30 text-xs text-muted-foreground font-mono mt-2">
              Compliance numbers can be added later via the employee profile. They are required for payroll processing.
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-2 mt-2 border-t border-border/30">
          <Button variant="outline" onClick={step === 0 ? close : () => setStep(s => s - 1)} className="font-mono">
            {step === 0 ? "CANCEL" : <><ChevronLeft className="h-4 w-4 mr-1" /> BACK</>}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="font-mono">
              NEXT <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={createEmployee.isPending} className="font-mono bg-primary">
              {createEmployee.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> SAVING...</> : <><Check className="h-4 w-4 mr-2" /> ONBOARD</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
