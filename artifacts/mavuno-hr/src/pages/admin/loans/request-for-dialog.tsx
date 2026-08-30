import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListEmployees, customFetch, getListLoanRequestsQueryKey, LoanRequestInputType } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { fullName } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DEFAULTS = {
  employeeId: "",
  type: "company" as LoanRequestInputType,
  amount: "",
  months: "12",
  interestRateBps: "0",
  reason: "",
};

export function RequestLoanForDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULTS);
  const { data: employees } = useListEmployees();

  function set(k: keyof typeof DEFAULTS, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const close = () => { onOpenChange(false); setForm(DEFAULTS); };

  const mutation = useMutation({
    mutationFn: () =>
      customFetch("/api/loans/requests/for-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: Number(form.employeeId),
          type: form.type,
          amount: form.amount,
          months: Number(form.months),
          interestRateBps: form.type === "sacco" ? (parseInt(form.interestRateBps) || 0) : 0,
          reason: form.reason.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Loan request created", description: "Request is pending — you can approve it now." });
      qc.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
      close();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error ?? e?.message ?? "Failed to create request";
      toast({ variant: "destructive", title: "Error", description: msg });
    },
  });

  function handleSubmit() {
    if (!form.employeeId) { toast({ variant: "destructive", title: "Select an employee" }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }
    mutation.mutate();
  }

  const est = (() => {
    const P = parseFloat(form.amount) || 0;
    const n = parseInt(form.months) || 1;
    const bps = form.type === "sacco" ? (parseInt(form.interestRateBps) || 0) : 0;
    if (P <= 0 || n <= 0) return null;
    const r = bps / 12 / 10_000;
    if (r === 0) return (P / n).toFixed(2);
    return (P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)).toFixed(2);
  })();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <FileText className="h-4 w-4" /> REQUEST LOAN FOR EMPLOYEE
          </DialogTitle>
          <DialogDescription>Create a loan request on behalf of an employee. It will appear as pending and can be approved immediately.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">EMPLOYEE *</Label>
            <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
              <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {employees?.map(r => (
                  <SelectItem key={r.employee.id} value={String(r.employee.id)}>
                    {fullName(r.employee)} ({r.employee.empNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">LOAN TYPE</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v as any)}>
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
            <Label className="text-xs font-mono text-muted-foreground">AMOUNT (KES) *</Label>
            <Input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="50000" className="bg-background/50" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">TERM (MONTHS) *</Label>
            <Input type="number" value={form.months} onChange={e => set("months", e.target.value)} min="1" max="60" className="bg-background/50" />
          </div>

          {form.type === "sacco" && (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">
                SACCO INTEREST RATE (BPS) <span className="text-[10px] font-normal text-amber-500 ml-1">— locked once approved</span>
              </Label>
              <Input type="number" value={form.interestRateBps} onChange={e => set("interestRateBps", e.target.value)} placeholder="1200" className="bg-background/50" />
              <p className="text-xs text-muted-foreground font-mono">100 bps = 1% p.a.</p>
            </div>
          )}

          {est && (
            <div className="col-span-2 p-3 rounded-lg bg-primary/5 border border-primary/20 font-mono text-sm flex justify-between">
              <span className="text-muted-foreground text-xs">EST. MONTHLY INSTALLMENT</span>
              <span className="text-primary font-bold">KES {Number(est).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">REASON / NOTE (optional)</Label>
            <Textarea value={form.reason} onChange={e => set("reason", e.target.value)} rows={2} className="bg-background/50 resize-none" maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} className="font-mono">CANCEL</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="font-mono">
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />CREATING...</> : <>CREATE REQUEST</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
