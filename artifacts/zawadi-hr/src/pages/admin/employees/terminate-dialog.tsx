import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListEmployeesQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  employeeId: number;
  employeeName: string;
  empNo: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function TerminateDialog({ employeeId, employeeName, empNo, open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [terminationDate, setTerminationDate] = useState(today);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/employees/${employeeId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminationDate,
          terminationReason: reason.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Employee terminated",
        description: `${employeeName} has been marked as terminated effective ${terminationDate}.`,
      });
      qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      qc.invalidateQueries({ queryKey: ["getEmployee"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error ?? e?.message ?? "Termination failed";
      toast({ variant: "destructive", title: "Termination failed", description: msg });
    },
  });

  function handleClose(v: boolean) {
    if (!v) { setConfirmed(false); setReason(""); setTerminationDate(today); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            TERMINATE EMPLOYEE
          </DialogTitle>
          <DialogDescription>
            This will mark <span className="font-medium text-foreground">{employeeName}</span> ({empNo}) as terminated.
            They will no longer appear in payroll runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground">TERMINATION DATE</Label>
            <Input
              type="date"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground">
              REASON <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Resignation, end of contract, redundancy…"
              className="bg-background/50 resize-none"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-destructive"
            />
            <span className="text-sm text-muted-foreground leading-snug">
              I confirm I want to terminate <span className="font-medium text-foreground">{employeeName}</span>.
              This action can only be reversed by contacting support.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button
            variant="destructive"
            className="font-mono"
            disabled={!confirmed || !terminationDate || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            TERMINATE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
