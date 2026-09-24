import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { formatDate, fullName } from "@/lib/utils";

const TYPES = ["annual", "sick", "compassionate", "maternity", "paternity", "study", "unpaid"];

function lastDay(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/**
 * Every leave request touching a chosen month, across all employees, so HR
 * can answer "who was off sick in August?" without opening each person. Shows
 * approved leave by default; the status filter covers pending and the rest.
 */
export function LeaveByMonth({ leaves }: { leaves: any[] }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("approved");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const first = `${period}-01`;
    const last = lastDay(period);
    const q = search.trim().toLowerCase();
    return (leaves ?? [])
      .filter((r) => r.leave.startDate.slice(0, 10) <= last && r.leave.endDate.slice(0, 10) >= first)
      .filter((r) => type === "all" || r.leave.type === type)
      .filter((r) => status === "all" || r.leave.status === status)
      .filter((r) => !q || fullName(r.employee).toLowerCase().includes(q) || (r.employee.empNo ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.leave.type.localeCompare(b.leave.type) || a.leave.startDate.localeCompare(b.leave.startDate));
  }, [leaves, period, type, status, search]);

  const perType = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.leave.type, (m.get(r.leave.type) ?? 0) + 1));
    return Array.from(m.entries());
  }, [rows]);

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Employee", "Emp No", "Type", "From", "To", "Days", "Status", "Reason"].map(esc).join(",")];
    rows.forEach((r) => lines.push([
      fullName(r.employee), r.employee.empNo, r.leave.type, r.leave.startDate.slice(0, 10), r.leave.endDate.slice(0, 10),
      Math.round((r.leave.days ?? 0) / 10), r.leave.status, r.leave.reason ?? "",
    ].map(esc).join(",")));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `leave_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-[170px] font-mono" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[170px] font-mono text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leave types</SelectItem>
            {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] font-mono text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">Any status</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
        <Button variant="outline" size="sm" className="font-mono ml-auto" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1.5" /> EXPORT CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground font-mono self-center">{rows.length} request(s):</span>
        {perType.map(([t, n]) => (
          <Badge key={t} variant="outline" className="capitalize font-mono">{t} · {n}</Badge>
        ))}
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
              <TableHead className="font-mono text-xs">TYPE</TableHead>
              <TableHead className="font-mono text-xs">DATES</TableHead>
              <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
              <TableHead className="font-mono text-xs">STATUS</TableHead>
              <TableHead className="font-mono text-xs">REASON</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">NO LEAVE IN {period}</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.leave.id}>
                <TableCell>
                  <div className="font-medium text-sm">{fullName(r.employee)}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.employee.empNo}</div>
                </TableCell>
                <TableCell className="capitalize text-sm">{r.leave.type}</TableCell>
                <TableCell className="text-sm font-mono">{formatDate(r.leave.startDate)} – {formatDate(r.leave.endDate)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{Math.round((r.leave.days ?? 0) / 10)}</TableCell>
                <TableCell><Badge variant={r.leave.status === "approved" ? "default" : "outline"} className="font-mono text-[10px]">{r.leave.status.toUpperCase()}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">{r.leave.reason ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
