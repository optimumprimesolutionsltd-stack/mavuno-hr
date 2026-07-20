import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  employeeId: number;
  employeeName: string;
  empNo: string;
  hireDate?: string;
  basic?: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function TerminateDialog({ employeeId, employeeName, empNo, hireDate, basic, open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [terminationDate, setTerminationDate] = useState(today);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const gratuity = useMemo(() => {
    if (!hireDate || !terminationDate || !basic) return null;
    const hire = new Date(hireDate);
    const term = new Date(terminationDate);
    const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
    const years = (term.getTime() - hire.getTime()) / msPerYear;
    if (years < 1) return { years, eligible: false };
    // 15 days' basic pay per year: (basic / 30) * 15 * years
    const amount = (basic / 30) * 15 * years;
    return { years, eligible: true, amount: Math.round(amount * 100) / 100 };
  }, [hireDate, basic, terminationDate]);

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

          {/* Statutory Gratuity Estimate */}
          {hireDate && basic != null && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 space-y-1">
              <p className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wide">
                Statutory Gratuity Estimate
              </p>
              {!gratuity || !gratuity.eligible ? (
                <p className="text-sm text-muted-foreground">
                  Less than 1 year of service — no statutory gratuity.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-emerald-300">
                    Estimated Statutory Gratuity:{" "}
                    <span className="font-mono">
                      Ksh {(gratuity.amount! / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>{" "}
                    <span className="text-muted-foreground font-normal">
                      ({gratuity.years.toFixed(1)} years of service)
                    </span>
                  </p>
                </>
              )}
              <p className="text-[11px] text-muted-foreground leading-snug">
                This is an estimate under the Employment Act Cap 226 (15 days' basic pay per year of service).
                Actual entitlement may vary by contract.
              </p>
            </div>
          )}

          {/* Confirmation checkbox */}
          <div
            className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-destructive/30 bg-destructive/5"
            onClick={() => setConfirmed((v) => !v)}
          >
            <Checkbox
              id="terminate-confirm"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(!!v)}
              className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
            />
            <label htmlFor="terminate-confirm" className="text-sm text-muted-foreground leading-snug cursor-pointer">
              I confirm I want to terminate <span className="font-medium text-foreground">{employeeName}</span>.
              This action can only be reversed by contacting support.
            </label>
          </div>
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
