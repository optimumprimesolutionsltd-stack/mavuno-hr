import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, fullName } from "@/lib/utils";
import { Download, Printer } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  annual: "Annual", sick: "Sick", maternity: "Maternity", paternity: "Paternity",
  compassionate: "Compassionate", study: "Study", unpaid: "Unpaid",
};

type Row = {
  empNo: string; name: string; department: string; type: string;
  start: string; end: string; days: number; status: string; reason: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/**
 * Days off (leave taken) for a date range, filterable by type, department and
 * status, as an Excel download or a printable sheet. A leave is included when
 * any of its days fall inside the range; the dates and day count shown are
 * the leave's own.
 */
export function LeaveReport({ leaves, departments }: { leaves: any[]; departments: any[] }) {
  const { org } = useAuth();
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [type, setType] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("approved");

  const deptName = (id: number | null | undefined) => departments.find((d) => d.id === id)?.name ?? "";

  const rows: Row[] = useMemo(() => leaves
    .filter((r) => {
      const l = r.leave;
      const s = String(l.startDate).slice(0, 10), e = String(l.endDate).slice(0, 10);
      if (s > to || e < from) return false;
      if (type !== "all" && l.type !== type) return false;
      if (dept !== "all" && String(r.employee?.departmentId ?? "") !== dept) return false;
      if (status !== "all" && l.status !== status) return false;
      return true;
    })
    .map((r) => ({
      empNo: r.employee?.empNo ?? "",
      name: fullName(r.employee ?? {}),
      department: deptName(r.employee?.departmentId),
      type: TYPE_LABEL[r.leave.type] ?? r.leave.type,
      start: String(r.leave.startDate).slice(0, 10),
      end: String(r.leave.endDate).slice(0, 10),
      days: Math.round((r.leave.days ?? 0) / 10),
      status: r.leave.status,
      reason: r.leave.reason ?? "",
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)),
  [leaves, from, to, type, dept, status, departments]);

  const totalDays = rows.reduce((s, r) => s + r.days, 0);
  const company = org.name ?? "";
  const filterLine = [
    `${formatDate(from)} to ${formatDate(to)}`,
    type === "all" ? "All leave types" : TYPE_LABEL[type],
    dept === "all" ? "All departments" : deptName(Number(dept)),
    status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1),
  ].join("  ·  ");

  async function downloadExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Days off");
    ws.addRow([`${company ? company + " — " : ""}Days off`]).font = { bold: true, size: 14 };
    ws.addRow([filterLine]);
    ws.addRow([]);
    const header = ws.addRow(["Emp No", "Employee", "Department", "Leave type", "From", "To", "Days", "Status", "Reason"]);
    header.font = { bold: true };
    header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }; });
    for (const r of rows) ws.addRow([r.empNo, r.name, r.department, r.type, r.start, r.end, r.days, r.status, r.reason]);
    ws.addRow([]);
    ws.addRow(["", "Total", "", "", "", "", totalDays]).font = { bold: true };
    [10, 28, 18, 14, 12, 12, 8, 11, 36].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Days_Off_${from}_to_${to}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function print() {
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups for this site to print."); return; }
    const body = rows.map((r) => `<tr><td>${esc(r.empNo)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.type)}</td><td>${esc(formatDate(r.start))}</td><td>${esc(formatDate(r.end))}</td><td class="n">${r.days}</td><td>${esc(r.status)}</td><td>${esc(r.reason)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Days off ${esc(from)} to ${esc(to)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#555;margin-bottom:14px}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}
  th{background:#eee} td.n{text-align:right} tfoot td{font-weight:bold}
  .foot{margin-top:28px;display:flex;gap:48px} .sig{border-top:1px solid #333;padding-top:4px;width:200px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>${esc(company ? company + " — " : "")}Days off</h1>
<div class="sub">${esc(filterLine)}  ·  Printed ${esc(formatDate(new Date().toISOString().slice(0, 10)))}</div>
<table><thead><tr><th>Emp No</th><th>Employee</th><th>Department</th><th>Leave type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Reason</th></tr></thead>
<tbody>${body || `<tr><td colspan="9">No days off in this range.</td></tr>`}</tbody>
<tfoot><tr><td colspan="6">Total</td><td class="n">${totalDays}</td><td colspan="2"></td></tr></tfoot></table>
<div class="foot"><div class="sig">Prepared by</div><div class="sig">Approved by</div></div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-card/50 p-4 rounded-lg border border-border/50">
        <div className="space-y-1"><Label className="text-xs font-mono text-muted-foreground">FROM</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs font-mono text-muted-foreground">TO</Label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <div className="space-y-1">
          <Label className="text-xs font-mono text-muted-foreground">TYPE</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-mono text-muted-foreground">DEPARTMENT</Label>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-mono text-muted-foreground">STATUS</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" className="font-mono gap-1.5" disabled={rows.length === 0} onClick={downloadExcel}>
            <Download className="h-4 w-4" /> DOWNLOAD EXCEL
          </Button>
          <Button className="font-mono gap-1.5" onClick={print}>
            <Printer className="h-4 w-4" /> PRINT
          </Button>
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-auto bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              {["EMP NO", "EMPLOYEE", "DEPARTMENT", "TYPE", "FROM", "TO", "DAYS", "STATUS", "REASON"].map((h) => (
                <TableHead key={h} className={`font-mono text-xs ${h === "DAYS" ? "text-right" : ""}`}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground font-mono">NO DAYS OFF IN THIS RANGE</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{r.empNo}</TableCell>
                <TableCell className="text-sm">{r.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.department || "—"}</TableCell>
                <TableCell className="text-sm">{r.type}</TableCell>
                <TableCell className="font-mono text-xs">{formatDate(r.start)}</TableCell>
                <TableCell className="font-mono text-xs">{formatDate(r.end)}</TableCell>
                <TableCell className="font-mono text-sm text-right">{r.days}</TableCell>
                <TableCell className="text-xs capitalize">{r.status}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={r.reason}>{r.reason || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > 0 && (
        <p className="text-sm text-right font-mono">{rows.length} leave{rows.length === 1 ? "" : "s"} · <strong>{totalDays}</strong> day{totalDays === 1 ? "" : "s"} off</p>
      )}
    </div>
  );
}
