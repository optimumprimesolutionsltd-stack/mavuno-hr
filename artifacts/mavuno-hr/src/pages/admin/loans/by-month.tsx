import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { formatMoney, formatDate, fullName } from "@/lib/utils";

const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};

/**
 * Payroll-month view of loans and advances: which were posted in a month and
 * which are deducted in it. Payroll for a month can then be checked against a
 * single list instead of scrolling through every loan ever issued. An employee
 * with more than one deduction in the month is flagged, since that is how a
 * duplicate advance shows up only as a mysteriously low net pay.
 */
export function LoansByMonth({ loans }: { loans: any[] }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const rows = useMemo(() => {
    const target = monthIndex(period);
    const out = (loans ?? []).map((r: any) => {
      const l = r.loan;
      const start = monthIndex(l.startDate.slice(0, 7));
      const term = l.monthlyInstallment > 0 ? Math.max(1, Math.ceil(l.principal / l.monthlyInstallment)) : 1;
      const posted = start === target;
      const deducted = l.status !== "cancelled" && target >= start && target < start + term;
      return { ...r, posted, deducted, installmentNo: target - start + 1, term };
    }).filter((r: any) => r.posted || r.deducted);
    const perEmployee = new Map<number, number>();
    out.forEach((r: any) => perEmployee.set(r.employee.id, (perEmployee.get(r.employee.id) ?? 0) + 1));
    return out
      .map((r: any) => ({ ...r, multiple: (perEmployee.get(r.employee.id) ?? 0) > 1 }))
      .sort((a: any, b: any) => fullName(a.employee).localeCompare(fullName(b.employee)));
  }, [loans, period]);

  const total = rows.filter((r: any) => r.deducted).reduce((s: number, r: any) => s + r.loan.monthlyInstallment, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-[180px] font-mono" />
        <span className="text-sm text-muted-foreground">
          {rows.length} loan{rows.length === 1 ? "" : "s"} · deductions this month {formatMoney(total)}
        </span>
      </div>
      {rows.some((r: any) => r.multiple) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          Some employees have more than one loan or advance in this month (marked below). Check none was posted twice.
        </div>
      )}
      <div className="rounded-md border border-border/50 bg-card/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">This month's deduction</TableHead>
              <TableHead>Instalment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No loans or advances in this month.</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.loan.id}>
                <TableCell className="font-medium">
                  {fullName(r.employee)}
                  {r.multiple && <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/50 text-amber-700">MULTIPLE</Badge>}
                </TableCell>
                <TableCell className="capitalize">{r.loan.type}</TableCell>
                <TableCell className="text-sm">
                  {formatDate(r.loan.startDate)}
                  {r.posted && <Badge className="ml-2 text-[10px]">NEW THIS MONTH</Badge>}
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.loan.principal)}</TableCell>
                <TableCell className="text-right font-mono">{r.deducted ? formatMoney(r.loan.monthlyInstallment) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.deducted ? `${r.installmentNo} of ${r.term}` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
