import { useState } from "react";
import { useListEmployees, useCreateLoan, getListLoansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Coins } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DEFAULTS = {
  employeeId: "",
  type: "company" as const,
  amount: "",
  months: "12",
  interestRateBps: "0",
  startDate: new Date().toISOString().slice(0, 10),
};

export function IssueLoanDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState(DEFAULTS);
  const { data: employees } = useListEmployees();
  const createLoan = useCreateLoan();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const set = (field: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));
  const setVal = (field: keyof typeof DEFAULTS) => (v: string) =>
    setForm(f => ({ ...f, [field]: v }));

  const close = () => { onOpenChange(false); setForm(DEFAULTS); };

  const monthlyInstallment = () => {
    const P = Number(form.amount) || 0;
    const n = Number(form.months) || 1;
    const bps = Number(form.interestRateBps) || 0;
    if (P <= 0 || n <= 0) return null;
    const monthlyRate = bps / 12 / 10_000;
    if (monthlyRate === 0) return (P / n).toFixed(2);
    return (P * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)).toFixed(2);
  };

  const submit = () => {
    if (!form.employeeId) { toast({ variant: "destructive", title: "Select an employee" }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }
    if (!form.months || Number(form.months) < 1) { toast({ variant: "destructive", title: "Enter valid term (months)" }); return; }

    createLoan.mutate({
      data: {
        employeeId: Number(form.employeeId),
        type: form.type as any,
        principal: Number(form.amount) as any, // API uses moneyString but generated type says number
        months: Number(form.months),
        interestRateBps: Number(form.interestRateBps) || 0,
        startDate: form.startDate,
      } as any,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
        toast({ title: "Loan issued", description: `Loan of KES ${Number(form.amount).toLocaleString()} issued successfully.` });
        close();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.data?.error ?? err?.message ?? "Failed to issue loan." });
      },
    });
  };

  const est = monthlyInstallment();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">ISSUE LOAN DIRECTLY</DialogTitle>
          <DialogDescription>Issue a loan or salary advance directly to an employee</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">EMPLOYEE *</Label>
            <Select value={form.employeeId} onValueChange={setVal("employeeId")}>
              <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {employees?.map(r => (
                  <SelectItem key={r.employee.id} value={String(r.employee.id)}>
                    {r.employee.firstName} {r.employee.lastName} ({r.employee.empNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">LOAN TYPE</Label>
            <Select value={form.type} onValueChange={setVal("type")}>
              <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company Loan</SelectItem>
                <SelectItem value="sacco">SACCO Loan</SelectItem>
                <SelectItem value="advance">Salary Advance</SelectItem>
                <SelectItem value="emergency">Emergency Advance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">START DATE</Label>
            <Input type="date" value={form.startDate} onChange={set("startDate")} className="bg-background/50" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">PRINCIPAL AMOUNT (KES) *</Label>
            <Input type="number" value={form.amount} onChange={set("amount")} placeholder="50000" className="bg-background/50" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">TERM (MONTHS) *</Label>
            <Input type="number" value={form.months} onChange={set("months")} placeholder="12" min="1" max="60" className="bg-background/50" />
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">INTEREST RATE (BPS — 0 = interest-free)</Label>
            <Input type="number" value={form.interestRateBps} onChange={set("interestRateBps")} placeholder="0" className="bg-background/50" />
            <p className="text-xs text-muted-foreground font-mono">100 bps = 1% per annum. Leave 0 for salary advances.</p>
          </div>

          {est && (
            <div className="col-span-2 p-3 rounded-lg bg-primary/5 border border-primary/20 font-mono text-sm flex justify-between">
              <span className="text-muted-foreground">EST. MONTHLY INSTALLMENT</span>
              <span className="text-primary font-bold">KES {Number(est).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2 border-t border-border/30">
          <Button variant="outline" onClick={close} className="font-mono">CANCEL</Button>
          <Button onClick={submit} disabled={createLoan.isPending} className="font-mono">
            {createLoan.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> ISSUING...</>
              : <><Coins className="h-4 w-4 mr-2" /> ISSUE LOAN</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
