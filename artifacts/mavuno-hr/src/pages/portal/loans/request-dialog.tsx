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
import { Loader2, Coins, AlertCircle, CheckCircle2, Lock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const DEFAULTS = {
  type: "company",
  amount: "",
  months: "12",
  monthlyPayment: "",
  interestRateBps: "",
  reason: "",
};

const LOAN_TYPES = [
  { value: "company",   label: "Company Loan" },
  { value: "sacco",     label: "SACCO Loan" },
  { value: "advance",   label: "Salary Advance" },
  { value: "emergency", label: "Emergency Advance" },
];

const ADVANCE_TYPES = new Set(["advance", "emergency"]);

// PMT — monthly installment given principal (KES), annual BPS, and n months
function pmtKes(principal: number, bps: number, n: number): number {
  if (n <= 0 || principal <= 0) return 0;
  const r = bps / 12 / 10_000;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Reverse: how many months to pay off principal at a given monthly payment & rate?
function monthsFromPayment(principal: number, bps: number, pmt: number): number | null {
  if (pmt <= 0 || principal <= 0) return null;
  const r = bps / 12 / 10_000;
  if (r === 0) return Math.min(60, Math.ceil(principal / pmt));
  if (pmt <= principal * r) return null; // payment can't cover interest
  const n = Math.ceil(-Math.log(1 - principal * r / pmt) / Math.log(1 + r));
  if (!isFinite(n) || n <= 0) return null;
  return Math.min(60, Math.max(1, n));
}

// "last touched" controls which drives which
type Control = "months" | "monthly";

export function LoanRequestDialog({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULTS);
  const [control, setControl] = useState<Control>("months");
  const { data: profile } = useGetPortalProfile();

  const emp = (profile as any)?.employee;
  const grossMonthlyCents: number = emp
    ? (Number(emp.basicSalary) + Number(emp.houseAllowance ?? 0) + Number(emp.transportAllowance ?? 0) + Number(emp.otherAllowance ?? 0))
    : 0;
  const grossMonthlyKes = grossMonthlyCents / 100;

  const isAdvance = ADVANCE_TYPES.has(form.type);
  const isSacco   = form.type === "sacco";

  // Amount cap for advances: one month gross
  const advanceCap = isAdvance && grossMonthlyKes > 0 ? grossMonthlyKes : null;
  // Monthly installment cap for all loans: 1/3 gross (Kenya Employment Act)
  const monthlyCap = grossMonthlyKes > 0 ? grossMonthlyKes / 3 : null;

  const amountKes  = parseFloat(form.amount) || 0;
  const monthlyNum = parseFloat(form.monthlyPayment) || 0;
  const monthsNum  = parseInt(form.months) || 0;

  // Effective interest BPS: only for SACCO (employee-set rate); others shown at 0% until HR approves
  const bps = isSacco ? (parseInt(form.interestRateBps) || 0) : 0;

  // Derived values based on which control is primary
  const derivedMonthly = (control === "months" && amountKes > 0 && monthsNum > 0)
    ? pmtKes(amountKes, bps, monthsNum)
    : null;

  const derivedMonths = (control === "monthly" && amountKes > 0 && monthlyNum > 0)
    ? monthsFromPayment(amountKes, bps, monthlyNum)
    : null;

  // Values used for display and submission
  const effectiveMonthly = control === "months" ? (derivedMonthly ?? 0) : monthlyNum;
  const effectiveMonths  = control === "monthly" ? (derivedMonths ?? 0) : monthsNum;
  const totalRepayable   = effectiveMonthly > 0 && effectiveMonths > 0
    ? effectiveMonthly * effectiveMonths
    : 0;

  // Validation states
  const exceedsAdvanceCap = advanceCap != null && amountKes > advanceCap;
  const exceedsMonthlyCap = monthlyCap != null && effectiveMonthly > monthlyCap && effectiveMonthly > 0;
  const paymentTooSmall   = control === "monthly" && monthlyNum > 0 && amountKes > 0 && derivedMonths == null;

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleAmountChange(v: string) {
    set("amount", v);
    // If monthly control is active, months will auto-derive; monthly stays as-is.
    // If months control is active, derived monthly updates automatically via render.
  }

  function handleMonthsChange(v: string) {
    setControl("months");
    set("months", v);
  }

  function handleMonthlyChange(v: string) {
    setControl("monthly");
    set("monthlyPayment", v);
    // Also keep months in sync as a fallback
    const principal = parseFloat(form.amount) || 0;
    const pmt = parseFloat(v) || 0;
    const derived = monthsFromPayment(principal, bps, pmt);
    if (derived) set("months", String(derived));
  }

  const mutation = useMutation({
    mutationFn: () =>
      customFetch("/api/portal/loan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount: form.amount,
          months: effectiveMonths > 0 ? effectiveMonths : parseInt(form.months),
          interestRateBps: isSacco ? (parseInt(form.interestRateBps) || 0) : 0,
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
      setControl("months");
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
    const finalMonths = control === "monthly" ? (derivedMonths ?? 0) : parseInt(form.months);
    if (!finalMonths || finalMonths < 1) {
      toast({ variant: "destructive", title: "Enter a valid repayment term" });
      return;
    }
    if (exceedsAdvanceCap) {
      toast({
        variant: "destructive",
        title: "Amount exceeds legal cap",
        description: `Salary advances are capped at one month's gross salary (KES ${advanceCap!.toLocaleString("en-KE", { minimumFractionDigits: 2 })}).`,
      });
      return;
    }
    if (exceedsMonthlyCap) {
      toast({
        variant: "destructive",
        title: "Monthly payment exceeds legal limit",
        description: `Under the Kenya Employment Act, total loan deductions cannot exceed one-third of gross salary. Max monthly: KES ${monthlyCap!.toLocaleString("en-KE", { minimumFractionDigits: 2 })}.`,
      });
      return;
    }
    if (paymentTooSmall) {
      toast({
        variant: "destructive",
        title: "Monthly payment too low",
        description: "The desired monthly payment is too small to cover interest on this loan.",
      });
      return;
    }
    mutation.mutate();
  }

  const fmtKes = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setForm(DEFAULTS); setControl("months"); } onOpenChange(v); }}>
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
          {/* Loan type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground">LOAN TYPE</Label>
            <Select value={form.type} onValueChange={(v) => { set("type", v); setControl("months"); set("monthlyPayment", ""); }}>
              <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOAN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SACCO interest rate */}
          {isSacco && (
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                SACCO INTEREST RATE (BPS)
                <Lock className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-normal text-amber-500">locked once approved</span>
              </Label>
              <Input
                type="number" min={0} max={10000}
                value={form.interestRateBps}
                onChange={(e) => { set("interestRateBps", e.target.value); }}
                placeholder="e.g. 1200 = 12% p.a."
                className="bg-background/50"
              />
              <p className="text-xs text-muted-foreground font-mono">100 bps = 1% per annum (e.g. 1200 = 12% p.a.)</p>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-mono text-muted-foreground">AMOUNT (KES)</Label>
              {advanceCap != null && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  MAX: KES {fmtKes(advanceCap)}
                </span>
              )}
            </div>
            <Input
              type="number" min={0}
              max={advanceCap ?? undefined}
              value={form.amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className={`bg-background/50 ${exceedsAdvanceCap ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
          </div>

          {/* Legal cap warning for advances */}
          {isAdvance && advanceCap != null && (
            exceedsAdvanceCap ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Amount exceeds the legal cap. Under Kenya's Employment Act, salary advances cannot exceed one month's gross salary —{" "}
                  <strong>KES {fmtKes(advanceCap)}</strong>.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-muted/50 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-chart-2" />
                <span>
                  Legal cap (Kenya Employment Act): max advance is one month's gross salary —{" "}
                  <strong className="text-foreground">KES {fmtKes(advanceCap)}</strong>.
                </span>
              </div>
            )
          )}

          {/* Repayment chooser: months OR monthly payment */}
          <div className="space-y-3">
            <p className="text-xs font-mono text-muted-foreground">REPAYMENT — enter either months or desired monthly amount</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Months */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground">
                  MONTHS
                  {control === "monthly" && derivedMonths != null && (
                    <span className="ml-1 text-[9px] text-primary font-mono">(auto)</span>
                  )}
                </Label>
                <Input
                  type="number" min={1} max={60}
                  value={control === "monthly" && derivedMonths != null ? String(derivedMonths) : form.months}
                  onChange={(e) => handleMonthsChange(e.target.value)}
                  placeholder="12"
                  className={`bg-background/50 ${control === "monthly" && derivedMonths != null ? "text-primary" : ""}`}
                />
              </div>

              {/* Monthly payment */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground">
                  MONTHLY PAYMENT (KES)
                  {control === "months" && derivedMonthly != null && (
                    <span className="ml-1 text-[9px] text-primary font-mono">(auto)</span>
                  )}
                </Label>
                <Input
                  type="number" min={0}
                  value={control === "months"
                    ? (derivedMonthly != null ? derivedMonthly.toFixed(2) : "")
                    : form.monthlyPayment}
                  onChange={(e) => handleMonthlyChange(e.target.value)}
                  placeholder="0.00"
                  className={`bg-background/50 ${exceedsMonthlyCap ? "border-destructive focus-visible:ring-destructive" : control === "months" && derivedMonthly != null ? "text-primary" : ""}`}
                />
              </div>
            </div>

            {/* Payment too small warning */}
            {paymentTooSmall && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Monthly payment is too low to cover the interest on this loan. Increase the amount or payment.</span>
              </div>
            )}

            {/* 1/3 salary cap warning */}
            {exceedsMonthlyCap && monthlyCap != null && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Monthly payment exceeds 1/3 of your gross salary. The Kenya Employment Act limits loan deductions to protect your take-home pay —{" "}
                  <strong>max KES {fmtKes(monthlyCap)}/month</strong>.
                </span>
              </div>
            )}

            {monthlyCap != null && !exceedsMonthlyCap && effectiveMonthly > 0 && (
              <p className="text-[10px] text-muted-foreground font-mono">
                Legal max per month: KES {fmtKes(monthlyCap)} (1/3 of gross salary)
              </p>
            )}
          </div>

          {/* Summary box */}
          {totalRepayable > 0 && !exceedsAdvanceCap && !exceedsMonthlyCap && !paymentTooSmall && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between font-mono text-sm">
                <span className="text-muted-foreground text-xs">MONTHLY DEDUCTION</span>
                <span className="text-primary font-bold">KES {fmtKes(effectiveMonthly)}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-sm border-t border-primary/10 pt-2">
                <span className="text-muted-foreground text-xs">
                  TOTAL REPAYABLE
                  {!isSacco && <span className="ml-1 text-[9px]">(0% est — rate set by HR)</span>}
                </span>
                <span className="font-bold">KES {fmtKes(totalRepayable)}</span>
              </div>
              {isSacco && totalRepayable > amountKes && (
                <div className="flex items-center justify-between font-mono text-xs text-muted-foreground border-t border-primary/10 pt-2">
                  <span>INTEREST PAID</span>
                  <span>KES {fmtKes(totalRepayable - amountKes)}</span>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
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
