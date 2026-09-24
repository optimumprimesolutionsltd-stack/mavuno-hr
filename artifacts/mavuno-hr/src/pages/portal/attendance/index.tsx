import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import { STATUS_META, daysInPeriod, dateOf, weekday, onLeave, type DayStatus } from "@/lib/attendance-ui";

const json = { "Content-Type": "application/json" };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shift(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PortalAttendance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [editDate, setEditDate] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("present");
  const [hours, setHours] = useState("8");
  const [overtime, setOvertime] = useState("0");
  const [note, setNote] = useState("");

  const key = ["portal-attendance", period];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => customFetch<any>(`/api/portal/attendance?period=${period}`),
  });
  const days: any[] = data?.days ?? [];
  const leave: any[] = (data?.leave ?? []).map((l: any) => ({ ...l, employeeId: 0 }));
  const byDate = new Map(days.map((d) => [d.date.slice(0, 10), d]));
  const locked = !!data?.locked;
  const overtimeOn = data?.overtimeEnabled !== false;

  const fail = (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error ?? e?.message });

  const save = useMutation({
    mutationFn: (body: object) => customFetch("/api/portal/attendance", { method: "PUT", headers: json, body: JSON.stringify(body) }),
    onSuccess: () => { setEditDate(null); qc.invalidateQueries({ queryKey: key }); },
    onError: fail,
  });
  const submit = useMutation({
    mutationFn: () => customFetch("/api/portal/attendance/submit", { method: "POST", headers: json, body: JSON.stringify({ period }) }),
    onSuccess: () => {
      toast({ title: "Sent to HR", description: "Your month has been submitted as your timesheet." });
      qc.invalidateQueries({ queryKey: ["portal", "timesheets"] });
    },
    onError: fail,
  });

  function open(date: string) {
    const d = byDate.get(date);
    setStatus(d?.status ?? "present");
    setHours(String(d?.hours ?? 8));
    setOvertime(String(d?.overtimeHours ?? 0));
    setNote(d?.note ?? "");
    setEditDate(date);
  }

  const total = daysInPeriod(period);
  const lead = (weekday(period, 1) + 6) % 7; // Monday-first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const worked = days.filter((d) => d.status === "present" || d.status === "half").length;
  const hoursSum = days.reduce((s, d) => s + d.hours, 0);
  const otSum = days.reduce((s, d) => s + d.overtimeHours, 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">MY ATTENDANCE</h1>
        <p className="text-muted-foreground text-sm">Tap a day to record it, then send the month to HR as your timesheet.</p>
      </div>

      <Card className="border-border/50 bg-card/30">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => setPeriod(shift(period, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="font-mono font-semibold">{period}</div>
            <Button variant="outline" size="icon" onClick={() => setPeriod(shift(period, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          {locked && (
            <p className="text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3">
              This month's timesheet is approved, so the calendar is locked. Contact HR to make changes.
            </p>
          )}

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono text-muted-foreground">
            {WEEK.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {isLoading ? <div className="col-span-7 py-8 text-center text-muted-foreground font-mono">LOADING...</div> : cells.map((day, i) => {
              if (day === null) return <div key={`b${i}`} />;
              const date = dateOf(period, day);
              const rec = byDate.get(date);
              const isLeave = onLeave(leave, 0, date);
              const st: DayStatus | null = isLeave ? "leave" : (rec?.status ?? null);
              const meta = st ? STATUS_META[st] : null;
              return (
                <button
                  key={date}
                  disabled={locked || isLeave}
                  onClick={() => open(date)}
                  className={`aspect-square rounded-md border text-xs flex flex-col items-center justify-center transition-colors ${meta ? meta.cls : "border-border/40 hover:border-primary/50"} ${weekday(period, day) === 0 ? "opacity-60" : ""}`}
                >
                  <span className="font-mono">{day}</span>
                  {meta && <span className="font-bold">{meta.letter}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            {(Object.keys(STATUS_META) as DayStatus[]).map((k) => (
              <span key={k} className={`px-2 py-0.5 rounded border ${STATUS_META[k].cls}`}>{STATUS_META[k].letter} {STATUS_META[k].label}</span>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40">
            <div className="text-sm font-mono text-muted-foreground">
              {worked} day(s) worked · {hoursSum}h{overtimeOn ? ` · ${otSum}h overtime` : ""}
            </div>
            <Button className="font-mono" disabled={locked || submit.isPending || days.length === 0} onClick={() => submit.mutate()}>
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              SEND MONTH TO HR
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editDate} onOpenChange={(o) => !o && setEditDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDate}</DialogTitle>
            <DialogDescription>Record how this day went.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["present", "half", "absent", "off"] as DayStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(status === "present" || status === "half") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Hours</Label><Input type="number" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
                {overtimeOn && <div className="space-y-2"><Label>Overtime hours</Label><Input type="number" min="0" max="24" value={overtime} onChange={(e) => setOvertime(e.target.value)} /></div>}
              </div>
            )}
            <div className="space-y-2"><Label>Note (optional)</Label><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save.mutate({ date: editDate, status: "clear" })} disabled={save.isPending}>Clear day</Button>
              <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate({
                date: editDate, status, hours: Number(hours) || 0, overtimeHours: Number(overtime) || 0, note: note || null,
              })}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
