import { useEffect, useState } from "react";
import { customFetch, useListEmployees, getListLoansQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fullName } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/**
 * Fix the employee or date of an issued loan / salary advance entered in
 * error. Amount, term and balance are untouched. Once it has been deducted in
 * payroll the server refuses to move it to another person.
 */
export function CorrectLoanDialog({
  loan, deducted, onClose,
}: {
  loan: { id: number; employeeId: number; startDate: string } | null;
  deducted: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const { data: employees } = useListEmployees(undefined, { query: { enabled: !!loan } as any });

  useEffect(() => {
    if (loan) { setEmployeeId(String(loan.employeeId)); setStartDate(loan.startDate.slice(0, 10)); }
  }, [loan]);

  const save = useMutation({
    mutationFn: () => customFetch(`/api/loans/${loan!.id}/correct`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: Number(employeeId), startDate }),
    }),
    onSuccess: () => {
      toast({ title: "Corrected", description: "Open any draft payroll run and click Recalculate to apply it." });
      qc.invalidateQueries({ queryKey: getListLoansQueryKey() });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Could not correct", description: e?.data?.error ?? e?.message }),
  });

  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct loan / advance</DialogTitle>
          <DialogDescription>
            Fix the employee or date if it was entered wrongly. The amount, term and balance stay the same.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId} disabled={deducted}>
            <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
            <SelectContent>
              {(employees ?? []).map((r) => (
                <SelectItem key={r.employee.id} value={String(r.employee.id)}>
                  {fullName(r.employee)} ({r.employee.empNo})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {deducted && (
            <p className="text-xs text-muted-foreground">
              Already deducted in payroll, so it stays with this employee. The date can still be corrected.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Date issued</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">Payroll deducts it from the month of this date onward.</p>
        </div>
        <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded p-2">
          Paid payroll runs are not changed. Open any draft run and click Recalculate to apply the correction.
        </p>
        <Button disabled={save.isPending || !employeeId || !startDate} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save correction
        </Button>
      </DialogContent>
    </Dialog>
  );
}
