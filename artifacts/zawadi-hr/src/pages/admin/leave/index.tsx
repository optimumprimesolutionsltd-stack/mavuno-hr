import { useState } from "react";
import { useListLeaves, useDecideLeave, getListLeavesQueryKey, customFetch } from "@workspace/api-client-react";
import { formatDate, fullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Check, X, Search, RotateCcw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BADGE_COLORS = [
  "bg-emerald-500/20 text-emerald-400",
  "bg-blue-500/20 text-blue-400",
  "bg-purple-500/20 text-purple-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
];

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function WhosOffCalendar({ leaves }: { leaves: any[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const todayYMD = toYMD(today);

  // Approved leaves only
  const approved = leaves.filter((r) => r.leave.status === "approved");

  // Build a stable color map keyed by employeeId
  const employeeColorMap: Record<number, string> = {};
  let colorIdx = 0;
  for (const r of approved) {
    const eid = r.employee?.id ?? r.leave?.employeeId;
    if (eid != null && !(eid in employeeColorMap)) {
      employeeColorMap[eid] = BADGE_COLORS[colorIdx % BADGE_COLORS.length];
      colorIdx++;
    }
  }

  // Navigate months
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Calendar grid setup
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const totalDays = lastDay.getDate();

  // Monday=0 offset: getDay() returns 0=Sun..6=Sat, we want Mon=0
  const startDow = (firstDay.getDay() + 6) % 7; // shift so Mon=0

  // Build grid cells (leading empty + days + trailing empty)
  const cells: Array<{ day: number | null; inMonth: boolean; ymd: string | null }> = [];
  // Leading days from prev month
  const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: d, inMonth: false, ymd: `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }
  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, inMonth: true, ymd: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }
  // Trailing days
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= trailing; d++) {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, inMonth: false, ymd: `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  // For each cell, find approved leaves overlapping that day
  function getLeavesForDay(ymd: string) {
    return approved.filter((r) => {
      const start = r.leave.startDate?.slice(0, 10);
      const end = r.leave.endDate?.slice(0, 10);
      return start && end && start <= ymd && end >= ymd;
    });
  }

  // Check if any approved leave falls within the current month
  const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
  const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`;
  const hasAnyThisMonth = approved.some((r) => {
    const start = r.leave.startDate?.slice(0, 10);
    const end = r.leave.endDate?.slice(0, 10);
    return start && end && start <= monthEnd && end >= monthStart;
  });

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("default", { month: "long" });
  const DOW_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-mono font-semibold text-sm tracking-wide">
          {monthName.toUpperCase()} {viewYear}
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
        {DOW_HEADERS.map((h) => (
          <div key={h} className="text-center text-[10px] font-mono text-muted-foreground py-1 font-medium tracking-wider">
            {h}
          </div>
        ))}

        {/* Calendar cells */}
        {cells.map((cell, idx) => {
          if (!cell.ymd) return <div key={idx} />;
          const dayLeaves = getLeavesForDay(cell.ymd);
          const isToday = cell.ymd === todayYMD;
          const count = dayLeaves.length;

          return (
            <div
              key={idx}
              className={[
                "min-h-[80px] rounded-md border p-1.5 flex flex-col gap-0.5 transition-colors",
                cell.inMonth ? "bg-card/40 border-border/40" : "bg-transparent border-border/20 opacity-40",
                isToday ? "border-primary border-2" : "",
              ].join(" ")}
            >
              <span className={[
                "text-[11px] font-mono font-medium self-end leading-none",
                isToday ? "text-primary" : cell.inMonth ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}>
                {cell.day}
              </span>
              {dayLeaves.map((r, i) => {
                const eid = r.employee?.id ?? r.leave?.employeeId;
                const color = employeeColorMap[eid] ?? BADGE_COLORS[0];
                const name = fullName(r.employee ?? {});
                return (
                  <span
                    key={i}
                    title={name}
                    className={`text-[10px] font-medium px-1 py-0.5 rounded truncate block leading-tight ${color}`}
                  >
                    {name}
                  </span>
                );
              })}
              {count > 0 && (
                <span className="text-[9px] text-muted-foreground font-mono mt-auto leading-tight">
                  {count} off
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!hasAnyThisMonth && (
        <div className="text-center py-10 text-muted-foreground font-mono text-sm">
          No approved leave this month
        </div>
      )}
    </div>
  );
}

export function LeaveAdmin() {
  const { data: leaves, isLoading } = useListLeaves();
  const decideLeave = useDecideLeave();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleDecision = (id: number, action: 'approve' | 'reject') => {
    decideLeave.mutate(
      { data: { id, action } },
      {
        onSuccess: () => {
          toast({ title: "Decision recorded", description: `Leave request ${action}d successfully.` });
          queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to record decision." });
        }
      }
    );
  };

  const resetBalances = useMutation({
    mutationFn: () => customFetch("/api/leaves/reset-balances", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Balances reset", description: "All active employees' annual leave reset to 21 days." });
      queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      setResetDialogOpen(false);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Reset failed", description: e?.data?.error ?? e?.message });
      setResetDialogOpen(false);
    },
  });

  const filtered = leaves?.filter(r =>
    r.employee?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee?.lastName?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">LEAVE MANAGEMENT</h1>
          <p className="text-muted-foreground text-sm">Review and approve employee leave requests</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-1.5 text-amber-400 border-amber-500/40 hover:bg-amber-500/10"
          onClick={() => setResetDialogOpen(true)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          RESET FOR NEW YEAR
        </Button>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="font-mono">
          <TabsTrigger value="requests" className="font-mono text-xs tracking-wide">REQUESTS</TabsTrigger>
          <TabsTrigger value="whos-off" className="font-mono text-xs tracking-wide">WHO'S OFF</TabsTrigger>
        </TabsList>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="space-y-4 mt-4">
          <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee name..."
                className="pl-9 bg-background/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                  <TableHead className="font-mono text-xs">TYPE</TableHead>
                  <TableHead className="font-mono text-xs">DATES</TableHead>
                  <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
                  <TableHead className="font-mono text-xs text-right">BALANCE</TableHead>
                  <TableHead className="font-mono text-xs text-center">STATUS</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                      LOADING LEAVE REQUESTS...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                      NO LEAVE REQUESTS FOUND
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const remaining = (row as any).remainingBefore;
                    return (
                      <TableRow key={row.leave.id} className="group transition-colors hover:bg-muted/20">
                        <TableCell>
                          <div className="font-medium text-sm">{fullName(row.employee)}</div>
                          <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo}</div>
                        </TableCell>
                        <TableCell>
                          <span className="capitalize text-sm">{row.leave.type}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-mono">{formatDate(row.leave.startDate)}</div>
                          <div className="text-xs text-muted-foreground font-mono">to {formatDate(row.leave.endDate)}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Math.round((row.leave.days ?? 0) / 10)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.leave.type === "annual" && remaining != null ? (
                            <span className={`font-mono text-sm font-medium ${remaining <= 3 ? "text-destructive" : remaining <= 7 ? "text-amber-400" : "text-primary"}`}>
                              {remaining}d
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={row.leave.status === 'pending' ? 'outline' : row.leave.status === 'approved' ? 'default' : 'destructive'} className="font-mono text-[10px]">
                            {row.leave.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.leave.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => handleDecision(row.leave.id, 'reject')}
                                disabled={decideLeave.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0 text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                                onClick={() => handleDecision(row.leave.id, 'approve')}
                                disabled={decideLeave.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">DECIDED</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* WHO'S OFF TAB */}
        <TabsContent value="whos-off" className="mt-4">
          <div className="border border-border/50 rounded-lg bg-card/30 p-4">
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground font-mono text-sm">
                LOADING...
              </div>
            ) : (
              <WhosOffCalendar leaves={leaves ?? []} />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Reset for New Year confirmation */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-400" />
              RESET ANNUAL LEAVE BALANCES
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the annual leave entitlement to <strong>21 days</strong> for <strong>all active employees</strong>.
              Use this at the start of a new leave year. The action is logged in the audit trail and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono bg-amber-500 hover:bg-amber-600 text-black"
              onClick={() => resetBalances.mutate()}
              disabled={resetBalances.isPending}
            >
              {resetBalances.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              CONFIRM RESET
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
