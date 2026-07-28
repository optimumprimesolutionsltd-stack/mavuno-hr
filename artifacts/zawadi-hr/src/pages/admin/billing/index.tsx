import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Clock, Loader2, Receipt, TrendingUp } from "lucide-react";

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

export function AdminBilling() {
  const { data, isLoading } = useBillingMy();

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
            Receipts are emailed automatically to your account address when a payment is verified by zawadiHR support.
            Contact us if you have a payment query.
          </p>
        </>
      )}
    </div>
  );
}
