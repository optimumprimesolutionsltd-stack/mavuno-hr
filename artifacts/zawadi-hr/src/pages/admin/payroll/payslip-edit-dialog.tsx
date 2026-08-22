import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getGetPayrollRunQueryKey, getListPayrollRunsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, fullName } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Info } from "lucide-react";

interface Payslip {
  id: number;
  gross: number;
  netPay: number;
  paye: number;
  nssfEmployee: number;
  shif: number;
  basic: number;
  allowances: number;
  overtime: number;
  adjustmentEarnings: number;
  adjustmentDeductions: number;
  daysInPeriod: number;
  daysPayable: number;
  breakdown?: {
    overrides?: {
      overtimeHours?: number;
      holidayHours?: number;
      adjustmentEarningsTaxable?: number;
      adjustmentEarningsNonTaxable?: number;
      adjustmentDeductions?: number;
      basicSalaryOverride?: number | null;
      daysPayableOverride?: number | null;
      note?: string;
    };
  };
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  empNo: string;
  basicSalary: number;
  employmentType: string;
}

interface Props {
  runId: number;
  slip: Payslip | null;
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function kes(cents: number) {
  return (cents / 100).toFixed(2);
}

function centsNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export function PayslipEditDialog({ runId, slip, employee, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const ov = slip?.breakdown?.overrides ?? {};
  const [form, setForm] = useState({
    overtimeHours: "0",
    holidayHours: "0",
    adjustmentEarningsTaxable: "0",
    adjustmentEarningsNonTaxable: "0",
    adjustmentDeductions: "0",
    basicSalaryOverride: "",       // blank = use employee base
    daysPayableOverride: "",       // blank = system-calculated
    note: "",
  });

  // Populate from existing overrides when dialog opens
  useEffect(() => {
    if (!slip || !open) return;
    setForm({
      overtimeHours: String(ov.overtimeHours ?? 0),
      holidayHours: String(ov.holidayHours ?? 0),
      adjustmentEarningsTaxable: kes(ov.adjustmentEarningsTaxable ?? 0),
      adjustmentEarningsNonTaxable: kes(ov.adjustmentEarningsNonTaxable ?? 0),
      adjustmentDeductions: kes(ov.adjustmentDeductions ?? 0),
      basicSalaryOverride: ov.basicSalaryOverride != null ? kes(ov.basicSalaryOverride) : "",
      daysPayableOverride: ov.daysPayableOverride != null ? String(ov.daysPayableOverride) : "",
      note: ov.note ?? "",
    });
  }, [slip?.id, open]);

  const mutation = useMutation({
    mutationFn: (body: object) =>
      customFetch(`/api/payroll/${runId}/payslips/${slip!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetPayrollRunQueryKey(runId) });
      qc.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
      toast({ title: "Payslip updated", description: "The payslip has been recalculated and run totals refreshed." });
      onOpenChange(false);
    },
    onError: (e: any) => {
      // ApiError puts the parsed response body at e.data (not e.response.data)
      const body = e?.data as any;
      const msg = body?.error ?? e?.message ?? "Update failed";
      const detail = body?.issues?.formErrors?.join(", ") ?? undefined;
      toast({ variant: "destructive", title: msg, description: detail });
    },
  });

  function handleSave() {
    const body: Record<string, any> = {
      overtimeHours: parseFloat(form.overtimeHours) || 0,
      holidayHours: parseFloat(form.holidayHours) || 0,
      adjustmentEarningsTaxable: centsNum(form.adjustmentEarningsTaxable),
      adjustmentEarningsNonTaxable: centsNum(form.adjustmentEarningsNonTaxable),
      adjustmentDeductions: centsNum(form.adjustmentDeductions),
      note: form.note.trim() || undefined,
    };
    // Only include overrides when explicitly set
    body.basicSalaryOverride = form.basicSalaryOverride.trim() !== ""
      ? centsNum(form.basicSalaryOverride)
      : null;
    body.daysPayableOverride = form.daysPayableOverride.trim() !== ""
      ? parseInt(form.daysPayableOverride, 10)
      : null;
    mutation.mutate(body);
  }

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleClose(v: boolean) {
    if (!v) setForm({ overtimeHours: "0", holidayHours: "0", adjustmentEarningsTaxable: "0", adjustmentEarningsNonTaxable: "0", adjustmentDeductions: "0", basicSalaryOverride: "", daysPayableOverride: "", note: "" });
    onOpenChange(v);
  }

  if (!slip || !employee) return null;

  const F = ({ label, k, type = "number", placeholder = "0", hint = "" }: { label: string; k: string; type?: string; placeholder?: string; hint?: string }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-mono text-muted-foreground">{label}</Label>
      <Input
        type={type}
        min={0}
        step={type === "number" ? "any" : undefined}
        value={(form as any)[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        className="bg-background/50"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono">
            EDIT PAYSLIP — {fullName(employee)}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {employee.empNo} · Changes apply to this run only
          </DialogDescription>
        </DialogHeader>

        {/* Current computed summary */}
        <div className="grid grid-cols-3 gap-2 bg-muted/30 rounded-lg p-3 text-center text-sm shrink-0">
          {[
            ["GROSS", slip.gross],
            ["PAYE", slip.paye],
            ["NET PAY", slip.netPay],
          ].map(([lbl, val]) => (
            <div key={String(lbl)}>
              <div className="text-[10px] font-mono text-muted-foreground">{lbl}</div>
              <div className={`font-mono font-semibold ${lbl === "NET PAY" ? "text-primary" : ""}`}>
                {formatMoney(Number(val))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Overtime */}
          <div>
            <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">Overtime</p>
            <div className="grid grid-cols-2 gap-4">
              <F label="OVERTIME HOURS (1.5×)" k="overtimeHours" placeholder="0" />
              <F label="HOLIDAY HOURS (2×)" k="holidayHours" placeholder="0" />
            </div>
          </div>

          <Separator />

          {/* One-time adjustments */}
          <div>
            <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">One-time Adjustments</p>
            <div className="space-y-3">
              <F label="TAXABLE BONUS / EARNING (KES)" k="adjustmentEarningsTaxable" placeholder="0.00"
                hint="Added to gross, subject to PAYE" />
              <F label="NON-TAXABLE EARNING (KES)" k="adjustmentEarningsNonTaxable" placeholder="0.00"
                hint="Added to cash gross, not taxed" />
              <F label="ONE-TIME DEDUCTION (KES)" k="adjustmentDeductions" placeholder="0.00"
                hint="e.g. advance recovery, disciplinary" />
            </div>
          </div>

          <Separator />

          {/* Advanced overrides */}
          <div>
            <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">Advanced Overrides</p>
            <div className="space-y-3">
              <F label="SALARY OVERRIDE FOR THIS RUN (KES)"
                k="basicSalaryOverride"
                placeholder={`${kes(employee.basicSalary)} (employee base)`}
                hint="Leave blank to use the employee's saved salary" />
              <F label="PAYABLE DAYS OVERRIDE"
                k="daysPayableOverride"
                placeholder={`${slip.daysPayable} (calculated)`}
                hint="Leave blank to use the system-calculated days" />
            </div>
          </div>

          <Separator />

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground">INTERNAL NOTE (OPTIONAL)</Label>
            <Textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="e.g. Salary advance recovery for June..."
              className="bg-background/50 resize-none"
              rows={2}
              maxLength={300}
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-3">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Saving will recalculate this employee's PAYE, NSSF, SHIF and net pay, then refresh the run totals. The run moves back to <strong>Draft</strong> if it was pending approval.</span>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t border-border/50">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button className="font-mono" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            SAVE & RECALCULATE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
