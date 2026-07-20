import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2, Save, Loader2, ShieldCheck, Settings2, RefreshCw, CheckCircle2,
} from "lucide-react";

interface OrgSettings {
  org: {
    id: number;
    name: string;
    slug: string;
    countryCode: string;
    currencyCode: string;
    kraPin: string;
    nssfEmployerNo: string;
    shifEmployerNo: string;
    plan: string;
    status: string;
  };
  activeConfig: {
    name: string;
    effectiveFrom: string;
    payeBands: { upTo: number | null; bps: number }[];
    personalRelief: number;
    pensionDeductibleCap: number;
    socialSecurity: {
      code: string;
      lowerEarningsLimit: number;
      upperEarningsLimit: number;
      employeeBps: number;
      employerBps: number;
      tier2Provider?: "nssf" | "private";
      tier2ProviderName?: string;
    };
    health: { code: string; bps: number; minimum: number; maximum: number | null };
    levies: { code: string; employeeBps: number; employerBps: number }[];
  } | null;
  tier2Provider: "nssf" | "private";
  tier2ProviderName: string;
  hasOrgOverride: boolean;
}

function bpsToPercent(bps: number) {
  return `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;
}

export function AdminSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<OrgSettings>({
    queryKey: ["admin-settings"],
    queryFn: () => customFetch("/api/settings") as Promise<OrgSettings>,
    staleTime: 30_000,
  });

  // ── Org profile form state ──────────────────────────────────────────────────
  const [orgName, setOrgName]           = useState("");
  const [kraPin, setKraPin]             = useState("");
  const [nssfNo, setNssfNo]             = useState("");
  const [shifNo, setShifNo]             = useState("");

  useEffect(() => {
    if (data?.org) {
      setOrgName(data.org.name);
      setKraPin(data.org.kraPin ?? "");
      setNssfNo(data.org.nssfEmployerNo ?? "");
      setShifNo(data.org.shifEmployerNo ?? "");
    }
  }, [data?.org]);

  const patchOrg = useMutation({
    mutationFn: () =>
      customFetch("/api/settings/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName, kraPin: kraPin || null, nssfEmployerNo: nssfNo || null, shifEmployerNo: shifNo || null }),
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Organisation profile updated." });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e?.data?.error ?? e?.message });
    },
  });

  // ── Tier 2 state ────────────────────────────────────────────────────────────
  const [tier2Provider, setTier2Provider]   = useState<"nssf" | "private">("nssf");
  const [tier2Name, setTier2Name]           = useState("");

  useEffect(() => {
    if (data) {
      setTier2Provider(data.tier2Provider ?? "nssf");
      setTier2Name(data.tier2ProviderName ?? "");
    }
  }, [data]);

  const saveTier2 = useMutation({
    mutationFn: () =>
      customFetch("/api/settings/statutory-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier2Provider,
          tier2ProviderName: tier2Provider === "private" ? (tier2Name || "Private Pension Fund") : undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: `NSSF Tier II provider updated to ${tier2Provider === "private" ? `"${tier2Name || "Private Pension Fund"}"` : "standard NSSF"}.` });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e?.data?.error ?? e?.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive font-mono">
        Failed to load settings
      </div>
    );
  }

  const cfg = data.activeConfig;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">SETTINGS</h1>
          <p className="text-muted-foreground text-sm">Organisation profile &amp; statutory configuration</p>
        </div>
      </div>

      {/* ── Panel 1: Organisation Profile ── */}
      <Card className="border-border/50 shadow-sm bg-card/30">
        <CardHeader className="pb-4">
          <CardTitle className="font-mono flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            ORGANISATION PROFILE
          </CardTitle>
          <CardDescription>
            These values appear on payslips, statutory returns, and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground">ORGANISATION NAME</Label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Zawadi Demo Ltd"
                className="bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground">KRA PIN</Label>
              <Input
                value={kraPin}
                onChange={(e) => setKraPin(e.target.value.toUpperCase())}
                placeholder="e.g. P000000000A"
                className="bg-background/50 font-mono"
                maxLength={11}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground">NSSF EMPLOYER NUMBER</Label>
              <Input
                value={nssfNo}
                onChange={(e) => setNssfNo(e.target.value)}
                placeholder="e.g. 1234567"
                className="bg-background/50 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground">SHIF EMPLOYER NUMBER</Label>
              <Input
                value={shifNo}
                onChange={(e) => setShifNo(e.target.value)}
                placeholder="e.g. 9876543"
                className="bg-background/50 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground">COUNTRY</Label>
              <div className="h-9 px-3 flex items-center rounded-md border border-border/50 bg-muted/30 font-mono text-sm text-muted-foreground">
                {data.org.countryCode} — {data.org.currencyCode}
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              onClick={() => patchOrg.mutate()}
              disabled={patchOrg.isPending || !orgName.trim()}
              className="font-mono gap-1.5"
            >
              {patchOrg.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              SAVE PROFILE
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Panel 2: Statutory Configuration ── */}
      <Card className="border-border/50 shadow-sm bg-card/30">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-mono flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                STATUTORY CONFIGURATION
              </CardTitle>
              <CardDescription className="mt-1">
                Active tax pack and NSSF Tier II provider.
              </CardDescription>
            </div>
            {data.hasOrgOverride && (
              <Badge variant="outline" className="font-mono text-xs shrink-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
                ORG OVERRIDE ACTIVE
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {cfg ? (
            <>
              {/* Active pack info */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">ACTIVE PACK</span>
                  <Badge variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {cfg.name}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Effective from: {cfg.effectiveFrom}
                </div>

                <Separator className="opacity-30" />

                {/* PAYE bands */}
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-2">PAYE BANDS</p>
                  <div className="space-y-1">
                    {cfg.payeBands.map((band, i) => {
                      const prev = cfg.payeBands[i - 1];
                      const from = prev?.upTo != null ? formatMoney(prev.upTo + 1) : formatMoney(0);
                      const to = band.upTo != null ? formatMoney(band.upTo) : "Above";
                      return (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                          <span className="text-muted-foreground font-mono">
                            {band.upTo != null ? `${from} – ${to}` : `Above ${formatMoney(prev?.upTo ?? 0)}`}
                          </span>
                          <span className="font-mono font-semibold text-primary">{bpsToPercent(band.bps)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="opacity-30" />

                {/* Key rates */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  {[
                    ["Personal Relief", formatMoney(cfg.personalRelief) + "/mo"],
                    ["Pension Cap", formatMoney(cfg.pensionDeductibleCap) + "/mo"],
                    [cfg.health.code, `${bpsToPercent(cfg.health.bps)} (min ${formatMoney(cfg.health.minimum)})`],
                    ["NSSF Employee", bpsToPercent(cfg.socialSecurity.employeeBps)],
                    ["NSSF Employer", bpsToPercent(cfg.socialSecurity.employerBps)],
                    ["NSSF Upper Limit", formatMoney(cfg.socialSecurity.upperEarningsLimit)],
                    ...cfg.levies.filter(l => l.employeeBps > 0 || l.employerBps > 0).map(l => [
                      l.code,
                      `${bpsToPercent(l.employeeBps)} emp / ${bpsToPercent(l.employerBps)} er`,
                    ]),
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tier 2 provider toggle */}
              <div className="space-y-3">
                <p className="text-xs font-mono text-muted-foreground">NSSF TIER II PROVIDER</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(["nssf", "private"] as const).map((val) => (
                    <label
                      key={val}
                      onClick={() => setTier2Provider(val)}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        tier2Provider === val
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/50 hover:border-border bg-muted/10"
                      }`}
                    >
                      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        tier2Provider === val ? "border-primary" : "border-muted-foreground/40"
                      }`}>
                        {tier2Provider === val && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium font-mono">
                          {val === "nssf" ? "NSSF (Standard)" : "Private Fund"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {val === "nssf"
                            ? "Tier II contributions remitted directly to NSSF"
                            : "Tier II remitted to an approved private pension fund"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {tier2Provider === "private" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground">FUND NAME</Label>
                    <Input
                      value={tier2Name}
                      onChange={(e) => setTier2Name(e.target.value)}
                      placeholder="e.g. Jubilee Pension Fund"
                      className="bg-background/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      This name appears on the Pension Fund report used for remittance.
                    </p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={() => saveTier2.mutate()}
                    disabled={saveTier2.isPending || (tier2Provider === "private" && !tier2Name.trim())}
                    variant="outline"
                    className="font-mono gap-1.5"
                  >
                    {saveTier2.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RefreshCw className="h-4 w-4" />}
                    SAVE TIER II SETTING
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground font-mono text-sm">
              NO STATUTORY CONFIGURATION FOUND FOR THIS ORG
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
