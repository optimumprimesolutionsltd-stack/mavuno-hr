import { useState, useEffect } from "react";
import { useDecideLoanRequest, getListLoanRequestsQueryKey, getListLoansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Lock } from "lucide-react";
import { formatMoney, formatPercent, fullName } from "@/lib/utils";

interface LoanRequest {
  id: number;
  type: string;
  amount: number;
  months: number;
  interestRateBps: number;
  reason: string | null;
  status: string;
}

interface Employee { firstName: string; middleName?: string | null; lastName: string; empNo: string; }

interface Props {
  request: LoanRequest | null;
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ApproveLoanDialog({ request, employee, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const decide = useDecideLoanRequest();

  const [interestRateBps, setInterestRateBps] = useState("0");
  const [months, setMonths] = useState("12");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    if (!request) return;
    setMonths(String(request.months));
    setStartDate(new Date().toISOString().slice(0, 10));
    setReviewNote("");
    // For SACCO, interest rate is locked from request
    setInterestRateBps(request.type === "sacco" ? String(request.interestRateBps ?? 0) : "0");
  }, [request]);

  const isSacco = request?.type === "sacco";

  // Estimated installment
  const est = (() => {
    if (!request) return null;
    const P = request.amount / 100;
    const n = parseInt(months) || 1;
    const bps = parseInt(interestRateBps) || 0;
    if (P <= 0 || n <= 0) return null;
    const r = bps / 12 / 10_000;
    if (r === 0) return (P / n).toFixed(2);
    return (P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)).toFixed(2);
  })();

  function handleDecide(action: "approve" | "reject") {
    if (!request) return;
    const data: Record<string, unknown> = { action, reviewNote: reviewNote.trim() || undefined };
    if (action === "approve") {
      data.months = parseInt(months);
      data.startDate = startDate;
      if (!isSacco) data.interestRateBps = parseInt(interestRateBps) || 0;
    }
    decide.mutate({ id: request.id, data: data as any }, {
      onSuccess: () => {
        toast({ title: action === "approve" ? "Loan approved" : "Request rejected" });
        qc.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
        if (action === "approve") qc.invalidateQueries({ queryKey: getListLoansQueryKey() });
        onOpenChange(false);
      },
      onError: (e: any) => {
        const msg = e?.data?.error ?? e?.message ?? "Failed";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    });
  }

  if (!request || !employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono">REVIEW LOAN REQUEST</DialogTitle>
          <DialogDescription>
            {fullName(employee)} ({employee.empNo}) — {request.type.toUpperCase()} —{" "}
            <strong>{formatMoney(request.amount)}</strong> over {request.months} months
            {request.reason && <> — "{request.reason}"</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Interest rate */}
          {isSacco ? (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                SACCO INTEREST RATE <Lock className="h-3 w-3 text-amber-500" />
                <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-500">LOCKED BY EMPLOYEE</Badge>
              </Label>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border/50">
                <span className="font-mono text-sm font-bold">{formatPercent(request.interestRateBps)} p.a.</span>
                <span className="text-xs text-muted-foreground">({request.interestRateBps} bps — set by employee, cannot be changed)</span>
              </div>
            </div>
          ) : (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">INTEREST RATE (BPS)</Label>
              <Input
                type="number" min={0} max={10000}
                value={interestRateBps}
                onChange={e => setInterestRateBps(e.target.value)}
                placeholder="0 = interest-free"
                className="bg-background/50"
              />
              <p className="text-xs text-muted-foreground font-mono">
                100 bps = 1% p.a. — leave 0 for salary advances
                {request.type === "company" && " (Fringe Benefit Tax applies if below KRA prescribed rate)"}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">TERM (MONTHS)</Label>
            <Input type="number" min={1} max={60} value={months} onChange={e => setMonths(e.target.value)} className="bg-background/50" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">START DATE</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-background/50" />
          </div>

          {est && (
            <div className="col-span-2 p-3 rounded-lg bg-primary/5 border border-primary/20 font-mono text-sm flex justify-between">
              <span className="text-muted-foreground text-xs">EST. MONTHLY INSTALLMENT</span>
              <span className="text-primary font-bold">KES {Number(est).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">REVIEW NOTE (optional)</Label>
            <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2} className="bg-background/50 resize-none" maxLength={500} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono">CANCEL</Button>
          <Button
            variant="outline"
            className="font-mono text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => handleDecide("reject")}
            disabled={decide.isPending}
          >
            {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
            REJECT
          </Button>
          <Button
            className="font-mono bg-primary"
            onClick={() => handleDecide("approve")}
            disabled={decide.isPending}
          >
            {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            APPROVE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
