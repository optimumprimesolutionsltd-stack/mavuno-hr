import { useGetDashboard } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wallet, Calendar, Coins, TrendingUp, AlertTriangle } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AdminDashboard() {
  const { data, isLoading } = useGetDashboard();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono">EXECUTIVE DASHBOARD</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse h-[120px] bg-card/50" />
          ))}
        </div>
      </div>
    );
  }

  const pieData = data.deptCosts.map((d, i) => ({
    name: d.name,
    value: d.gross,
    color: `hsl(var(--chart-${(i % 5) + 1}))`
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight font-mono">EXECUTIVE DASHBOARD</h1>
        <div className="text-sm text-muted-foreground flex items-center">
          <div className="h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></div>
          LIVE DATA
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Headcount</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{data.headcount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active employees
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Gross</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-primary">{formatMoney(data.monthlyGross)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatMoney(data.avgCostPerEmployee)} avg per employee
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-chart-2/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Leaves</CardTitle>
            <Calendar className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{data.pendingLeaveCount}</div>
            <p className="text-xs text-muted-foreground mt-1 text-chart-2/80">
              Requires attention
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-chart-3/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Loans</CardTitle>
            <Coins className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{formatMoney(data.loanBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {data.activeLoanCount} employees
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payroll Trend */}
        <Card className="col-span-1 lg:col-span-2 border-border/50 bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-primary" />
              Gross Payroll Trend
            </CardTitle>
            <CardDescription>Historical monthly totals (KES)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.runs.reverse()} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <XAxis dataKey="period" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/100/1000).toFixed(0)}k`} width={50} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [formatMoney(value), "Gross Pay"]}
                  />
                  <Bar dataKey="gross" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Dept Pie */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle>Department Costs</CardTitle>
            <CardDescription>Gross pay by department</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => formatMoney(value)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
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
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Actions */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center text-chart-2">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Pending Leaves
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.pendingLeaves.length > 0 ? (
              <div className="space-y-4">
                {data.pendingLeaves.slice(0, 5).map((item) => (
                  <div key={item.leave.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50">
                    <div>
                      <p className="font-medium text-sm">{item.employee.firstName} {item.employee.lastName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.leave.type} • {item.leave.days} days</p>
                    </div>
                    <div className="px-2 py-1 bg-chart-2/10 text-chart-2 text-xs font-mono rounded">PENDING</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">No pending leave requests</div>
            )}
          </CardContent>
        </Card>

        {/* Audit Log Snippet */}
        <Card className="border-border/50 bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="font-mono">SECURITY LOG</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0.5">
              {data.auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="flex items-start gap-4 py-2 border-b border-border/30 last:border-0 text-sm">
                  <div className="text-muted-foreground font-mono text-xs w-16 shrink-0 mt-0.5">
                    {new Date(log.createdAt).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'})}
                  </div>
                  <div>
                    <span className="font-medium text-primary mr-2 uppercase text-xs">{log.action}</span>
                    <span className="text-muted-foreground">{log.detail || 'System action'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
