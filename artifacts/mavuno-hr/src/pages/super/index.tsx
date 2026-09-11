import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  PLAN_RATES, PLAN_LABELS, PLAN_COLORS, BILLING_CYCLES,
  standardMonthlyCents,
} from "@/lib/pricing";
import {
  Building2, Search, Loader2, ShieldCheck, Users, Wallet,
  Ban, CheckCircle2, Settings, TrendingUp, CreditCard, Info,
  Plus, Copy, Check, Mail, AlertTriangle,
} from "lucide-react";

// ── Plan configuration ──────────────────────────────────────────────────────
/** KES cents -> "KES 12,000" */
function kes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface OrgRow {
  id: number;
  name: string;
  slug: string;
  plan: string;
  status: string;
  seatLimit: number;
  billingCycle: string;               // "monthly" | "annual"
  monthlyCharge: number;              // KES cents — effective (override wins over rate card)
  standardMonthlyCharge: number;      // KES cents — rate card at current headcount
  overrideCharge: number;             // KES cents — negotiated override (0 = none)
  cycleCharge: number;                // KES cents — per-invoice (annual = 10x monthly)
  countryCode: string;
  currencyCode: string;
  billingRef: string;                 // account number the org quotes when paying
  trialEndsAt: string | null;
  accessUntil: string | null;         // hard cut-off enforced by requireActiveAccess(); null = unlimited
  accessState: "active" | "expiring_soon" | "expired" | "unlimited";
  createdAt: string;
  activeEmployees: number;
  payrollRuns: number;
  lastPayrollRun: string | null;
  admins: { email: string; name: string }[];
}

function useOrgs() {
  return useQuery<OrgRow[]>({
    queryKey: ["super-orgs"],
    queryFn: () => customFetch("/api/super/orgs"),
    staleTime: 30_000,
  });
}

// ── New Organisation Dialog ─────────────────────────────────────────────────
// docs/design/super-admin-org-lifecycle.md §3 (Phase 2) — provisioning for a
// customer who can't self-register.
interface ProvisionResult {
  org: { id: number; name: string; slug: string; plan: string };
  admin: { id: number; email: string };
  inviteEmailed: boolean;
  inviteUrl: string;
  warnings: string[];
}

const NEW_ORG_DEFAULTS = {
  name: "", slug: "", countryCode: "KE", currencyCode: "KES", kraPin: "",
  plan: "trial" as string, seatLimit: "", billingCycle: "monthly" as string,
  overrideKes: "", accessUntil: "",
  adminName: "", adminEmail: "", sendInvite: true,
};

function NewOrgDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(NEW_ORG_DEFAULTS);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof typeof NEW_ORG_DEFAULTS>(k: K) => (v: (typeof NEW_ORG_DEFAULTS)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const reset = () => { setForm(NEW_ORG_DEFAULTS); setResult(null); setCopied(false); };
  const close = () => { onClose(); reset(); };

  const mutation = useMutation({
    mutationFn: () => {
      const body: any = {
        name: form.name,
        countryCode: form.countryCode || "KE",
        currencyCode: form.currencyCode || "KES",
        plan: form.plan,
        billingCycle: form.billingCycle,
        admin: { email: form.adminEmail, name: form.adminName, sendInvite: form.sendInvite },
      };
      if (form.slug.trim()) body.slug = form.slug.trim();
      if (form.kraPin.trim()) body.kraPin = form.kraPin.trim();
      if (form.seatLimit.trim()) body.seatLimit = parseInt(form.seatLimit, 10);
      if (form.overrideKes.trim()) body.monthlyChargeOverrideCents = Math.round(parseFloat(form.overrideKes) * 100);
      if (form.accessUntil) body.accessUntil = new Date(form.accessUntil).toISOString();
      return customFetch<ProvisionResult>("/api/super/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["super-orgs"] });
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Could not create organisation", description: e?.data?.error ?? e?.message }),
  });

  function handleCreate() {
    if (!form.name.trim()) { toast({ variant: "destructive", title: "Company name is required" }); return; }
    if (!form.adminName.trim() || !form.adminEmail.trim()) {
      toast({ variant: "destructive", title: "Admin name and email are required" }); return;
    }
    mutation.mutate();
  }

  function copyInvite() {
    if (!result) return;
    navigator.clipboard.writeText(result.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-lg border-border/50 bg-card/95 max-h-[90vh] overflow-y-auto">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono">NEW ORGANISATION</DialogTitle>
              <DialogDescription>Provision an org for a customer who can't self-register.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">COMPANY NAME *</Label>
                <Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ujenzi Distributors Ltd" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">SLUG (blank = auto from name)</Label>
                <Input value={form.slug} onChange={(e) => set("slug")(e.target.value.toLowerCase())} placeholder="ujenzi-distributors-ltd" className="font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">COUNTRY</Label>
                  <Input value={form.countryCode} onChange={(e) => set("countryCode")(e.target.value.toUpperCase())} maxLength={2} className="font-mono uppercase" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">CURRENCY</Label>
                  <Input value={form.currencyCode} onChange={(e) => set("currencyCode")(e.target.value.toUpperCase())} maxLength={4} className="font-mono uppercase" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">KRA PIN (optional)</Label>
                <Input value={form.kraPin} onChange={(e) => set("kraPin")(e.target.value.toUpperCase())} placeholder="P051234567X" className="font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">PLAN</Label>
                <Select value={form.plan} onValueChange={set("plan")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_RATES).map(([v, r]) => (
                      <SelectItem key={v} value={v}>
                        <span className="font-mono">{r.label}</span>
                        <span className="ml-2 text-muted-foreground text-xs">— {r.bestFor}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">SEAT LIMIT (blank = plan default)</Label>
                  <Input type="number" min={1} value={form.seatLimit} onChange={(e) => set("seatLimit")(e.target.value)} placeholder={String(PLAN_RATES[form.plan as keyof typeof PLAN_RATES]?.softCapSeats ?? "unlimited")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">BILLING CYCLE</Label>
                  <Select value={form.billingCycle} onValueChange={set("billingCycle")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILLING_CYCLES.map((c) => <SelectItem key={c} value={c}><span className="font-mono capitalize">{c}</span></SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">NEGOTIATED OVERRIDE — KES/MONTH (blank = rate card)</Label>
                <Input type="number" min={0} step={500} value={form.overrideKes} onChange={(e) => set("overrideKes")(e.target.value)} placeholder="0" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">ACCESS UNTIL (blank = 14-day trial from today)</Label>
                <Input type="date" value={form.accessUntil} onChange={(e) => set("accessUntil")(e.target.value)} />
              </div>

              <div className="border-t border-border/30 pt-4 space-y-4">
                <p className="font-mono text-xs text-muted-foreground">ADMIN USER</p>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">NAME *</Label>
                  <Input value={form.adminName} onChange={(e) => set("adminName")(e.target.value)} placeholder="Jane Mwangi" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">EMAIL *</Label>
                  <Input type="email" value={form.adminEmail} onChange={(e) => set("adminEmail")(e.target.value)} placeholder="hr@ujenzi.co.ke" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="sendInvite" checked={form.sendInvite} onCheckedChange={(v) => set("sendInvite")(!!v)} />
                  <Label htmlFor="sendInvite" className="text-xs font-mono cursor-pointer">
                    Email a "set up your account" link now
                  </Label>
                </div>
                {!form.sendInvite && (
                  <p className="text-xs text-muted-foreground">
                    A one-time setup link will be shown after creation for you to pass on yourself.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button className="font-mono" onClick={handleCreate} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                CREATE ORGANISATION
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                {result.org.name.toUpperCase()} CREATED
              </DialogTitle>
              <DialogDescription>slug: {result.org.slug} · admin: {result.admin.email}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 flex items-center gap-2 text-xs">
                {result.inviteEmailed ? (
                  <><Mail className="h-3.5 w-3.5 text-emerald-500 shrink-0" /><span className="text-emerald-400">Invite emailed to {result.admin.email}</span></>
                ) : (
                  <><Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">No email sent — share the link below</span></>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">SET-UP LINK (also works as a fallback if the email failed)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={result.inviteUrl} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="sm" onClick={copyInvite} className="shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Expires in 7 days.</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Create another</Button>
              <Button className="font-mono" onClick={close}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ──────────────────────────────────────────────────────────
function EditOrgDialog({ org, open, onClose }: { org: OrgRow; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [plan, setPlan] = useState(org.plan);
  const [seatLimit, setSeatLimit] = useState(String(org.seatLimit));
  const [billingCycle, setBillingCycle] = useState(org.billingCycle || "monthly");
  // Negotiated override, stored in cents; edited here in whole KES. "" / 0 = use the rate card.
  const [overrideKes, setOverrideKes] = useState(
    org.overrideCharge > 0 ? String(Math.round(org.overrideCharge / 100)) : "",
  );
  const [trialEndsAt, setTrialEndsAt] = useState(org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : "");
  const [accessUntil, setAccessUntil] = useState(org.accessUntil ? org.accessUntil.slice(0, 10) : "");

  const mutation = useMutation({
    mutationFn: (body: object) =>
      customFetch(`/api/super/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Updated", description: `${org.name} has been updated.` });
      qc.invalidateQueries({ queryKey: ["super-orgs"] });
      onClose();
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Update failed", description: e?.message }),
  });

  function handleSave() {
    const body: any = {
      plan,
      seatLimit: parseInt(seatLimit) || 1,
      billingCycle,
      // 0 clears the override -> rate card applies
      monthlyCharge: Math.round(parseFloat(overrideKes || "0") * 100),
    };
    if (trialEndsAt) body.trialEndsAt = new Date(trialEndsAt).toISOString();
    else body.trialEndsAt = null;
    if (accessUntil) body.accessUntil = new Date(accessUntil).toISOString();
    else body.accessUntil = null;
    mutation.mutate(body);
  }

  function addGraceDays(days: number) {
    const base = accessUntil && new Date(accessUntil) > new Date() ? new Date(accessUntil) : new Date();
    base.setDate(base.getDate() + days);
    setAccessUntil(base.toISOString().slice(0, 10));
  }

  const rate = PLAN_RATES[plan as keyof typeof PLAN_RATES] ?? PLAN_RATES.trial;
  // Rate-card monthly at this org's current headcount, for the selected plan.
  const standardAtHeadcount = standardMonthlyCents(plan, org.activeEmployees);
  const overrideCents = Math.round(parseFloat(overrideKes || "0") * 100);
  const effectiveMonthly = overrideCents > 0 ? overrideCents : standardAtHeadcount;
  const perInvoice = billingCycle === "annual" ? effectiveMonthly * 10 : effectiveMonthly;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md border-border/50 bg-card/95">
        <DialogHeader>
          <DialogTitle className="font-mono">EDIT — {org.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Plan selector */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">PLAN</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLAN_RATES).map(([v, r]) => (
                  <SelectItem key={v} value={v}>
                    <span className="font-mono">{r.label}</span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      — {r.minCents > 0
                        ? `${kes(r.minCents)}/mo · covers ${r.includedSeats}`
                        : "Free"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Rate-card reference */}
            <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">{rate.label}</strong> — {rate.bestFor}.{" "}
                {rate.minCents > 0
                  ? <>
                      Flat {kes(rate.minCents)}/mo covers {rate.includedSeats}
                      {rate.overageCents > 0 && <>; then {kes(rate.overageCents)}/extra employee</>}. Rate card at{" "}
                      {org.activeEmployees} active {org.activeEmployees === 1 ? "employee" : "employees"}:{" "}
                      <strong className="text-foreground">{kes(standardAtHeadcount)}/mo</strong>.
                    </>
                  : "Free."}
              </span>
            </div>
          </div>

          {/* Billing cycle */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">BILLING CYCLE</Label>
            <Select value={billingCycle} onValueChange={setBillingCycle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_CYCLES.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="font-mono capitalize">{c}</span>
                    {c === "annual" && (
                      <span className="ml-2 text-muted-foreground text-xs">— pay 10 months, get 12</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seat limit */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">EMPLOYEE LIMIT</Label>
            <Input
              type="number"
              min={1}
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
              placeholder="e.g. 50"
            />
            <p className="text-xs text-muted-foreground">
              Payroll runs will be blocked once this limit is reached. Separate from the pricing rate card.
            </p>
          </div>

          {/* Negotiated override */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">NEGOTIATED OVERRIDE (KES / month)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">KES</span>
              <Input
                type="number"
                min={0}
                step={500}
                value={overrideKes}
                onChange={(e) => setOverrideKes(e.target.value)}
                className="pl-14 font-mono"
                placeholder="0 = use rate card"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank / 0 to use the rate card ({kes(standardAtHeadcount)}/mo at current headcount).
              Set a value only for a bespoke / Enterprise deal.
            </p>
          </div>

          {/* Effective charge preview */}
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="flex justify-between font-mono">
              <span className="text-muted-foreground">EFFECTIVE / MONTH</span>
              <span className="text-primary font-bold">{kes(effectiveMonthly)}</span>
            </div>
            <div className="flex justify-between font-mono mt-1">
              <span className="text-muted-foreground">PER INVOICE ({billingCycle})</span>
              <span className="font-bold">{kes(perInvoice)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {overrideCents > 0 ? "Using negotiated override." : "Using rate card."}
              {" "}For billing records — does not trigger automatic charges.
            </p>
          </div>

          {/* Trial ends */}
          {plan === "trial" && (
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">TRIAL ENDS (leave blank to clear)</Label>
              <Input
                type="date"
                value={trialEndsAt}
                onChange={(e) => setTrialEndsAt(e.target.value)}
              />
            </div>
          )}

          {/* Access window — the enforced cut-off */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">ACCESS UNTIL (blank = unlimited)</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={accessUntil}
                onChange={(e) => setAccessUntil(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" className="font-mono shrink-0" onClick={() => addGraceDays(7)}>
                +7D GRACE
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Past this date, payroll/employees/leave/timesheets/loans lock (billing &amp; login stay open).
              A verified payment pushes this forward automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="font-mono" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            SAVE CHANGES
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function SuperAdminCompanies() {
  const { data: orgs = [], isLoading } = useOrgs();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editOrg, setEditOrg] = useState<OrgRow | null>(null);
  const [newOrgOpen, setNewOrgOpen] = useState(false);

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase()) ||
      o.admins.some((a) => a.email.toLowerCase().includes(search.toLowerCase()))
  );

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "suspend" | "activate" }) =>
      customFetch(`/api/super/orgs/${id}/${action}`, { method: "POST" }),
    onSuccess: (_data, vars) => {
      toast({ title: vars.action === "suspend" ? "Suspended" : "Activated", description: `Organization updated.` });
      qc.invalidateQueries({ queryKey: ["super-orgs"] });
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Action failed", description: e?.message }),
  });

  const totalEmployees = orgs.reduce((s, o) => s + o.activeEmployees, 0);
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const trialOrgs = orgs.filter((o) => o.plan === "trial").length;
  // Monthly revenue = sum of monthlyCharge for active orgs (in cents)
  const monthlyRevenueCents = orgs
    .filter((o) => o.status === "active")
    .reduce((s, o) => s + (o.monthlyCharge ?? 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-mono">COMPANIES</h1>
            <p className="text-muted-foreground text-sm">All organisations on Mavuno HR</p>
          </div>
        </div>
        <Button className="font-mono" onClick={() => setNewOrgOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          NEW ORGANISATION
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "TOTAL COMPANIES",   value: orgs.length,    icon: Building2,   color: "text-primary" },
          { label: "ACTIVE",            value: activeOrgs,     icon: CheckCircle2, color: "text-emerald-400" },
          { label: "ON TRIAL",          value: trialOrgs,      icon: ShieldCheck,  color: "text-amber-400" },
          { label: "TOTAL EMPLOYEES",   value: totalEmployees, icon: Users,        color: "text-blue-400" },
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

      {/* Monthly revenue banner */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-mono text-muted-foreground">MONTHLY RECURRING REVENUE</p>
            <p className="text-2xl font-bold font-mono text-primary">
              KES {(monthlyRevenueCents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          {Object.entries(PLAN_LABELS).filter(([v]) => v !== "trial").map(([v, l]) => {
            const count = orgs.filter((o) => o.plan === v && o.status === "active").length;
            const rev = orgs.filter((o) => o.plan === v && o.status === "active")
              .reduce((s, o) => s + (o.monthlyCharge ?? 0), 0);
            return (
              <div key={v} className="text-center">
                <p className={`text-xs font-mono font-medium ${PLAN_COLORS[v]?.split(" ")[1] ?? "text-muted-foreground"}`}>{l.toUpperCase()}</p>
                <p className="font-mono font-bold">{count} <span className="text-muted-foreground text-xs">co.</span></p>
                <p className="text-xs text-muted-foreground font-mono">
                  KES {(rev / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, slug or admin email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="font-mono text-xs">COMPANY</TableHead>
              <TableHead className="font-mono text-xs">PLAN</TableHead>
              <TableHead className="font-mono text-xs">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right">EMPLOYEES</TableHead>
              <TableHead className="font-mono text-xs text-right">MONTHLY CHARGE</TableHead>
              <TableHead className="font-mono text-xs text-right">PAYROLL RUNS</TableHead>
              <TableHead className="font-mono text-xs">ADMIN</TableHead>
              <TableHead className="font-mono text-xs">ACCESS</TableHead>
              <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground font-mono text-sm">
                  {search ? "NO MATCHES" : "NO COMPANIES YET"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((org) => (
                <TableRow key={org.id} className={`hover:bg-muted/10 ${org.status === "suspended" ? "opacity-60" : ""}`}>
                  {/* Company */}
                  <TableCell>
                    <div className="font-medium text-sm">{org.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{org.slug}</div>
                  </TableCell>

                  {/* Plan */}
                  <TableCell>
                    <div className="space-y-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${PLAN_COLORS[org.plan] ?? "bg-muted/20 text-muted-foreground border-border"}`}>
                        {PLAN_LABELS[org.plan] ?? org.plan}
                      </span>
                      <div className="text-xs text-muted-foreground font-mono">
                        {org.seatLimit >= 1_000_000 ? "Unlimited seats" : `${org.seatLimit} seat limit`}
                      </div>
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      variant={org.status === "active" ? "default" : "destructive"}
                      className="font-mono text-xs"
                    >
                      {org.status.toUpperCase()}
                    </Badge>
                  </TableCell>

                  {/* Employees */}
                  <TableCell className="text-right font-mono text-sm">
                    <span className={org.activeEmployees >= org.seatLimit ? "text-destructive font-bold" : ""}>
                      {org.activeEmployees}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {" "}/ {org.seatLimit >= 1_000_000 ? "∞" : org.seatLimit}
                    </span>
                    {org.activeEmployees >= org.seatLimit && (
                      <div className="text-[10px] text-destructive font-mono">AT LIMIT</div>
                    )}
                  </TableCell>

                  {/* Monthly charge */}
                  <TableCell className="text-right">
                    {org.monthlyCharge > 0 ? (
                      <div>
                        <div className="font-mono text-sm font-medium text-primary">
                          {kes(org.monthlyCharge)}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          /month
                          {org.billingCycle === "annual" && (
                            <> · {kes(org.cycleCharge)}/yr</>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground/70">
                          {org.overrideCharge > 0 ? "override" : "rate card"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">
                        FREE
                      </span>
                    )}
                  </TableCell>

                  {/* Payroll runs */}
                  <TableCell className="text-right font-mono text-sm">
                    <div className="flex items-center justify-end gap-1">
                      <Wallet className="h-3 w-3 text-muted-foreground" />
                      {org.payrollRuns}
                    </div>
                    {org.lastPayrollRun && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(org.lastPayrollRun).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                      </div>
                    )}
                  </TableCell>

                  {/* Admin */}
                  <TableCell>
                    {org.admins[0] ? (
                      <div>
                        <div className="text-sm">{org.admins[0].name}</div>
                        <div className="text-xs text-muted-foreground">{org.admins[0].email}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Access window */}
                  <TableCell className="text-sm font-mono">
                    {org.accessUntil ? (
                      <>
                        <span className={
                          org.accessState === "expired" ? "text-destructive font-bold"
                          : org.accessState === "expiring_soon" ? "text-amber-400"
                          : ""
                        }>
                          {new Date(org.accessUntil).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {org.accessState === "expired" && (
                          <div className="text-[10px] font-mono text-destructive">EXPIRED — LOCKED</div>
                        )}
                        {org.accessState === "expiring_soon" && (
                          <div className="text-[10px] font-mono text-amber-400/80">EXPIRING SOON</div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">Unlimited</span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0"
                        title="Edit plan & seats"
                        onClick={() => setEditOrg(org)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      {org.status === "active" ? (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Suspend"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: org.id, action: "suspend" })}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-primary hover:text-primary"
                          title="Activate"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: org.id, action: "activate" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editOrg && (
        <EditOrgDialog org={editOrg} open={!!editOrg} onClose={() => setEditOrg(null)} />
      )}
      <NewOrgDialog open={newOrgOpen} onClose={() => setNewOrgOpen(false)} />
    </div>
  );
}
