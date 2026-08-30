import { useState } from "react";
import {
  getListLeavesQueryKey,
  LeaveInputType,
  useCreateLeave,
  useListEmployees,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2 } from "lucide-react";
import { fullName } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEAVE_TYPES: Array<{ value: LeaveInputType; label: string }> = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
  { value: "compassionate", label: "Compassionate Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
];

const DEFAULTS = {
  employeeId: "",
  type: "annual" as LeaveInputType,
  startDate: "",
  endDate: "",
  reason: "",
};

function businessDays(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) return 0;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  let days = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) days += 1;
    current.setDate(current.getDate() + 1);
  }

  return days;
}

export function RequestLeaveForDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLeave = useCreateLeave();
  const { data: employees } = useListEmployees();
  const [form, setForm] = useState(DEFAULTS);

  const activeEmployees = employees?.filter((row) => row.employee.status === "active") ?? [];
  const requestedDays = businessDays(form.startDate, form.endDate);

  function set<K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function close() {
    onOpenChange(false);
    setForm(DEFAULTS);
  }

  function handleSubmit() {
    if (!form.employeeId) {
      toast({ variant: "destructive", title: "Select an employee", description: "Choose the employee who is requesting leave." });
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast({ variant: "destructive", title: "Select the leave dates", description: "Both a start date and an end date are required." });
      return;
    }
    if (form.endDate < form.startDate) {
      toast({ variant: "destructive", title: "Invalid dates", description: "The end date must be on or after the start date." });
      return;
    }
    if (requestedDays === 0) {
      toast({ variant: "destructive", title: "No working days selected", description: "Choose at least one weekday for the leave request." });
      return;
    }

    createLeave.mutate(
      {
        data: {
          employeeId: Number(form.employeeId),
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Leave request created",
            description: "The request is pending approval and has been added to the Leave Management tab.",
          });
          queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
          close();
        },
        onError: (error: any) => {
          const message = error?.data?.error ?? error?.message ?? "Failed to create leave request.";
          toast({ variant: "destructive", title: "Request failed", description: message });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <CalendarPlus className="h-4 w-4 text-primary" />
            REQUEST LEAVE FOR EMPLOYEE
          </DialogTitle>
          <DialogDescription>
            Create a leave request on an employee&apos;s behalf. It will remain pending until an authorised approver decides it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label className="font-mono text-xs text-muted-foreground">EMPLOYEE *</Label>
            <Select value={form.employeeId} onValueChange={(value) => set("employeeId", value)}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map((row) => (
                  <SelectItem key={row.employee.id} value={String(row.employee.id)}>
                    {fullName(row.employee)} ({row.employee.empNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeEmployees.length === 0 && (
              <p className="text-xs text-muted-foreground">No active employees are available.</p>
            )}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label className="font-mono text-xs text-muted-foreground">LEAVE TYPE *</Label>
            <Select value={form.type} onValueChange={(value) => set("type", value as LeaveInputType)}>
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((leaveType) => (
                  <SelectItem key={leaveType.value} value={leaveType.value}>
                    {leaveType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs text-muted-foreground">START DATE *</Label>
            <Input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs text-muted-foreground">END DATE *</Label>
            <Input type="date" value={form.endDate} onChange={(event) => set("endDate", event.target.value)} />
          </div>

          {requestedDays > 0 && (
            <div className="col-span-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 font-mono text-xs text-muted-foreground">
              REQUESTED WORKING DAYS: <span className="font-bold text-primary">{requestedDays}</span>
              <span className="ml-2">(weekends excluded)</span>
            </div>
          )}

          <div className="col-span-2 space-y-1.5">
            <Label className="font-mono text-xs text-muted-foreground">REASON / NOTE (OPTIONAL)</Label>
            <Textarea
              value={form.reason}
              onChange={(event) => set("reason", event.target.value)}
              placeholder="Add context for the approver..."
              rows={3}
              maxLength={500}
              className="resize-none bg-background/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} className="font-mono">
            CANCEL
          </Button>
          <Button onClick={handleSubmit} disabled={createLeave.isPending || activeEmployees.length === 0} className="font-mono">
            {createLeave.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            CREATE REQUEST
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}