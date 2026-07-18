import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetPortalProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Coins, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const DEFAULTS = {
  type: "company",
  amount: "",
  months: "12",
  reason: "",
};

const LOAN_TYPES = [
  { value: "company", label: "Company Loan" },
  { value: "sacco", label: "SACCO Loan" },
  { value: "advance", label: "Salary Advance" },
  { value: "emergency", label: "Emergency Advance" },
];

const ADVANCE_TYPES = new Set(["advance", "emergency"]);

export function LoanRequestDialog({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULTS);
  const { data: profile } = useGetPortalProfile();

  // Gross monthly cap (cents) — only relevant for advance/emergency
  const emp = (profile as any)?.employee;
  const grossMonthlyCents = emp
    ? (emp.basicSalary ?? 0) + (emp.houseAllowance ?? 0) + (emp.transportAllowance ?? 0) + (emp.otherAllowance ?? 0)
    : null;
  const isAdvance = ADVANCE_TYPES.has(form.type);
  const capKes = isAdvance && grossMonthlyCents != null ? grossMonthlyCents / 100 : null;
  const enteredKes = parseFloat(form.amount) || 0;
  const exceedsCap = capKes != null && enteredKes > capKes;

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const monthlyEst = () => {
    const P = parseFloat(form.amount) || 0;
    const n = parseInt(form.months) || 1;
    if (P <= 0 || n <= 0) return null;
    return (P / n).toFixed(2); // employee doesn't know rate; show 0% estimate
  };

  const mutation = useMutation({
    mutationFn: () =>
      customFetch("/api/portal/loan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount: form.amount,
          months: parseInt(form.months),
          reason: form.reason.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Request submitted",
        description: "Your loan request has been sent to HR for review.",
      });
      qc.invalidateQueries({ queryKey: ["portal-loan-requests"] });
      setForm(DEFAULTS);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error ?? e?.message ?? "Submission failed";
      toast({ variant: "destructive", title: "Submission failed", description: msg });
    },
  });

  function handleSubmit() {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    if (!form.months || parseInt(form.months) < 1) {
      toast({ variant: "destructive", title: "Enter a valid repayment term" });
      return;
    }
    if (exceedsCap) {
      toast({
        variant: "destructive",
        title: "Amount exceeds legal cap",
        description: `Salary advances are capped at one month's gross salary (KES ${capKes!.toLocaleString("en-KE", { minimumFractionDigits: 2 })}).`,
      });
      return;
    }
    mutation.mutate();
  }

  const est = monthlyEst();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setForm(DEFAULTS); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            REQUEST A LOAN
          </DialogTitle>
          <DialogDescription>
            Submit a loan or advance request for HR approval. You'll be notified once a decision is made.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground">LOAN TYPE</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOAN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-mono text-muted-foreground">AMOUNT (KES)</Label>
                {capKes != null && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    MAX: KES {capKes.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <Input
                type="number"
                min={0}
                max={capKes ?? undefined}
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="50000"
                className={`bg-background/50 ${exceedsCap ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground">REPAY OVER (MONTHS)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={form.months}
                onChange={(e) => set("months", e.target.value)}
                placeholder="12"
                className="bg-background/50"
              />
            </div>
          </div>

          {/* Legal cap warning for advances */}
          {isAdvance && capKes != null && (
            exceedsCap ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Amount exceeds the legal cap. Under Kenya's Employment Act, salary advances cannot exceed one month's gross salary —{" "}
                  <strong>KES {capKes.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-muted/50 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-chart-2" />
                <span>
                  Legal cap (Kenya Employment Act): max advance is one month's gross salary —{" "}
                  <strong className="text-foreground">KES {capKes.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>.
                </span>
              </div>
            )
          )}

          {est && !exceedsCap && (
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 font-mono text-sm">
              <span className="text-muted-foreground text-xs">EST. MONTHLY DEDUCTION</span>
              <span className="text-primary font-bold">
                KES {parseFloat(est).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground">
              REASON <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="e.g. School fees, medical emergency, home improvement…"
              className="bg-background/50 resize-none"
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="font-mono" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            SUBMIT REQUEST
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
