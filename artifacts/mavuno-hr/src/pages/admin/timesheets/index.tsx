import { useState } from "react";
import { useListTimesheets, getListTimesheetsQueryKey, customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fullName } from "@/lib/utils";
import { Check, Calendar, X, Pencil, RotateCcw, Loader2 } from "lucide-react";

const json = { "Content-Type": "application/json" };

export function TimesheetAdmin() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const { data: timesheets, isLoading } = useListTimesheets({ period });
  const { data: settings } = useQuery({
    queryKey: ["timesheet-settings"],
    queryFn: () => customFetch<{ overtimeEnabled: boolean }>("/api/timesheets/settings"),
  });
  const overtimeOn = settings?.overtimeEnabled !== false;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editRow, setEditRow] = useState<any | null>(null);
  const [form, setForm] = useState({ daysWorked: "0", normalHours: "0", overtimeHours: "0", holidayHours: "0" });
  const [rejectRow, setRejectRow] = useState<any | null>(null);
  const [note, setNote] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
  const fail = (err: any) => toast({ variant: "destructive", title: "Error", description: err?.data?.error ?? err?.message ?? "Failed." });

  const approve = useMutation({
    mutationFn: (id: number) => customFetch(`/api/timesheets/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => { toast({ title: "Timesheet approved" }); refresh(); },
    onError: fail,
  });
  const reopen = useMutation({
    mutationFn: (id: number) => customFetch(`/api/timesheets/${id}/reopen`, { method: "PATCH" }),
    onSuccess: () => { toast({ title: "Timesheet reopened" }); refresh(); },
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => customFetch(`/api/timesheets/${rejectRow.id}/reject`, {
      method: "PATCH", headers: json, body: JSON.stringify({ note: note || undefined }),
    }),
    onSuccess: () => { toast({ title: "Timesheet rejected" }); setRejectRow(null); setNote(""); refresh(); },
    onError: fail,
  });
  const save = useMutation({
    mutationFn: () => customFetch(`/api/timesheets/${editRow.id}`, {
      method: "PATCH", headers: json,
      body: JSON.stringify({
        daysWorked: Number(form.daysWorked) || 0,
        normalHours: Number(form.normalHours) || 0,
        overtimeHours: Number(form.overtimeHours) || 0,
        holidayHours: Number(form.holidayHours) || 0,
      }),
    }),
    onSuccess: () => { toast({ title: "Timesheet updated", description: "It is pending approval again." }); setEditRow(null); refresh(); },
    onError: fail,
  });

  function openEdit(ts: any) {
    setForm({
      daysWorked: String(ts.daysWorked), normalHours: String(ts.normalHours),
      overtimeHours: String(ts.overtimeHours), holidayHours: String(ts.holidayHours),
    });
    setEditRow(ts);
  }

  const cols = overtimeOn ? 7 : 6;

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">TIMESHEETS</h1>
          <p className="text-muted-foreground text-sm">Review, correct, approve or send back employee hours</p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
              <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
              <TableHead className="font-mono text-xs text-right">NORMAL HRS</TableHead>
              {overtimeOn && <TableHead className="font-mono text-xs text-right">OVERTIME</TableHead>}
              <TableHead className="font-mono text-xs text-right">HOLIDAY</TableHead>
              <TableHead className="font-mono text-xs text-center">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={cols} className="text-center py-8 text-muted-foreground font-mono">LOADING TIMESHEETS...</TableCell>
              </TableRow>
            ) : !timesheets || timesheets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols} className="text-center py-8 text-muted-foreground font-mono">NO TIMESHEETS FOR {period}</TableCell>
              </TableRow>
            ) : (
              timesheets.map((row: any) => {
                const ts = row.timesheet;
                const approved = !!ts.approvedAt;
                const rejected = !approved && !!ts.rejectedAt;
                return (
                  <TableRow key={ts.id} className="group transition-colors hover:bg-muted/20">
                    <TableCell>
                      <div className="font-medium text-sm">{fullName(row.employee)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo} • {row.employee.employmentType.replace("_", " ")}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{ts.daysWorked}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{ts.normalHours}</TableCell>
                    {overtimeOn && <TableCell className="text-right font-mono text-sm text-chart-3">{ts.overtimeHours}</TableCell>}
                    <TableCell className="text-right font-mono text-sm text-chart-4">{ts.holidayHours}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={approved ? "default" : rejected ? "destructive" : "outline"} className="font-mono text-[10px]" title={rejected ? ts.rejectionNote ?? undefined : undefined}>
                        {approved ? "APPROVED" : rejected ? "REJECTED" : "PENDING"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs font-mono" onClick={() => openEdit(ts)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> EDIT
                        </Button>
                        {approved || rejected ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs font-mono" onClick={() => reopen.mutate(ts.id)} disabled={reopen.isPending}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> REOPEN
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="h-8 text-xs font-mono text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => { setNote(""); setRejectRow(ts); }}>
                              <X className="h-4 w-4 mr-1" /> REJECT
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs font-mono text-primary border-primary hover:bg-primary hover:text-primary-foreground" onClick={() => approve.mutate(ts.id)} disabled={approve.isPending}>
                              <Check className="h-4 w-4 mr-1" /> APPROVE
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit timesheet</DialogTitle>
            <DialogDescription>Saving puts the timesheet back to pending so the change is approved again.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {([
              ["daysWorked", "Days worked", true],
              ["normalHours", "Normal hours", true],
              ["overtimeHours", "Overtime hours", overtimeOn],
              ["holidayHours", "Holiday hours", true],
            ] as const).filter(([, , show]) => show).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input type="number" min="0" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectRow} onOpenChange={(o) => !o && setRejectRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject timesheet</DialogTitle>
            <DialogDescription>The employee sees your note and can correct and resubmit.</DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Reason (optional)" />
          <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>
            {reject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reject
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
