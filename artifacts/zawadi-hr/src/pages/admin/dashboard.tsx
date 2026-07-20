import { useGetDashboard, useGetFilings } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users, Wallet, Calendar, Coins, TrendingUp, TrendingDown, AlertTriangle,
  UserPlus, Star, ArrowUpRight, ArrowDownRight, Minus, FileBadge,
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function VarianceBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  if (Math.abs(pct) < 0.1) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground font-mono">
      <Minus className="h-3 w-3" /> No change
    </span>
  );
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-mono ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{pct.toFixed(1)}% vs last run
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cfg: Record<string, string> = {
    draft:            "border-muted-foreground/40 text-muted-foreground",
    pending_approval: "border-amber-500/60 text-amber-500",
    approved:         "border-blue-500/60 text-blue-400",
    paid:             "border-emerald-500/60 text-emerald-400",
  };
  return (
    <Badge variant="outline" className={`font-mono text-[10px] ${cfg[status] ?? "border-muted-foreground/40 text-muted-foreground"}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function formatPeriodLabel(period: string) {
  const [y, m] = period.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

export function AdminDashboard() {
  const { data, isLoading } = useGetDashboard();
  const { data: filingsData } = useGetFilings();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono">EXECUTIVE DASHBOARD</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Card key={i} className="animate-pulse h-[120px] bg-card/50" />)}
        </div>
      </div>
    );
  }

  const runs: { period: string; gross: number; net?: number }[] = (data as any).runs ?? [];
  const deptCosts: { name: string; gross: number }[]         = (data as any).deptCosts ?? [];
  const pendingLeaves: any[]                                  = (data as any).pendingLeaves ?? [];
  const auditLogItems: any[]                                  = (data as any).auditLogs ?? [];
  const recentHires: any[]                                    = (data as any).recentHires ?? [];
  const upcomingAnniversaries: any[]                          = (data as any).upcomingAnniversaries ?? [];

  const headcount: number          = (data as any).headcount ?? 0;
  const monthlyGross: number       = (data as any).monthlyGross ?? 0;
  const monthlyNet: number         = (data as any).monthlyNet ?? 0;
  const avgCostPerEmployee: number = (data as any).avgCostPerEmployee ?? 0;
  const pendingLeaveCount: number  = (data as any).pendingLeaveCount ?? 0;
  const loanBalance: number        = (data as any).loanBalance ?? 0;
  const activeLoanCount: number    = (data as any).activeLoanCount ?? 0;
  const grossVariancePct: number | null = (data as any).grossVariancePct ?? null;
  const grossVarianceAmount: number | null = (data as any).grossVarianceAmount ?? null;
  const latestRunStatus: string | null = (data as any).latestRunStatus ?? null;
  const latestRunName: string | null   = (data as any).latestRunName ?? null;

  const outstanding: string[] = (filingsData as any)?.outstanding ?? [];
  const currentPeriod: string = (filingsData as any)?.currentPeriod ?? "";
  const outstandingRunId: number | undefined = (filingsData as any)?.periods?.find(
    (r: any) => r.period === currentPeriod
  )?.runId;

  const pieData = deptCosts.map((d, i) => ({
    name: d.name, value: d.gross, color: `hsl(var(--chart-${(i % 5) + 1}))`,
  }));

  const chartData = runs.map((r) => ({ ...r, net: r.net ?? 0 }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold tracking-tight font-mono">EXECUTIVE DASHBOARD</h1>
        <div className="flex items-center gap-3">
          {latestRunName && <StatusBadge status={latestRunStatus} />}
          {latestRunName && (
            <span className="text-xs text-muted-foreground font-mono">{latestRunName}</span>
          )}
          <div className="flex items-center text-sm text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
            LIVE
          </div>
        </div>
      </div>

      {/* Outstanding filings banner */}
      {outstanding.length > 0 && currentPeriod && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-400 text-sm">
              Outstanding statutory filings for {formatPeriodLabel(currentPeriod)}
            </p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              {outstanding.join(", ")} {outstanding.length === 1 ? "return has" : "returns have"} not been downloaded yet.
            </p>
          </div>
          <Link href="/admin/filings">
            <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 text-xs h-7 shrink-0">
              <FileBadge className="h-3.5 w-3.5 mr-1.5" />
              View Filings
            </Button>
          </Link>
        </div>
      )}

      {/* KPI Cards — row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Headcount */}
        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Headcount</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{headcount}</div>
            <p className="text-xs text-muted-foreground mt-1">Active employees</p>
          </CardContent>
        </Card>

        {/* Monthly Gross */}
        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Gross</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-primary">{formatMoney(monthlyGross)}</div>
            <div className="mt-1">
              <VarianceBadge pct={grossVariancePct} />
            </div>
          </CardContent>
        </Card>

        {/* Net Payout */}
        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 blur-2xl" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Payout</CardTitle>
            {grossVarianceAmount != null && grossVarianceAmount > 0
              ? <TrendingUp className="h-4 w-4 text-emerald-400" />
              : grossVarianceAmount != null && grossVarianceAmount < 0
              ? <TrendingDown className="h-4 w-4 text-red-400" />
              : <TrendingUp className="h-4 w-4 text-emerald-400" />}
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-emerald-400">{formatMoney(monthlyNet)}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatMoney(avgCostPerEmployee)} avg cost/employee</p>
          </CardContent>
        </Card>

        {/* Active Loans */}
        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-chart-3/5 rounded-full -mr-10 -mt-10 blur-2xl" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Loans</CardTitle>
            <Coins className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{formatMoney(loanBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Across {activeLoanCount} employees</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Payroll Trend */}
        <Card className="col-span-1 lg:col-span-2 border-border/50 bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-primary" />
              Gross vs Net Payroll Trend
            </CardTitle>
            <CardDescription>Monthly totals (KES) — last 6 runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }} barGap={2}>
                    <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${(v / 100 / 1000).toFixed(0)}k`} width={48} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number, name: string) => [formatMoney(value), name === "gross" ? "Gross" : "Net Pay"]}
                    />
                    <Bar dataKey="gross" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="gross" />
                    <Bar dataKey="net" fill="hsl(142 71% 45% / 0.5)" radius={[3, 3, 0, 0]} name="net" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
                  <TrendingUp className="h-12 w-12 opacity-20" />
                  No payroll runs yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Department Costs */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle>Department Costs</CardTitle>
            <CardDescription>Gross pay by department</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] flex items-center justify-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatMoney(value)}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-muted-foreground text-sm flex flex-col items-center">
                  <PieChart className="h-12 w-12 opacity-20 mb-2" />
                  No department data
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="mt-2 space-y-1">
              {pieData.slice(0, 4).map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-mono text-muted-foreground">{formatMoney(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row — 4 panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">

        {/* Pending Leaves */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-sm text-chart-2">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Pending Leaves
              {pendingLeaveCount > 0 && (
                <span className="ml-auto bg-chart-2/20 text-chart-2 text-[10px] font-mono px-2 py-0.5 rounded-full">
                  {pendingLeaveCount}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingLeaves.length > 0 ? (
              <div className="space-y-2">
                {pendingLeaves.slice(0, 5).map((item) => (
                  <div key={item.leave.id} className="flex items-center justify-between p-2 rounded-lg border border-border/50 bg-background/50">
                    <div>
                      <p className="font-medium text-xs">{item.employee.firstName} {item.employee.lastName}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{item.leave.type} • {item.leave.days} days</p>
                    </div>
                    <div className="px-1.5 py-0.5 bg-chart-2/10 text-chart-2 text-[10px] font-mono rounded">PENDING</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs">No pending requests</div>
            )}
          </CardContent>
        </Card>

        {/* Recent Hires */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-sm">
              <UserPlus className="h-4 w-4 mr-2 text-primary" />
              Recent Hires
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">last 60 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentHires.length > 0 ? (
              <div className="space-y-2">
                {recentHires.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background/50">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-primary">{h.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-xs truncate">{h.name}</p>
                      <p className="text-[10px] text-muted-foreground">{h.position || "—"} • {h.hireDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs">No recent hires</div>
            )}
          </CardContent>
        </Card>

        {/* Work Anniversaries */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-sm">
              <Star className="h-4 w-4 mr-2 text-amber-400" />
              Anniversaries
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">next 30 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingAnniversaries.length > 0 ? (
              <div className="space-y-2">
                {upcomingAnniversaries.map((a, i) => {
                  const days = daysUntil(a.date);
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-amber-400">{a.years}y</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-xs truncate">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">{a.years} year{a.years !== 1 ? "s" : ""} • in {days} day{days !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs">No anniversaries in next 30 days</div>
            )}
          </CardContent>
        </Card>

        {/* Audit / Security Log */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm">SECURITY LOG</CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogItems.length > 0 ? (
              <div className="space-y-0.5">
                {auditLogItems.slice(0, 7).map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0 text-xs">
                    <div className="text-muted-foreground font-mono text-[10px] w-12 shrink-0 mt-0.5">
                      {new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-primary mr-1 uppercase text-[10px] font-mono">{log.action}</span>
                      <span className="text-muted-foreground text-[10px] truncate block">{log.detail || "System action"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs">No audit events yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
