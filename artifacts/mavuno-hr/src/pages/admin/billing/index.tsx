import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle2, Clock, Loader2, Receipt, Smartphone } from "lucide-react";

interface BillingPayment {
  id: number; orgId: number; receiptNo: string; amount: number;
  period: string; method: string; reference: string | null;
  description: string | null; status: string;
  verifiedAt: string | null; receiptSentAt: string | null; createdAt: string;
}
interface BillingData {
  org: { name: string; plan: string; monthlyCharge: number };
  payments: { payment: BillingPayment; verifierEmail: string | null }[];
}

const METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa", bank_transfer: "Bank Transfer",
  cash: "Cash", cheque: "Cheque", other: "Other",
};
const PLAN_LABELS: Record<string, string> = {
  trial: "Trial", starter: "Starter", growth: "Growth", enterprise: "Enterprise",
};
const PLAN_COLORS: Record<string, string> = {
  trial:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  starter:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  growth:     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  enterprise: "bg-primary/15 text-primary border-primary/30",
};

function fmtKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function useBillingMy() {
  return useQuery<BillingData>({
    queryKey: ["billing-my"],
    queryFn: () => customFetch("/api/billing/my"),
    staleTime: 30_000,
  });
}

function PayNowDialog({ open, onOpenChange, monthlyCharge }: {
  open: boolean; onOpenChange: (open: boolean) => void; monthlyCharge: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountKes, setAmountKes] = useState(monthlyCharge > 0 ? String(monthlyCharge / 100) : "");
  const [pollingPaymentId, setPollingPaymentId] = useState<number | null>(null);

  const initiate = useMutation({
    mutationFn: () =>
      customFetch("/api/billing/mpesa/initiate", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber,
          amount: Math.round(Number(amountKes) * 100),
          period: new Date().toLocaleDateString("en-KE", { month: "long", year: "numeric" }),
        }),
      }) as Promise<{ paymentId: number; message: string }>,
    onSuccess: (data) => {
      toast({ title: "Check your phone", description: data.message });
      setPollingPaymentId(data.paymentId);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Could not start payment", description: err?.data?.error ?? err?.message });
    },
  });

  // Poll for the callback result while a payment is in flight — STK Push is
  // asynchronous, so the dialog needs to find out once the customer has
  // entered their PIN (or cancelled/timed out) on their phone.
  useEffect(() => {
    if (!pollingPaymentId) return;
    const interval = setInterval(async () => {
      try {
        const result = await customFetch(`/api/billing/mpesa/${pollingPaymentId}/status`) as { status: string };
        if (result.status === "verified") {
          clearInterval(interval);
          toast({ title: "Payment received", description: "Your account has been activated." });
          queryClient.invalidateQueries({ queryKey: ["billing-my"] });
          setPollingPaymentId(null);
          onOpenChange(false);
        } else if (result.status === "failed") {
          clearInterval(interval);
          toast({ variant: "destructive", title: "Payment not completed", description: "The M-Pesa prompt was cancelled or timed out. You can try again." });
          setPollingPaymentId(null);
        }
      } catch { /* keep polling — a transient error here shouldn't stop the poll */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [pollingPaymentId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!initiate.isPending && !pollingPaymentId) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /> Pay with M-Pesa</DialogTitle>
          <DialogDescription>
            You'll receive an STK Push prompt on your phone. Enter your M-Pesa PIN there to complete payment.
          </DialogDescription>
        </DialogHeader>

        {pollingPaymentId ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Waiting for you to complete the payment on your phone…</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">M-PESA PHONE NUMBER</label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="07XXXXXXXX"
                disabled={initiate.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">AMOUNT (KES)</label>
              <Input
                type="number"
                min={1}
                value={amountKes}
                onChange={(e) => setAmountKes(e.target.value)}
                disabled={initiate.isPending}
              />
            </div>
          </div>
        )}

        {!pollingPaymentId && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={initiate.isPending}>Cancel</Button>
            <Button
              onClick={() => initiate.mutate()}
              disabled={initiate.isPending || !phoneNumber || !amountKes || Number(amountKes) <= 0}
            >
              {initiate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Payment Request"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminBilling() {
  const { data, isLoading } = useBillingMy();
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const totalPaid = (data?.payments ?? [])
    .filter((r) => r.payment.status === "verified")
    .reduce((s, r) => s + r.payment.amount, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">BILLING</h1>
          <p className="text-muted-foreground text-sm">Your subscription payments and receipts</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Plan card */}
          <div className="rounded-lg border border-border/50 bg-card/30 p-5 flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <p className="text-xs font-mono text-muted-foreground">CURRENT PLAN</p>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-mono font-bold border ${PLAN_COLORS[data?.org?.plan ?? "trial"] ?? "bg-muted/20 text-muted-foreground border-border"}`}>
                  {PLAN_LABELS[data?.org?.plan ?? "trial"] ?? data?.org?.plan}
                </span>
              </div>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-xs font-mono text-muted-foreground">MONTHLY CHARGE</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {(data?.org?.monthlyCharge ?? 0) > 0 ? fmtKes(data?.org?.monthlyCharge ?? 0) : <span className="text-yellow-400">FREE (Trial)</span>}
              </p>
              {(data?.org?.monthlyCharge ?? 0) > 0 && (
                <Button size="sm" className="mt-1 gap-2" onClick={() => setPayDialogOpen(true)}>
                  <Smartphone className="h-4 w-4" /> Pay Now
                </Button>
              )}
            </div>
            <div className="space-y-1 text-right">
              <p className="text-xs font-mono text-muted-foreground">TOTAL PAID</p>
              <p className="text-2xl font-bold font-mono text-emerald-400">{fmtKes(totalPaid)}</p>
            </div>
          </div>

          {/* Payments table */}
          <div>
            <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-3">PAYMENT HISTORY</h2>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="font-mono text-xs">RECEIPT</TableHead>
                    <TableHead className="font-mono text-xs">PERIOD</TableHead>
                    <TableHead className="font-mono text-xs text-right">AMOUNT</TableHead>
                    <TableHead className="font-mono text-xs">METHOD</TableHead>
                    <TableHead className="font-mono text-xs">REFERENCE</TableHead>
                    <TableHead className="font-mono text-xs">STATUS</TableHead>
                    <TableHead className="font-mono text-xs">VERIFIED ON</TableHead>
                    <TableHead className="font-mono text-xs">RECEIPT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.payments ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground font-mono text-sm">
                        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        NO PAYMENTS RECORDED YET
                      </TableCell>
                    </TableRow>
                  ) : (data?.payments ?? []).map(({ payment }) => (
                    <TableRow key={payment.id} className="hover:bg-muted/10">
                      <TableCell className="font-mono text-xs text-primary">{payment.receiptNo}</TableCell>
                      <TableCell className="text-sm">{payment.period}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-sm">{fmtKes(payment.amount)}</TableCell>
                      <TableCell className="text-sm">{METHOD_LABELS[payment.method] ?? payment.method}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{payment.reference ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={payment.status === "verified" ? "default" : payment.status === "failed" ? "destructive" : "secondary"}
                          className="font-mono text-xs"
                        >
                          {payment.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{fmtDate(payment.verifiedAt)}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {payment.receiptSentAt ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Emailed {fmtDate(payment.receiptSentAt)}
                          </span>
                        ) : payment.status === "verified" ? (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Not sent
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Info note */}
          <p className="text-xs text-muted-foreground font-mono text-center">
            Receipts are emailed automatically to your account address when a payment is verified by Mavuno HR support.
            Contact us if you have a payment query.
          </p>
        </>
      )}

      <PayNowDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        monthlyCharge={data?.org?.monthlyCharge ?? 0}
      />
    </div>
  );
}
