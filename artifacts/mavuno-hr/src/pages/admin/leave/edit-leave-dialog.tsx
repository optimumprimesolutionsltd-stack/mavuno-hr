import { useEffect, useState } from "react";
import { customFetch, useListEmployees } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fullName } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const LEAVE_TYPES = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
  { value: "compassionate", label: "Compassionate Leave" },
  { value: "study", label: "Study Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
];

type EditableLeave = {
  id: number; employeeId?: number; type: string; status?: string;
  startDate: string; endDate: string; reason?: string | null;
};

/**
 * Correct a leave entry: its type, dates, and (for HR) which employee it
 * belongs to, so a wrong entry doesn't need cancelling and re-entering.
 * `url` is the PATCH endpoint: /api/portal/leave/:id for the employee
 * (pending only), /api/leaves/:id/edit for HR (pending or approved). The
 * server recounts the days on the employee's own working week and re-checks
 * the annual balance.
 */
export function EditLeaveDialog({
  leave, url, onClose, onSaved, canChangeEmployee = false,
}: {
  leave: EditableLeave | null;
  url: string | null;
  onClose: () => void;
  onSaved: () => void;
  canChangeEmployee?: boolean;
}) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { data: employees } = useListEmployees(undefined, { query: { enabled: canChangeEmployee && !!leave } as any });

  useEffect(() => {
    if (leave) {
      setEmployeeId(leave.employeeId ? String(leave.employeeId) : "");
      setType(leave.type);
      setStartDate(leave.startDate.slice(0, 10));
      setEndDate(leave.endDate.slice(0, 10));
    }
  }, [leave]);

  const approved = leave?.status === "approved";
  const touchesUnpaid = !!leave && type !== leave.type && (type === "unpaid" || leave.type === "unpaid");
  const movedEmployee = canChangeEmployee && !!leave?.employeeId && employeeId !== String(leave.employeeId);

  const save = useMutation({
    mutationFn: () => customFetch(url!, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(canChangeEmployee && employeeId ? { employeeId: Number(employeeId) } : {}),
        type, startDate, endDate, reason: leave!.reason ?? undefined,
      }),
    }),
    onSuccess: () => { toast({ title: approved ? "Leave corrected" : "Leave request updated" }); onSaved(); onClose(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Could not update", description: e?.data?.error ?? e?.message }),
  });

  return (
    <Dialog open={!!leave} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approved ? "Correct approved leave" : "Edit leave request"}</DialogTitle>
          <DialogDescription>
            {approved
              ? "Fix a wrong employee, leave type or dates. The leave stays approved and balances update automatically."
              : "Change the details before the request is decided."}
          </DialogDescription>
        </DialogHeader>
        {canChangeEmployee && (
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((r) => (
                  <SelectItem key={r.employee.id} value={String(r.employee.id)}>
                    {fullName(r.employee)} ({r.employee.empNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Leave type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>End date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </div>
        {movedEmployee && (
          <p className="text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded p-2">
            The leave moves to the new employee and their days are recounted on their own working week. The
            original employee gets the days back.
          </p>
        )}
        {approved && (touchesUnpaid || (movedEmployee && type === "unpaid")) && (
          <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded p-2">
            Unpaid leave reduces pay. Payroll runs already paid are not changed; open any draft run for this month
            and click Recalculate to apply it.
          </p>
        )}
        <Button
          disabled={save.isPending || !type || !startDate || !endDate || endDate < startDate || (canChangeEmployee && !employeeId)}
          onClick={() => save.mutate()}
        >
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </DialogContent>
    </Dialog>
  );
}
