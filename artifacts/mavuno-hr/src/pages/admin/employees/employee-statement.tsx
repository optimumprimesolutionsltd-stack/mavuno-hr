import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { useListLeaves, useListLoans } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatMoney, fullName } from "@/lib/utils";
import { Download, Printer } from "lucide-react";

type Section = "pay" | "leave" | "balance" | "loans";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "pay", label: "Pay (salary, PAYE, NSSF, SHA, Housing Levy, net)" },
  { key: "leave", label: "Leave days taken" },
  { key: "balance", label: "Annual leave balance" },
  { key: "loans", label: "Loans and advances" },
];
const TYPE_LABEL: Record<string, string> = {
  annual: "Annual", sick: "Sick", maternity: "Maternity", paternity: "Paternity",
  compassionate: "Compassionate", study: "Study", unpaid: "Unpaid",
};
const LOAN_LABEL: Record<string, string> = { company: "Company loan", sacco: "SACCO", advance: "Salary advance", emergency: "Emergency" };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const kes = (cents: number) => formatMoney(cents || 0);
const num = (cents: number) => Math.round(cents || 0) / 100;
const periodLabel = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "short", year: "numeric" });
};
const lastDay = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${p}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

/**
 * One employee's statement for a month, a year or a range of months: pay,
 * leave taken, leave balance and loans -- any combination -- to print (or
 * save as PDF from the print window) or download as Excel, e.g. to send to
 * the employee. Only approved or paid payroll is included, never drafts.
 */
export function EmployeeStatementDialog({ open, onOpenChange, data }: {
  open: boolean; onOpenChange: (o: boolean) => void; data: any;
}) {
  const { org } = useAuth();
  const employee = data?.employee ?? {};
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mode, setMode] = useState<"month" | "year" | "range">("month");
  const [month, setMonth] = useState(thisMonth);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [fromM, setFromM] = useState(`${now.getFullYear()}-01`);
  const [toM, setToM] = useState(thisMonth);
  const [picked, setPicked] = useState<Set<Section>>(new Set(["pay", "leave", "balance", "loans"]));

  const { data: allLeaves } = useListLeaves({ query: { enabled: open } as any } as any);
  const { data: allLoans } = useListLoans({ query: { enabled: open } as any } as any);

  const [from, to] = mode === "month" ? [month, month] : mode === "year" ? [`${year}-01`, `${year}-12`] : [fromM, toM];
  const fromDate = `${from}-01`, toDate = lastDay(to);
  const rangeText = from === to ? periodLabel(from)
    : mode === "year" ? `Year ${year}` : `${periodLabel(from)} – ${periodLabel(to)}`;

  const pay = useMemo(() => ((data?.payslips ?? []) as any[])
    .filter((it) => {
      const run = it.run ?? {};
      return run.period >= from && run.period <= to && (run.status === "paid" || run.status === "approved");
    })
    .map((it) => {
      const s = it.slip ?? it, run = it.run ?? {}, bd = s.breakdown ?? {};
      const other = (s.pension || 0) + (s.helb || 0) + (s.sacco || 0) + (s.loanDeduction || 0)
        + (s.insurancePremium || 0) + (s.adjustmentDeductions || 0);
      return {
        period: run.period as string, runId: run.id as number,
        gross: s.gross || 0, paye: s.paye || 0,
        tier1: bd.nssfTier1 ?? null, tier2: bd.nssfTier2 ?? null, nssf: s.nssfEmployee || 0,
        shif: s.shif || 0, ahl: s.housingLevyEmployee || 0, other, net: s.netPay || 0,
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period)), [data, from, to]);
  const payTotal = pay.reduce((t, r) => ({
    gross: t.gross + r.gross, paye: t.paye + r.paye, tier1: t.tier1 + (r.tier1 ?? 0), tier2: t.tier2 + (r.tier2 ?? 0),
    nssf: t.nssf + r.nssf, shif: t.shif + r.shif, ahl: t.ahl + r.ahl, other: t.other + r.other, net: t.net + r.net,
  }), { gross: 0, paye: 0, tier1: 0, tier2: 0, nssf: 0, shif: 0, ahl: 0, other: 0, net: 0 });
  const tiersKnown = pay.some((r) => r.tier1 !== null);

  const leave = useMemo(() => ((allLeaves ?? []) as any[])
    .filter((r) => r.leave.employeeId === employee.id && r.leave.status === "approved")
    .filter((r) => String(r.leave.startDate).slice(0, 10) <= toDate && String(r.leave.endDate).slice(0, 10) >= fromDate)
    .map((r) => ({
      type: TYPE_LABEL[r.leave.type] ?? r.leave.type,
      start: String(r.leave.startDate).slice(0, 10), end: String(r.leave.endDate).slice(0, 10),
      days: Math.round((r.leave.days ?? 0) / 10), reason: r.leave.reason ?? "",
    }))
    .sort((a, b) => a.start.localeCompare(b.start)), [allLeaves, employee.id, fromDate, toDate]);
  const leaveDays = leave.reduce((s, l) => s + l.days, 0);

  // Annual leave for the calendar year the statement ends in.
  const balYear = to.slice(0, 4);
  const entitlement = data?.leaveBalanceSummary?.entitlement ?? Math.round((employee.leaveBalance ?? 210) / 10);
  const annualTaken = ((allLeaves ?? []) as any[])
    .filter((r) => r.leave.employeeId === employee.id && r.leave.status === "approved" && r.leave.type === "annual"
      && String(r.leave.startDate).startsWith(balYear))
    .reduce((s, r) => s + Math.round((r.leave.days ?? 0) / 10), 0);

  const runIds = new Set(pay.map((r) => r.runId));
  const loans = ((allLoans ?? []) as any[])
    .filter((r) => r.loan.employeeId === employee.id && String(r.loan.startDate).slice(0, 10) <= toDate)
    .map((r) => ({
      type: LOAN_LABEL[r.loan.type] ?? r.loan.type, issued: String(r.loan.startDate).slice(0, 10),
      amount: r.loan.principal || 0,
      repaid: ((r.repayments ?? []) as any[]).filter((x) => runIds.has(x.runId)).reduce((s, x) => s + (x.amount || 0), 0),
      balance: r.loan.balance || 0, status: r.loan.status,
    }));

  const has = (s: Section) => picked.has(s);
  const toggle = (s: Section) => setPicked((cur) => { const n = new Set(cur); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const company = org.name ?? "";
  const who = `${fullName(employee)} (${employee.empNo ?? ""})`;
  const fileBase = `${fullName(employee).replace(/\s+/g, "_")}_${from === to ? from : `${from}_to_${to}`}`;
  const ids = [
    ["Employee No", employee.empNo], ["Position", employee.position], ["Department", data?.department?.name],
    ["KRA PIN", employee.kraPin], ["NSSF No", employee.nssfNo], ["SHA/SHIF No", employee.shifNo],
  ].filter(([, v]) => v) as [string, string][];

  async function downloadExcel() {
    const wb = new ExcelJS.Workbook();
    const head = (ws: ExcelJS.Worksheet, title: string) => {
      ws.addRow([`${company ? company + " — " : ""}${title}`]).font = { bold: true, size: 13 };
      ws.addRow([`${who}  ·  ${rangeText}`]);
      ws.addRow([]);
    };
    const bold = (r: ExcelJS.Row) => { r.font = { bold: true }; };
    if (has("pay")) {
      const ws = wb.addWorksheet("Pay");
      head(ws, "Pay statement");
      const cols = ["Month", "Gross", "PAYE", ...(tiersKnown ? ["NSSF Tier I", "NSSF Tier II"] : []), "NSSF total", "SHA/SHIF", "Housing Levy", "Other deductions", "Net pay"];
      bold(ws.addRow(cols));
      for (const r of pay) ws.addRow([periodLabel(r.period), num(r.gross), num(r.paye), ...(tiersKnown ? [num(r.tier1 ?? 0), num(r.tier2 ?? 0)] : []), num(r.nssf), num(r.shif), num(r.ahl), num(r.other), num(r.net)]);
      bold(ws.addRow(["Total", num(payTotal.gross), num(payTotal.paye), ...(tiersKnown ? [num(payTotal.tier1), num(payTotal.tier2)] : []), num(payTotal.nssf), num(payTotal.shif), num(payTotal.ahl), num(payTotal.other), num(payTotal.net)]));
      ws.columns.forEach((c, i) => { c.width = i === 0 ? 14 : 15; if (i > 0) c.numFmt = "#,##0.00"; });
    }
    if (has("leave")) {
      const ws = wb.addWorksheet("Leave taken");
      head(ws, "Leave days taken");
      bold(ws.addRow(["Type", "From", "To", "Days", "Reason"]));
      for (const l of leave) ws.addRow([l.type, l.start, l.end, l.days, l.reason]);
      bold(ws.addRow(["Total", "", "", leaveDays]));
      [16, 12, 12, 8, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    }
    if (has("balance")) {
      const ws = wb.addWorksheet("Leave balance");
      head(ws, `Annual leave balance ${balYear}`);
      ws.addRow(["Entitlement (days)", entitlement]);
      ws.addRow(["Annual leave taken (days)", annualTaken]);
      bold(ws.addRow(["Remaining (days)", Math.max(0, entitlement - annualTaken)]));
      ws.getColumn(1).width = 28;
    }
    if (has("loans")) {
      const ws = wb.addWorksheet("Loans");
      head(ws, "Loans and advances");
      bold(ws.addRow(["Type", "Issued", "Amount", "Repaid in period", "Balance now", "Status"]));
      for (const l of loans) ws.addRow([l.type, l.issued, num(l.amount), num(l.repaid), num(l.balance), l.status]);
      ws.columns.forEach((c, i) => { c.width = i === 0 ? 18 : 15; if (i >= 2 && i <= 4) c.numFmt = "#,##0.00"; });
    }
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Statement_${fileBase}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function print() {
    const w = window.open("", "_blank");
    if (!w) { alert("Your browser blocked the print window. Allow pop-ups for mavunohr.co.ke, then try again."); return; }
    const table = (headers: string[], rows: (string | number)[][], foot?: (string | number)[], numFrom = 1) =>
      `<table><thead><tr>${headers.map((h, i) => `<th${i >= numFrom ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= numFrom ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">None in this period.</td></tr>`}</tbody>
      ${foot ? `<tfoot><tr>${foot.map((c, i) => `<td${i >= numFrom ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr></tfoot>` : ""}</table>`;
    const parts: string[] = [];
    if (has("pay")) parts.push(`<h2>Pay</h2>` + table(
      ["Month", "Gross", "PAYE", ...(tiersKnown ? ["NSSF Tier I", "NSSF Tier II"] : ["NSSF"]), "SHA/SHIF", "Housing Levy", "Other ded.", "Net pay"],
      pay.map((r) => [periodLabel(r.period), kes(r.gross), kes(r.paye), ...(tiersKnown ? [kes(r.tier1 ?? 0), kes(r.tier2 ?? 0)] : [kes(r.nssf)]), kes(r.shif), kes(r.ahl), kes(r.other), kes(r.net)]),
      ["Total", kes(payTotal.gross), kes(payTotal.paye), ...(tiersKnown ? [kes(payTotal.tier1), kes(payTotal.tier2)] : [kes(payTotal.nssf)]), kes(payTotal.shif), kes(payTotal.ahl), kes(payTotal.other), kes(payTotal.net)],
    ));
    if (has("leave")) parts.push(`<h2>Leave days taken</h2>` + table(
      ["Type", "From", "To", "Days", "Reason"],
      leave.map((l) => [l.type, formatDate(l.start), formatDate(l.end), l.days, l.reason]),
      ["Total", "", "", leaveDays, ""], 3,
    ));
    if (has("balance")) parts.push(`<h2>Annual leave balance ${esc(balYear)}</h2>` + table(
      ["", "Days"], [["Entitlement", entitlement], ["Annual leave taken", annualTaken]], ["Remaining", Math.max(0, entitlement - annualTaken)],
    ));
    if (has("loans")) parts.push(`<h2>Loans and advances</h2>` + table(
      ["Type", "Issued", "Amount", "Repaid in period", "Balance now", "Status"],
      loans.map((l) => [l.type, formatDate(l.issued), kes(l.amount), kes(l.repaid), kes(l.balance), l.status]), undefined, 2,
    ));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${esc(fullName(employee))} — ${esc(rangeText)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0} h2{font-size:14px;margin:20px 0 6px;border-bottom:2px solid #0f766e;padding-bottom:3px}
  .sub{color:#555;margin:4px 0 10px} .ids{display:flex;flex-wrap:wrap;gap:4px 18px;margin-bottom:6px}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}
  th{background:#eee} .n{text-align:right} tfoot td{font-weight:bold;background:#f6f6f6}
  .foot{margin-top:32px;display:flex;gap:48px} .sig{border-top:1px solid #333;padding-top:4px;width:200px}
  @media print{body{margin:10mm} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body>
<h1>${esc(company ? company + " — " : "")}Employee statement</h1>
<div class="sub"><strong>${esc(fullName(employee))}</strong> · ${esc(rangeText)} · Printed ${esc(formatDate(new Date().toISOString().slice(0, 10)))}</div>
<div class="ids">${ids.map(([k, v]) => `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join("")}</div>
${parts.join("")}
<div class="foot"><div class="sig">Prepared by</div><div class="sig">Employee signature</div></div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
    w.document.close();
  }

  const years = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">Statement — {fullName(employee)}</DialogTitle>
          <DialogDescription>
            Choose the period and what to include, then print it (or save as PDF from the print window) or download Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs font-mono text-muted-foreground">PERIOD</Label>
          <div className="flex flex-wrap gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">One month</SelectItem>
                <SelectItem value="year">Whole year</SelectItem>
                <SelectItem value="range">From – to</SelectItem>
              </SelectContent>
            </Select>
            {mode === "month" && <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />}
            {mode === "year" && (
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {mode === "range" && (
              <>
                <Input type="month" value={fromM} onChange={(e) => setFromM(e.target.value)} className="w-40" />
                <Input type="month" value={toM} min={fromM} onChange={(e) => setToM(e.target.value)} className="w-40" />
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-mono text-muted-foreground">INCLUDE</Label>
          {SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={picked.has(s.key)} onChange={() => toggle(s.key)} />
              {s.label}
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {s.key === "pay" ? `${pay.length} month${pay.length === 1 ? "" : "s"}`
                  : s.key === "leave" ? `${leaveDays} day${leaveDays === 1 ? "" : "s"}`
                  : s.key === "balance" ? `${Math.max(0, entitlement - annualTaken)} left`
                  : `${loans.length}`}
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Pay includes approved and paid payroll only, not drafts.</p>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" className="font-mono gap-1.5" disabled={picked.size === 0} onClick={downloadExcel}>
            <Download className="h-4 w-4" /> DOWNLOAD EXCEL
          </Button>
          <Button className="font-mono gap-1.5" disabled={picked.size === 0} onClick={print}>
            <Printer className="h-4 w-4" /> PRINT
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
