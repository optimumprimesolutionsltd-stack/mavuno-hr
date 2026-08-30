import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil } from "lucide-react";
import { formatMoney } from "@/lib/utils";

interface LoanRequest {
  id: number;
  type: string;
  amount: number;
  months: number;
  interestRateBps: number;
  reason: string | null;
  status: string;
}

interface Props {
  request: LoanRequest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditLoanRequestDialog({ request, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    type: "company",
    amount: "",
    months: "12",
    interestRateBps: "0",
    reason: "",
  });

  useEffect(() => {
    if (!request) return;
    setForm({
      type: request.type,
      amount: String((request.amount / 100).toFixed(2)),
      months: String(request.months),
      interestRateBps: String(request.interestRateBps ?? 0),
      reason: request.reason ?? "",
    });
  }, [request]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch(`/api/loans/requests/${request!.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Request updated", description: "Loan request has been edited." });
      qc.invalidateQueries({ queryKey: ["getListLoanRequests"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error ?? e?.message ?? "Update failed";
      toast({ variant: "destructive", title: "Error", description: msg });
    },
  });

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSave() {
    if (!request) return;
    const body: Record<string, unknown> = {
      type: form.type,
      amount: form.amount,
      months: Number(form.months),
      reason: form.reason.trim() || undefined,
    };
    if (form.type === "sacco") {
      body.interestRateBps = Number(form.interestRateBps) || 0;
    }
    mutation.mutate(body);
  }

  // Estimated installment (0% for non-sacco from employee perspective)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Pencil className="h-4 w-4" /> EDIT LOAN REQUEST
          </DialogTitle>
          <DialogDescription>
            Edit this pending request before making a decision. Original: {request ? formatMoney(request.amount) : "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">LOAN TYPE</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
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
                SACCO INTEREST RATE (BPS)
                <span className="text-[10px] font-normal text-amber-500 ml-2">— locked once approved</span>
              </Label>
              <Input type="number" value={form.interestRateBps} onChange={e => set("interestRateBps", e.target.value)} placeholder="1200" className="bg-background/50" />
              <p className="text-xs text-muted-foreground font-mono">100 bps = 1% p.a.</p>
            </div>
          )}

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">REASON / NOTE</Label>
            <Textarea value={form.reason} onChange={e => set("reason", e.target.value)} rows={2} className="bg-background/50 resize-none" maxLength={500} />
          </div>

          {est && (
            <div className="col-span-2 p-3 rounded-lg bg-primary/5 border border-primary/20 font-mono text-sm flex justify-between">
              <span className="text-muted-foreground text-xs">EST. MONTHLY INSTALLMENT</span>
              <span className="text-primary font-bold">KES {Number(est).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono">CANCEL</Button>
          <Button onClick={handleSave} disabled={mutation.isPending} className="font-mono">
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />SAVING...</> : <>SAVE CHANGES</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
