import { useMemo, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fullName } from "@/lib/utils";
import { Calendar, Loader2, Send } from "lucide-react";
import { STATUS_META, daysInPeriod, dateOf, weekday, onLeave, type DayStatus } from "@/lib/attendance-ui";

const json = { "Content-Type": "application/json" };

export function AttendanceAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const [cell, setCell] = useState<{ emp: any; date: string } | null>(null);
  const [status, setStatus] = useState("present");
  const [hours, setHours] = useState("8");
  const [overtime, setOvertime] = useState("0");

  const key = ["attendance", period];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => customFetch<any>(`/api/attendance?period=${period}`),
  });
  const overtimeOn = data?.overtimeEnabled !== false;
  const days = useMemo(() => {
    const m = new Map<string, any>();
    (data?.days ?? []).forEach((d: any) => m.set(`${d.employeeId}|${d.date.slice(0, 10)}`, d));
    return m;
  }, [data]);
  const staff: any[] = (data?.staff ?? []).filter((e: any) => !search || fullName(e).toLowerCase().includes(search.toLowerCase()) || e.empNo.toLowerCase().includes(search.toLowerCase()));

  const fail = (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error ?? e?.message });
  const save = useMutation({
    mutationFn: (body: object) => customFetch("/api/attendance", { method: "PUT", headers: json, body: JSON.stringify(body) }),
    onSuccess: () => { setCell(null); qc.invalidateQueries({ queryKey: key }); },
    onError: fail,
  });
  const sync = useMutation({
    mutationFn: () => customFetch<{ updated: number }>("/api/attendance/sync", { method: "POST", headers: json, body: JSON.stringify({ period }) }),
    onSuccess: (r) => {
      toast({ title: "Timesheets updated", description: `${r.updated} timesheet(s) filled from attendance and set to pending.` });
      qc.invalidateQueries({ queryKey: ["timesheet-settings"] });
    },
    onError: fail,
  });

  function open(emp: any, date: string) {
    const d = days.get(`${emp.id}|${date}`);
    setStatus(d?.status ?? "present");
    setHours(String(d?.hours ?? 8));
    setOvertime(String(d?.overtimeHours ?? 0));
    setCell({ emp, date });
  }

  const total = daysInPeriod(period);
  const dayNums = Array.from({ length: total }, (_, i) => i + 1);
  const leave = data?.leave ?? [];

  return (
    <div className="space-y-6 max-w-full mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">ATTENDANCE</h1>
          <p className="text-muted-foreground text-sm">Day-by-day sheet for the whole team. Click a cell to record or correct a day.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-mono" />
          <Button className="font-mono" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            FILL TIMESHEETS
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {(Object.keys(STATUS_META) as DayStatus[]).map((k) => (
          <span key={k} className={`px-2 py-0.5 rounded border ${STATUS_META[k].cls}`}>{STATUS_META[k].letter} {STATUS_META[k].label}</span>
        ))}
      </div>

      <div className="border border-border/50 rounded-lg overflow-auto bg-card/30 max-h-[70vh]">
        <table className="text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr>
              <th className="sticky left-0 z-30 bg-muted text-left px-3 py-2 font-mono min-w-[180px]">EMPLOYEE</th>
              {dayNums.map((d) => (
                <th key={d} className={`px-1 py-1 font-mono min-w-[28px] ${weekday(period, d) === 0 ? "text-muted-foreground" : ""}`}>
                  <div>{d}</div>
                  <div className="text-[9px] font-normal">{"SMTWTFS"[weekday(period, d)]}</div>
                </th>
              ))}
              <th className="px-2 py-2 font-mono">DAYS</th>
              <th className="px-2 py-2 font-mono">HRS</th>
              {overtimeOn && <th className="px-2 py-2 font-mono">OT</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={total + 4} className="text-center py-8 text-muted-foreground font-mono">LOADING...</td></tr>
            ) : staff.map((e) => {
              let worked = 0, hrs = 0, ot = 0;
              return (
                <tr key={e.id} className="border-t border-border/30">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                    <div className="font-medium">{fullName(e)}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{e.empNo}{e.departmentName ? ` · ${e.departmentName}` : ""}</div>
                  </td>
                  {dayNums.map((d) => {
                    const date = dateOf(period, d);
                    const rec = days.get(`${e.id}|${date}`);
                    const isLeave = onLeave(leave, e.id, date);
                    if (rec) { hrs += rec.hours; ot += rec.overtimeHours; if (rec.status === "present" || rec.status === "half") worked++; }
                    const st: DayStatus | null = rec?.status ?? (isLeave ? "leave" : null);
                    const meta = st ? STATUS_META[st] : null;
                    return (
                      <td key={d} className="p-0.5">
                        <button
                          onClick={() => open(e, date)}
                          title={meta ? `${meta.label}${rec ? ` · ${rec.hours}h` : ""}` : "Not recorded"}
                          className={`w-6 h-6 rounded border font-bold ${meta ? meta.cls : "border-border/30 text-transparent hover:border-primary/50"} ${weekday(period, d) === 0 && !meta ? "bg-muted/40" : ""}`}
                        >
                          {meta ? meta.letter : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 text-center font-mono">{worked}</td>
                  <td className="px-2 text-center font-mono">{hrs}</td>
                  {overtimeOn && <td className="px-2 text-center font-mono">{ot}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!cell} onOpenChange={(o) => !o && setCell(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cell ? `${fullName(cell.emp)} · ${cell.date}` : ""}</DialogTitle>
            <DialogDescription>Approved leave shows as L until you record something else for the day.</DialogDescription>
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
            <div className="flex gap-2">
              <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ employeeId: cell!.emp.id, date: cell!.date, status: "clear" })}>Clear day</Button>
              <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate({
                employeeId: cell!.emp.id, date: cell!.date, status, hours: Number(hours) || 0, overtimeHours: Number(overtime) || 0,
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
