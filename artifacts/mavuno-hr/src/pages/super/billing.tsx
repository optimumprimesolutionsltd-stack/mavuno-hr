import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Loader2, CheckCircle2, Clock, Plus, Send, RefreshCw,
  TrendingUp, AlertCircle, Search,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface OrgOption { id: number; name: string; plan: string; monthlyCharge: number; }
interface PaymentRow {
  payment: {
    id: number; orgId: number; receiptNo: string; amount: number;
    period: string; method: string; reference: string | null;
    description: string | null; status: string;
    verifiedAt: string | null; receiptSentAt: string | null; createdAt: string;
  };
  orgName: string; orgPlan: string; verifierEmail: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa", bank_transfer: "Bank Transfer",
  cash: "Cash", cheque: "Cheque", other: "Other",
};

const STATUS_STYLE: Record<string, string> = {
  pending:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  verified: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed:   "bg-red-500/15 text-red-400 border-red-500/30",
};

function useOrgs() {
  return useQuery<OrgOption[]>({
    queryKey: ["super-orgs-simple"],
    queryFn: () => customFetch("/api/super/orgs"),
    staleTime: 60_000,
    select: (data: any[]) => data.map((o) => ({
      id: o.id, name: o.name, plan: o.plan, monthlyCharge: o.monthlyCharge ?? 0,
    })),
  });
}
function useBilling() {
  return useQuery<PaymentRow[]>({
    queryKey: ["super-billing"],
    queryFn: () => customFetch("/api/billing"),
    staleTime: 15_000,
  });
}

function fmtKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

// ── Add Payment Dialog ─────────────────────────────────────────────────────
function AddPaymentDialog({ open, onClose, orgs }: {
  open: boolean; onClose: () => void; orgs: OrgOption[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.toLocaleString("en-KE", { month: "long" })} ${now.getFullYear()}`;
  });
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");

  const selectedOrg = orgs.find((o) => o.id === Number(orgId));

  // Auto-fill amount when org is selected
  function handleOrgChange(id: string) {
    setOrgId(id);
    const org = orgs.find((o) => o.id === Number(id));
    if (org && org.monthlyCharge > 0) setAmount(String(org.monthlyCharge / 100));
  }

  const mutation = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Payment recorded", description: "It will appear as Pending until verified." });
      qc.invalidateQueries({ queryKey: ["super-billing"] });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e?.message }),
  });

  function handleSave() {
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!orgId || isNaN(amountCents) || amountCents <= 0 || !period.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Company, amount, and period are required." });
      return;
    }
    mutation.mutate({ orgId: Number(orgId), amount: amountCents, period, method, reference: reference || undefined, description: description || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md border-border/50 bg-card/95">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> RECORD PAYMENT
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Log a payment received from a company. Verify it after confirming funds.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">COMPANY</Label>
            <Select value={orgId} onValueChange={handleOrgChange}>
              <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                    {o.monthlyCharge > 0 && <span className="ml-1 text-muted-foreground text-xs">({fmtKes(o.monthlyCharge)}/mo)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">AMOUNT (KES)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">KES</span>
                <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-10 font-mono" placeholder="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">BILLING PERIOD</Label>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. July 2026" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">PAYMENT METHOD</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">REFERENCE / CODE</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. QF3K9XP2" className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">NOTE (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any additional note…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="font-mono" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            RECORD PAYMENT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function SuperAdminBilling() {
  const { data: payments = [], isLoading } = useBilling();
  const { data: orgs = [] } = useOrgs();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);

  const filtered = payments.filter((r) => {
    const matchStatus = statusFilter === "all" || r.payment.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || r.orgName.toLowerCase().includes(q) || r.payment.receiptNo.toLowerCase().includes(q) || (r.payment.reference ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // Summary stats
  const totalVerified = payments.filter((r) => r.payment.status === "verified").reduce((s, r) => s + r.payment.amount, 0);
  const pendingCount = payments.filter((r) => r.payment.status === "pending").length;
  const thisMonth = (() => {
    const now = new Date();
    return payments
      .filter((r) => r.payment.status === "verified" && new Date(r.payment.verifiedAt!).getMonth() === now.getMonth() && new Date(r.payment.verifiedAt!).getFullYear() === now.getFullYear())
      .reduce((s, r) => s + r.payment.amount, 0);
  })();

  async function handleVerify(id: number) {
    setVerifyingId(id);
    try {
      await customFetch(`/api/billing/${id}/verify`, { method: "POST" });
      toast({ title: "Payment verified ✓", description: "Receipt has been emailed to the company admin." });
      qc.invalidateQueries({ queryKey: ["super-billing"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Verify failed", description: e?.message });
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleResend(id: number) {
    setResendingId(id);
    try {
      await customFetch(`/api/billing/${id}/resend`, { method: "POST" });
      toast({ title: "Receipt resent", description: "Receipt email has been re-sent." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Resend failed", description: e?.message });
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-mono">BILLING</h1>
            <p className="text-muted-foreground text-sm">Record and verify company payments</p>
          </div>
        </div>
        <Button className="font-mono gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> RECORD PAYMENT
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "TOTAL COLLECTED", value: fmtKes(totalVerified), icon: TrendingUp, color: "text-primary" },
          { label: "THIS MONTH", value: fmtKes(thisMonth), icon: CreditCard, color: "text-emerald-400" },
          { label: "PENDING VERIFICATION", value: String(pendingCount), icon: AlertCircle, color: pendingCount > 0 ? "text-amber-400" : "text-muted-foreground" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="h-4 w-4" />
              <span className="text-xs font-mono">{c.label}</span>
            </div>
            <p className={`text-2xl font-bold font-mono ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search company, receipt, reference…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="font-mono text-xs">RECEIPT NO.</TableHead>
              <TableHead className="font-mono text-xs">COMPANY</TableHead>
              <TableHead className="font-mono text-xs">PERIOD</TableHead>
              <TableHead className="font-mono text-xs text-right">AMOUNT</TableHead>
              <TableHead className="font-mono text-xs">METHOD</TableHead>
              <TableHead className="font-mono text-xs">REFERENCE</TableHead>
              <TableHead className="font-mono text-xs">STATUS</TableHead>
              <TableHead className="font-mono text-xs">VERIFIED</TableHead>
              <TableHead className="font-mono text-xs">RECEIPT SENT</TableHead>
              <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground font-mono text-sm">NO PAYMENTS YET</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.payment.id} className="hover:bg-muted/10">
                <TableCell className="font-mono text-xs text-primary">{r.payment.receiptNo}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{r.orgName}</div>
                  <div className="text-xs text-muted-foreground font-mono capitalize">{r.orgPlan}</div>
                </TableCell>
                <TableCell className="text-sm">{r.payment.period}</TableCell>
                <TableCell className="text-right font-mono font-bold text-sm">{fmtKes(r.payment.amount)}</TableCell>
                <TableCell className="text-sm">{METHOD_LABELS[r.payment.method] ?? r.payment.method}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.payment.reference ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${STATUS_STYLE[r.payment.status] ?? "bg-muted/20 text-muted-foreground border-border"}`}>
                    {r.payment.status.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {r.payment.verifiedAt ? (
                    <div>
                      <div>{fmtDate(r.payment.verifiedAt)}</div>
                      {r.verifierEmail && <div className="text-[10px] opacity-70">{r.verifierEmail}</div>}
                    </div>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {r.payment.receiptSentAt ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {fmtDate(r.payment.receiptSentAt)}
                    </span>
                  ) : r.payment.status === "verified" ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Not sent
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.payment.status === "pending" && (
                      <Button
                        size="sm" variant="outline"
                        className="font-mono text-xs h-7 px-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                        disabled={verifyingId === r.payment.id}
                        onClick={() => handleVerify(r.payment.id)}
                      >
                        {verifyingId === r.payment.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <><CheckCircle2 className="h-3 w-3 mr-1" />VERIFY &amp; SEND</>}
                      </Button>
                    )}
                    {r.payment.status === "verified" && (
                      <Button
                        size="sm" variant="ghost"
                        className="font-mono text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                        disabled={resendingId === r.payment.id}
                        onClick={() => handleResend(r.payment.id)}
                        title="Resend receipt email"
                      >
                        {resendingId === r.payment.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RefreshCw className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {addOpen && <AddPaymentDialog open={addOpen} onClose={() => setAddOpen(false)} orgs={orgs} />}
    </div>
  );
}
