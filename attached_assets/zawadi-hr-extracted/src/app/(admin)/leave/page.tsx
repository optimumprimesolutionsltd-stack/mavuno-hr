"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Badge, Button, Input, Select, Label, Modal, Spinner, Th, Td } from "@/components/ui";

interface Row {
  leave: { id: number; type: string; startDate: string; endDate: string; days: string; reason: string | null; status: string };
  employee: { id: number; firstName: string; lastName: string; leaveBalance: string };
}

interface Emp { employee: { id: number; firstName: string; lastName: string } }

export default function LeavePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", type: "annual", startDate: "", endDate: "", reason: "" });

  const load = () => fetch("/api/leaves").then((r) => r.json()).then(setRows);
  useEffect(() => {
    load();
    fetch("/api/employees").then((r) => r.json()).then(setEmps);
  }, []);

  const act = async (id: number, action: "approve" | "reject") => {
    await fetch("/api/leaves", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    load();
  };

  const submit = async () => {
    if (!form.employeeId || !form.startDate || !form.endDate) return alert("Employee and dates are required");
    await fetch("/api/leaves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setOpen(false);
    load();
  };

  const pending = rows?.filter((r) => r.leave.status === "pending") || [];

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="Kenyan statutory entitlements built in — 21 days annual, 90 days maternity, 14 days paternity, sick leave per Employment Act 2007."
        actions={<Button onClick={() => setOpen(true)}>+ Apply for Leave</Button>}
      />

      {pending.length > 0 && (
        <Card className="mb-4 border-amber-400/15 bg-amber-400/[0.04] px-5 py-3 text-[13px] text-amber-200">
          ⏳ {pending.length} request(s) awaiting manager approval
        </Card>
      )}

      {!rows ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr><Th>Employee</Th><Th>Type</Th><Th>Dates</Th><Th right>Days</Th><Th>Reason</Th><Th right>Balance</Th><Th>Status</Th><Th right>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r) => (
                <tr key={r.leave.id} className="hover:bg-white/[0.03]">
                  <Td><span className="font-medium text-slate-100">{r.employee.firstName} {r.employee.lastName}</span></Td>
                  <Td><span className="capitalize text-slate-300">{r.leave.type}</span></Td>
                  <Td><span className="text-slate-400">{r.leave.startDate} → {r.leave.endDate}</span></Td>
                  <Td right>{Number(r.leave.days)}</Td>
                  <Td><span className="max-w-[180px] truncate text-slate-500">{r.leave.reason || "—"}</span></Td>
                  <Td right>{Number(r.employee.leaveBalance)}d</Td>
                  <Td><Badge value={r.leave.status} /></Td>
                  <Td right>
                    {r.leave.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => act(r.leave.id, "approve")} className="rounded-md bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-400/25">Approve</button>
                        <button onClick={() => act(r.leave.id, "reject")} className="rounded-md bg-rose-400/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-400/25">Reject</button>
                      </div>
                    ) : <span className="text-[11px] text-slate-600">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for Leave">
        <div className="space-y-4">
          <div>
            <Label>Employee</Label>
            <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select employee…</option>
              {emps.map((e) => <option key={e.employee.id} value={e.employee.id}>{e.employee.firstName} {e.employee.lastName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Leave Type</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="annual">Annual (21 days statutory)</option>
              <option value="sick">Sick (full pay 7d, half pay 7d)</option>
              <option value="maternity">Maternity (90 days)</option>
              <option value="paternity">Paternity (14 days)</option>
              <option value="compassionate">Compassionate</option>
              <option value="study">Study</option>
              <option value="unpaid">Unpaid</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Submit Request</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
