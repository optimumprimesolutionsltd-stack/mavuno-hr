import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatPeriod } from "@/lib/utils";

type LoanScheduleLoan = {
  principal: number;
  balance: number;
  monthlyInstallment: number;
  interestRateBps: number;
  startDate: string;
};

type LoanRepayment = {
  amount?: number;
  balanceAfter?: number;
  createdAt?: string;
  date?: string;
};

type ScheduleRow = {
  period: string;
  scheduled: number;
  recorded: number | null;
  balanceAfter: number;
  status: "paid" | "next" | "upcoming";
};

function parseDateParts(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month: Number.isFinite(month) ? month : new Date().getMonth() + 1,
    day: Number.isFinite(day) ? day : 1,
  };
}

function periodAfter(startDate: string, offset: number) {
  const { year, month } = parseDateParts(startDate);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function estimateTermMonths(loan: LoanScheduleLoan) {
  if (loan.monthlyInstallment <= 0 || loan.principal <= 0) return 0;

  const monthlyRate = loan.interestRateBps / 12 / 10_000;
  let projectedBalance = loan.principal;
  let months = 0;

  while (projectedBalance > 0 && months < 60) {
    const interest = Math.round(projectedBalance * monthlyRate);
    const payment = Math.min(loan.monthlyInstallment, projectedBalance + interest);
    projectedBalance = Math.max(0, projectedBalance + interest - payment);
    months += 1;
  }

  return months || Math.ceil(loan.principal / loan.monthlyInstallment);
}

function buildSchedule(loan: LoanScheduleLoan, repayments: LoanRepayment[]): ScheduleRow[] {
  const orderedRepayments = repayments
    .filter((repayment) => repayment.amount != null || repayment.balanceAfter != null)
    .slice()
    .sort((a, b) => {
      const aDate = a.date ?? a.createdAt ?? "";
      const bDate = b.date ?? b.createdAt ?? "";
      return aDate.localeCompare(bDate);
    });

  const estimatedTerm = estimateTermMonths(loan);
  const remainingMonths = loan.monthlyInstallment > 0
    ? Math.ceil(loan.balance / loan.monthlyInstallment)
    : 0;
  const totalMonths = Math.max(estimatedTerm, orderedRepayments.length + remainingMonths, 1);
  const rows: ScheduleRow[] = [];
  let projectedBalance = loan.principal;

  for (let index = 0; index < totalMonths; index += 1) {
    const repayment = orderedRepayments[index];
    const scheduled = Math.min(loan.monthlyInstallment, Math.max(projectedBalance, 0));
    const recorded = repayment?.amount ?? null;
    const balanceAfter = repayment?.balanceAfter != null
      ? repayment.balanceAfter
      : Math.max(0, projectedBalance - (recorded ?? scheduled));

    rows.push({
      period: periodAfter(loan.startDate, index),
      scheduled,
      recorded,
      balanceAfter,
      status: repayment ? "paid" : index === orderedRepayments.length ? "next" : "upcoming",
    });

    projectedBalance = balanceAfter;
  }

  return rows;
}

export function LoanMonthlySchedule({
  loan,
  repayments = [],
}: {
  loan: LoanScheduleLoan;
  repayments?: LoanRepayment[];
}) {
  const schedule = buildSchedule(loan, repayments);
  const paidCount = schedule.filter((row) => row.status === "paid").length;
  const nextPayment = schedule.find((row) => row.status === "next");

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <div>
            <p className="font-mono text-xs font-semibold">MONTHLY REPAYMENT PLAN</p>
            <p className="text-xs text-muted-foreground">
              {paidCount} of {schedule.length} months recorded
            </p>
          </div>
        </div>
        {nextPayment && (
          <div className="text-left sm:text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next payment</p>
            <p className="font-mono text-xs font-semibold">
              {formatPeriod(nextPayment.period)} · {formatMoney(nextPayment.scheduled)}
            </p>
          </div>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md border border-border/30">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="h-8 py-2 font-mono text-[10px]">MONTH</TableHead>
              <TableHead className="h-8 py-2 text-right font-mono text-[10px]">SCHEDULED</TableHead>
              <TableHead className="h-8 py-2 text-right font-mono text-[10px]">RECORDED</TableHead>
              <TableHead className="h-8 py-2 text-right font-mono text-[10px]">BALANCE AFTER</TableHead>
              <TableHead className="h-8 py-2 text-right font-mono text-[10px]">STATUS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.map((row) => (
              <TableRow key={`${row.period}-${row.status}`} className="hover:bg-muted/10">
                <TableCell className="py-2 font-mono text-xs">{formatPeriod(row.period)}</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{formatMoney(row.scheduled)}</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">
                  {row.recorded == null ? "—" : formatMoney(row.recorded)}
                </TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{formatMoney(row.balanceAfter)}</TableCell>
                <TableCell className="py-2 text-right">
                  <Badge
                    variant={row.status === "paid" ? "default" : row.status === "next" ? "outline" : "secondary"}
                    className="font-mono text-[9px] uppercase"
                  >
                    {row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}