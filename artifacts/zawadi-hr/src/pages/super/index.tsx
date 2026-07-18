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
  Ban, CheckCircle2, Settings,
} from "lucide-react";

interface OrgRow {
  id: number;
  name: string;
  slug: string;
  plan: string;
  status: string;
  seatLimit: number;
  countryCode: string;
  currencyCode: string;
  trialEndsAt: string | null;
  createdAt: string;
  activeEmployees: number;
  payrollRuns: number;
  lastPayrollRun: string | null;
  admins: { email: string; name: string }[];
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  trial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  starter: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  growth: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  enterprise: "bg-primary/15 text-primary border-primary/30",
};

function useOrgs() {
  return useQuery<OrgRow[]>({
    queryKey: ["super-orgs"],
    queryFn: () => customFetch("/api/super/orgs"),
    staleTime: 30_000,
  });
}

function EditOrgDialog({
  org,
  open,
  onClose,
}: {
  org: OrgRow;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [plan, setPlan] = useState(org.plan);
  const [seatLimit, setSeatLimit] = useState(String(org.seatLimit));
  const [trialEndsAt, setTrialEndsAt] = useState(
    org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : ""
  );

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
    const body: any = { plan, seatLimit: parseInt(seatLimit) };
    if (trialEndsAt) body.trialEndsAt = new Date(trialEndsAt).toISOString();
    else body.trialEndsAt = null;
    mutation.mutate(body);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">EDIT — {org.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">PLAN</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLAN_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs">SEAT LIMIT</Label>
            <Input
              type="number"
              min={1}
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs">TRIAL ENDS (leave blank to clear)</Label>
            <Input
              type="date"
              value={trialEndsAt}
              onChange={(e) => setTrialEndsAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="font-mono"
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            SAVE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
      const label = vars.action === "suspend" ? "Suspended" : "Activated";
      toast({ title: label, description: `Organization ${label.toLowerCase()}.` });
      qc.invalidateQueries({ queryKey: ["super-orgs"] });
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Action failed", description: e?.message }),
  });

  const totalEmployees = orgs.reduce((s, o) => s + o.activeEmployees, 0);
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const trialOrgs = orgs.filter((o) => o.plan === "trial").length;

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
          { label: "TOTAL COMPANIES", value: orgs.length, icon: Building2 },
          { label: "ACTIVE", value: activeOrgs, icon: CheckCircle2 },
          { label: "ON TRIAL", value: trialOrgs, icon: ShieldCheck },
          { label: "TOTAL EMPLOYEES", value: totalEmployees, icon: Users },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="h-4 w-4" />
              <span className="text-xs font-mono">{c.label}</span>
            </div>
            <p className="text-2xl font-bold font-mono text-primary">{c.value}</p>
          </div>
        ))}
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
              <TableHead className="font-mono text-xs text-right">PAYROLL RUNS</TableHead>
              <TableHead className="font-mono text-xs">ADMIN</TableHead>
              <TableHead className="font-mono text-xs">TRIAL ENDS</TableHead>
              <TableHead className="font-mono text-xs">JOINED</TableHead>
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
                <TableRow
                  key={org.id}
                  className={`hover:bg-muted/10 ${org.status === "suspended" ? "opacity-60" : ""}`}
                >
                  {/* Company */}
                  <TableCell>
                    <div className="font-medium text-sm">{org.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{org.slug}</div>
                  </TableCell>

                  {/* Plan */}
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${
                        PLAN_COLORS[org.plan] ?? "bg-muted/20 text-muted-foreground border-border"
                      }`}
                    >
                      {PLAN_LABELS[org.plan] ?? org.plan}
                    </span>
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
                    <span className="text-muted-foreground text-xs"> / {org.seatLimit}</span>
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
                    {org.trialEndsAt ? (
                      <span className={new Date(org.trialEndsAt) < new Date() ? "text-destructive" : "text-muted-foreground"}>
                        {new Date(org.trialEndsAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Joined */}
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {new Date(org.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        title="Edit plan & seats"
                        onClick={() => setEditOrg(org)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>

                      {org.status === "active" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Suspend"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: org.id, action: "suspend" })}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
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

      {/* Edit dialog */}
      {editOrg && (
        <EditOrgDialog
          org={editOrg}
          open={!!editOrg}
          onClose={() => setEditOrg(null)}
        />
      )}
    </div>
  );
}
