import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Search, Loader2, ShieldCheck, Users, Wallet,
  Ban, CheckCircle2, Settings, TrendingUp, CreditCard, Info,
} from "lucide-react";

// ── Plan configuration ──────────────────────────────────────────────────────
/** Monthly charge is stored in KES cents (e.g. 300000 = KES 3,000) */
const PLAN_DEFAULTS: Record<string, { seats: number; monthlyChargeKes: number }> = {
  trial:      { seats: 20,        monthlyChargeKes: 0      },
  starter:    { seats: 50,        monthlyChargeKes: 3_000  },
  growth:     { seats: 250,       monthlyChargeKes: 10_000 },
  enterprise: { seats: 1_000_000, monthlyChargeKes: 30_000 },
};

const PLAN_LABELS: Record<string, string> = {
  trial:      "Trial",
  starter:    "Starter",
  growth:     "Growth",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  trial:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  starter:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  growth:     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  enterprise: "bg-primary/15 text-primary border-primary/30",
};

// ── Types ──────────────────────────────────────────────────────────────────
interface OrgRow {
  id: number;
  name: string;
  slug: string;
  plan: string;
  status: string;
  seatLimit: number;
  monthlyCharge: number; // KES cents
  countryCode: string;
  currencyCode: string;
  trialEndsAt: string | null;
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

// ── Edit Dialog ──────────────────────────────────────────────────────────
function EditOrgDialog({ org, open, onClose }: { org: OrgRow; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [plan, setPlan] = useState(org.plan);
  const [seatLimit, setSeatLimit] = useState(String(org.seatLimit));
  // monthlyCharge stored in cents; display / edit in whole KES
  const [monthlyChargeKes, setMonthlyChargeKes] = useState(String(Math.round(org.monthlyCharge / 100)));
  const [trialEndsAt, setTrialEndsAt] = useState(org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : "");

  // When plan changes, auto-fill defaults (user can still override)
  function onPlanChange(p: string) {
    setPlan(p);
    const def = PLAN_DEFAULTS[p];
    if (def) {
      setSeatLimit(String(def.seats));
      setMonthlyChargeKes(String(def.monthlyChargeKes));
    }
  }

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
      // send in cents
      monthlyCharge: Math.round(parseFloat(monthlyChargeKes || "0") * 100),
    };
    if (trialEndsAt) body.trialEndsAt = new Date(trialEndsAt).toISOString();
    else body.trialEndsAt = null;
    mutation.mutate(body);
  }

  const def = PLAN_DEFAULTS[plan];
  const isEnterprise = plan === "enterprise";

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
            <Select value={plan} onValueChange={onPlanChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLAN_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    <span className="font-mono">{l}</span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      — {PLAN_DEFAULTS[v].seats >= 1_000_000 ? "Unlimited" : `${PLAN_DEFAULTS[v].seats} seats`}
                      {PLAN_DEFAULTS[v].monthlyChargeKes > 0
                        ? `, KES ${PLAN_DEFAULTS[v].monthlyChargeKes.toLocaleString()}/mo`
                        : ", Free"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Plan reference card */}
            <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Default for <strong className="text-foreground">{PLAN_LABELS[plan]}</strong>:{" "}
                {isEnterprise ? "Unlimited employees" : `${def?.seats ?? 0} employees`},{" "}
                {def && def.monthlyChargeKes > 0
                  ? `KES ${def.monthlyChargeKes.toLocaleString()}/month`
                  : "Free"}
                . You can override below.
              </span>
            </div>
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
              Payroll runs will be blocked once this limit is reached.
            </p>
          </div>

          {/* Monthly charge */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">MONTHLY CHARGE (KES)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">KES</span>
              <Input
                type="number"
                min={0}
                step={500}
                value={monthlyChargeKes}
                onChange={(e) => setMonthlyChargeKes(e.target.value)}
                className="pl-14 font-mono"
                placeholder="0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              For billing records only — does not trigger automatic charges.
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
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">COMPANIES</h1>
          <p className="text-muted-foreground text-sm">All organisations on Zawadi HR</p>
        </div>
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
              <TableHead className="font-mono text-xs">TRIAL ENDS</TableHead>
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
                          KES {(org.monthlyCharge / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">/month</div>
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

                  {/* Trial ends */}
                  <TableCell className="text-sm font-mono">
                    {org.plan === "trial" && org.trialEndsAt ? (
                      <span className={new Date(org.trialEndsAt) < new Date() ? "text-destructive" : "text-amber-400"}>
                        {new Date(org.trialEndsAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    ) : org.plan === "trial" ? (
                      <span className="text-amber-400/60 text-xs">No expiry set</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
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
    </div>
  );
}
