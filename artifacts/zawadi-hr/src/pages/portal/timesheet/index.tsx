import { useState } from "react";
import { useGetPortalProfile, customFetch, getGetPortalProfileQueryKey } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

function currentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthOptions(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}`);
  }
  return result;
}

export function PortalTimesheet() {
  const { data: profile } = useGetPortalProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const employee = (profile as any)?.employee;
  const isCasual = employee?.employmentType === "casual";

  const [period, setPeriod] = useState(currentPeriod());
  const [daysWorked, setDaysWorked] = useState("");
  const [normalHours, setNormalHours] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("");
  const [holidayHours, setHolidayHours] = useState("");

  // Fetch this employee's timesheet history
  const PORTAL_TIMESHEETS_KEY = ["portal", "timesheets"];
  const { data: timesheets, isLoading: tsLoading } = useQuery({
    queryKey: PORTAL_TIMESHEETS_KEY,
    queryFn: () => customFetch<any[]>("/api/portal/timesheets"),
    enabled: !!profile,
  });

  // Find existing timesheet for selected period
  const existing = (timesheets ?? []).find((t: any) => t.period === period);

  // Populate form when period changes and a record exists
  const populateForm = (ts: any) => {
    if (ts) {
      setDaysWorked(String(ts.daysWorked ?? ""));
      setNormalHours(String(ts.normalHours ?? ""));
      setOvertimeHours(String(ts.overtimeHours ?? ""));
      setHolidayHours(String(ts.holidayHours ?? ""));
    } else {
      setDaysWorked("");
      setNormalHours("");
      setOvertimeHours("");
      setHolidayHours("");
    }
  };

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    const ts = (timesheets ?? []).find((t: any) => t.period === p);
    populateForm(ts);
  };

  const submit = useMutation({
    mutationFn: (body: object) =>
      customFetch("/api/portal/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Timesheet submitted", description: "Your timesheet has been saved for HR review." });
      queryClient.invalidateQueries({ queryKey: PORTAL_TIMESHEETS_KEY });
    },
    onError: (err: any) => {
      const msg = err?.data?.error ?? err?.message ?? "Failed to submit timesheet.";
      toast({ variant: "destructive", title: "Error", description: msg });
    },
  });

  const handleSubmit = () => {
    const payload: Record<string, number | string> = {
      period,
      overtimeHours: Number(overtimeHours) || 0,
      holidayHours: Number(holidayHours) || 0,
    };
    if (isCasual) {
      payload.daysWorked = Number(daysWorked) || 0;
      payload.normalHours = Number(normalHours) || 0;
    }
    submit.mutate(payload);
  };

  const months = monthOptions();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">MY TIMESHEET</h1>
        <p className="text-muted-foreground text-sm">
          {isCasual
            ? "Record your days and hours worked each month"
            : "Record overtime and holiday hours worked"}
        </p>
      </div>

      {/* Entry form */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="p-6 space-y-5">
          {/* Period picker */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground tracking-widest">PERIOD</Label>
            <div className="flex flex-wrap gap-2">
              {months.map((m) => (
                <button
                  key={m}
                  onClick={() => handlePeriodChange(m)}
                  className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                    period === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Approved warning */}
          {existing?.approvedAt && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>This timesheet was approved on {formatDate(existing.approvedAt)}. Contact HR to make changes.</span>
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isCasual && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="daysWorked" className="font-mono text-xs text-muted-foreground tracking-widest">
                    DAYS WORKED
                  </Label>
                  <Input
                    id="daysWorked"
                    type="number"
                    min="0"
                    max="31"
                    placeholder="0"
                    value={daysWorked}
                    onChange={(e) => setDaysWorked(e.target.value)}
                    disabled={!!existing?.approvedAt}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="normalHours" className="font-mono text-xs text-muted-foreground tracking-widest">
                    NORMAL HOURS
                  </Label>
                  <Input
                    id="normalHours"
                    type="number"
                    min="0"
                    max="400"
                    placeholder="0"
                    value={normalHours}
                    onChange={(e) => setNormalHours(e.target.value)}
                    disabled={!!existing?.approvedAt}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="overtimeHours" className="font-mono text-xs text-muted-foreground tracking-widest">
                OVERTIME HOURS
              </Label>
              <Input
                id="overtimeHours"
                type="number"
                min="0"
                max="200"
                placeholder="0"
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
                disabled={!!existing?.approvedAt}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holidayHours" className="font-mono text-xs text-muted-foreground tracking-widest">
                HOLIDAY HOURS
              </Label>
              <Input
                id="holidayHours"
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={holidayHours}
                onChange={(e) => setHolidayHours(e.target.value)}
                disabled={!!existing?.approvedAt}
              />
            </div>
          </div>

          {!existing?.approvedAt && (
            <Button
              onClick={handleSubmit}
              disabled={submit.isPending}
              className="font-mono w-full sm:w-auto"
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              {existing ? "UPDATE TIMESHEET" : "SUBMIT TIMESHEET"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* History table */}
      <div>
        <h2 className="text-sm font-mono font-semibold tracking-widest text-muted-foreground mb-3">HISTORY</h2>
        <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-mono text-xs">PERIOD</TableHead>
                {isCasual && (
                  <>
                    <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
                    <TableHead className="font-mono text-xs text-right">NORMAL HRS</TableHead>
                  </>
                )}
                <TableHead className="font-mono text-xs text-right">OVERTIME HRS</TableHead>
                <TableHead className="font-mono text-xs text-right">HOLIDAY HRS</TableHead>
                <TableHead className="font-mono text-xs text-right">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tsLoading ? (
                <TableRow>
                  <TableCell colSpan={isCasual ? 6 : 4} className="text-center py-8 text-muted-foreground font-mono text-sm">
                    LOADING...
                  </TableCell>
                </TableRow>
              ) : !timesheets || timesheets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isCasual ? 6 : 4} className="text-center py-8 text-muted-foreground font-mono text-sm">
                    NO TIMESHEETS YET
                  </TableCell>
                </TableRow>
              ) : (
                (timesheets as any[]).map((ts) => (
                  <TableRow key={ts.id} className="hover:bg-muted/20">
                    <TableCell className="font-mono text-sm font-medium">{ts.period}</TableCell>
                    {isCasual && (
                      <>
                        <TableCell className="text-right font-mono text-sm">{ts.daysWorked ?? 0}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{ts.normalHours ?? 0}h</TableCell>
                      </>
                    )}
                    <TableCell className="text-right font-mono text-sm">{ts.overtimeHours ?? 0}h</TableCell>
                    <TableCell className="text-right font-mono text-sm">{ts.holidayHours ?? 0}h</TableCell>
                    <TableCell className="text-right">
                      {ts.approvedAt ? (
                        <Badge className="font-mono text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          APPROVED
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          <AlertCircle className="h-3 w-3 mr-1 text-amber-400" />
                          PENDING
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
