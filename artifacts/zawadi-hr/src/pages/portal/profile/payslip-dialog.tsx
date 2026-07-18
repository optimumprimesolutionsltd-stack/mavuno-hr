import { formatMoney, formatDate } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Props {
  slip: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeName?: string;
}

function Row({ label, amount, bold, highlight, negative }: {
  label: string; amount: number; bold?: boolean; highlight?: boolean; negative?: boolean;
}) {
  if (amount === 0) return null;
  return (
    <div className={`flex justify-between items-center py-1.5 text-sm ${highlight ? "border-t border-border/50 mt-1 pt-2.5" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""} ${negative ? "text-destructive" : ""} ${highlight ? "text-primary text-base" : ""}`}>
        {formatMoney(amount)}
      </span>
    </div>
  );
}

export function PayslipDialog({ slip, open, onOpenChange, employeeName }: Props) {
  if (!slip) return null;

  const totalDeductions =
    (slip.paye || 0) +
    (slip.nssfEmployee || 0) +
    (slip.shif || 0) +
    (slip.housingLevyEmployee || 0) +
    (slip.helb || 0) +
    (slip.sacco || 0) +
    (slip.loanDeduction || 0) +
    (slip.pension || 0) +
    (slip.adjustmentDeductions || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">PAYSLIP — {slip.period || "—"}</DialogTitle>
          {employeeName && (
            <p className="text-sm text-muted-foreground">{employeeName}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Earnings */}
          <div>
            <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Earnings</p>
            <Row label="Basic Salary" amount={slip.basic || 0} />
            <Row label="House Allowance" amount={slip.houseAllowance || 0} />
            <Row label="Transport Allowance" amount={slip.transportAllowance || 0} />
            <Row label="Other Allowances" amount={slip.otherAllowance || 0} />
            <Row label="Non-Cash Benefit" amount={slip.nonCashBenefit || 0} />
            <Row label="Overtime / Holiday Pay" amount={(slip.overtime || 0)} />
            <Row label="Bonus / Adjustments" amount={slip.adjustmentEarnings || 0} />
            <div className="flex justify-between items-center py-1.5 mt-1 border-t border-border/50">
              <span className="font-semibold">Gross Pay</span>
              <span className="font-mono font-bold">{formatMoney(slip.grossPay || slip.gross || 0)}</span>
            </div>
          </div>

          <Separator />

          {/* Statutory Deductions */}
          <div>
            <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Statutory Deductions</p>
            <Row label="PAYE (Income Tax)" amount={slip.paye || 0} negative />
            <Row label="NSSF (Employee)" amount={slip.nssfEmployee || 0} negative />
            <Row label="SHIF / NHIF" amount={slip.shif || 0} negative />
            <Row label="Housing Levy (Employee)" amount={slip.housingLevyEmployee || 0} negative />
          </div>

          {/* Non-Statutory Deductions — only shown if any exist */}
          {((slip.helb || 0) + (slip.sacco || 0) + (slip.loanDeduction || 0) + (slip.pension || 0) + (slip.adjustmentDeductions || 0)) > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Other Deductions</p>
                <Row label="Pension (Employee)" amount={slip.pension || 0} negative />
                <Row label="HELB Repayment" amount={slip.helb || 0} negative />
                <Row label="SACCO" amount={slip.sacco || 0} negative />
                {(slip.loanDeduction || 0) > 0 && (
                  <div className="flex justify-between items-center py-1.5 text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      Loan Repayment
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">AUTO</Badge>
                    </span>
                    <span className="font-mono text-destructive">{formatMoney(slip.loanDeduction)}</span>
                  </div>
                )}
                <Row label="Other Deductions" amount={slip.adjustmentDeductions || 0} negative />
              </div>
            </>
          )}

          <Separator />

          {/* Totals */}
          <div>
            <div className="flex justify-between items-center py-1.5 text-sm">
              <span className="text-muted-foreground">Total Deductions</span>
              <span className="font-mono text-destructive font-medium">{formatMoney(totalDeductions)}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 mt-1 rounded-lg bg-primary/5 border border-primary/20 px-3">
              <span className="font-bold font-mono text-primary">NET PAY</span>
              <span className="font-mono font-bold text-xl text-primary">{formatMoney(slip.netPay || 0)}</span>
            </div>
          </div>

          {/* Employer contributions — informational */}
          {((slip.nssfEmployer || 0) + (slip.housingLevyEmployer || 0) + (slip.pensionEmployer || 0)) > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Employer Contributions (info only)</p>
                <Row label="NSSF (Employer)" amount={slip.nssfEmployer || 0} />
                <Row label="Housing Levy (Employer)" amount={slip.housingLevyEmployer || 0} />
                <Row label="Pension (Employer)" amount={slip.pensionEmployer || 0} />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
