"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Badge, Button, Input, Select, Label, Modal, Spinner, Th, Td, kes } from "@/components/ui";

/* Money is integer CENTS; interest is basis points (100 bps = 1%). */
interface Row {
  loan: { id: number; type: string; principal: number; balance: number; monthlyInstallment: number; interestRateBps: number; status: string; startDate: string };
  employee: { id: number; firstName: string; lastName: string };
}
interface Emp { employee: { id: number; firstName: string; lastName: string } }
interface ReqRow {
  request: { id: number; type: string; amount: number; months: number; reason: string | null; status: string; createdAt: string };
  employee: { id: number; firstName: string; lastName: string };
}

export default function LoansPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [requests, setRequests] = useState<ReqRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", type: "company", principal: "", interestRate: "0", months: "12" });
  const [reviewing, setReviewing] = useState<ReqRow | null>(null);
  const [reviewForm, setReviewForm] = useState({ interestRate: "0", months: "12" });
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/loans").then((r) => r.json()).then(setRows);
  const loadRequests = () => fetch("/api/loans/requests").then((r) => r.json()).then(setRequests);
  useEffect(() => {
    load();
    loadRequests();
    fetch("/api/employees").then((r) => r.json()).then(setEmps);
  }, []);

  const submit = async () => {
    if (!form.employeeId || !form.principal) return alert("Employee and amount are required");
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: Number(form.employeeId),
        type: form.type,
        principal: form.principal,
        /* UI captures % p.a.; API wants basis points. 5% -> 500 bps. */
        interestRateBps: Math.round(Number(form.interestRate) * 100),
        months: Number(form.months),
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      return alert(err.error || "Could not create loan");
    }
    setOpen(false);
    load();
  };

  const openReview = (r: ReqRow) => {
    setReviewing(r);
    setReviewForm({ interestRate: "0", months: String(r.request.months) });
  };

  const approve = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      await fetch(`/api/loans/requests/${reviewing.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", interestRateBps: Math.round(Number(reviewForm.interestRate) * 100), months: Number(reviewForm.months) }),
      });
      setReviewing(null);
      load();
      loadRequests();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      await fetch(`/api/loans/requests/${reviewing.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      setReviewing(null);
      loadRequests();
    } finally {
      setBusy(false);
    }
  };

  const totalOutstanding = rows?.filter((r) => r.loan.status === "active").reduce((a, r) => a + Number(r.loan.balance), 0) || 0;
  const pendingRequests = requests?.filter((r) => r.request.status === "pending") || [];

  return (
    <div>
      <PageHeader
        title="Loans & Salary Advances"
        subtitle={`Company, SACCO and emergency facilities with automatic payroll recovery. Outstanding book: ${kes(totalOutstanding)}.`}
        actions={<Button onClick={() => setOpen(true)}>+ Issue Loan</Button>}
      />

      {requests && pendingRequests.length > 0 && (
        <Card className="mb-6 overflow-x-auto">
          <div className="px-5 pt-4 pb-2 text-sm font-bold text-white">
            Pending Portal Requests <span className="ml-1 text-slate-500">({pendingRequests.length})</span>
          </div>
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr><Th>Employee</Th><Th>Type</Th><Th right>Amount</Th><Th right>Months</Th><Th>Reason</Th><Th right>Action</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {pendingRequests.map((r) => (
                <tr key={r.request.id} className="hover:bg-white/[0.03]">
                  <Td><span className="font-medium text-slate-100">{r.employee.firstName} {r.employee.lastName}</span></Td>
                  <Td className="capitalize">{r.request.type}</Td>
                  <Td right>{kes(r.request.amount)}</Td>
                  <Td right>{r.request.months}</Td>
                  <Td className="max-w-xs whitespace-normal text-slate-400">{r.request.reason || "—"}</Td>
                  <Td right><Button variant="sky" onClick={() => openReview(r)}>Review</Button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!rows ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr><Th>Employee</Th><Th>Type</Th><Th right>Principal</Th><Th right>Interest</Th><Th right>Balance</Th><Th right>Monthly Recovery</Th><Th>Repayment</Th><Th>Status</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r) => {
                /* Balance includes interest, so "repaid %" is measured against the
                   opening balance implied by principal+interest. Approximate with
                   balance/max(balance0≈principal): keep simple, clamp to [0,100]. */
                const pct = Math.min(100, Math.max(0, 100 - (r.loan.balance / Math.max(1, r.loan.principal)) * 100));
                return (
                  <tr key={r.loan.id} className="hover:bg-white/[0.03]">
                    <Td><span className="font-medium text-slate-100">{r.employee.firstName} {r.employee.lastName}</span></Td>
                    <Td><span className="capitalize text-slate-300">{r.loan.type}</span></Td>
                    <Td right>{kes(r.loan.principal)}</Td>
                    <Td right>{(r.loan.interestRateBps / 100).toFixed(1)}%</Td>
                    <Td right><span className="font-semibold text-amber-300">{kes(r.loan.balance)}</span></Td>
                    <Td right>{kes(r.loan.monthlyInstallment)}</Td>
                    <Td>
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.07]">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${pct}%` }} />
                      </div>
                    </Td>
                    <Td><Badge value={r.loan.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Issue Loan / Advance">
        <div className="space-y-4">
          <div>
            <Label>Employee</Label>
            <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select employee…</option>
              {emps.map((e) => <option key={e.employee.id} value={e.employee.id}>{e.employee.firstName} {e.employee.lastName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Facility Type</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="company">Company Loan</option>
              <option value="sacco">SACCO Loan</option>
              <option value="advance">Salary Advance</option>
              <option value="emergency">Emergency Loan</option>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Principal (KSh)</Label><Input type="number" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></div>
            <div><Label>Interest % p.a.</Label><Input type="number" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} /></div>
            <div><Label>Months</Label><Input type="number" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} /></div>
          </div>
          {form.principal && (
            <div className="rounded-lg bg-white/[0.03] px-4 py-3 text-[12.5px] text-slate-400">
              Estimated monthly recovery:{" "}
              <span className="font-bold text-emerald-300">
                {kes((Number(form.principal) * (1 + (Number(form.interestRate) / 100) * (Number(form.months) / 12))) / Math.max(1, Number(form.months)))}
              </span>{" "}
              — auto-deducted in each payroll run until settled.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Issue Loan</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Review Loan Request">
        {reviewing && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white/[0.03] px-4 py-3 text-[13px] text-slate-300">
              <div className="font-semibold text-slate-100">{reviewing.employee.firstName} {reviewing.employee.lastName}</div>
              <div className="mt-1 capitalize text-slate-400">{reviewing.request.type} — {kes(reviewing.request.amount)}</div>
              {reviewing.request.reason && <div className="mt-1 text-slate-500">&ldquo;{reviewing.request.reason}&rdquo;</div>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Interest % p.a.</Label><Input type="number" value={reviewForm.interestRate} onChange={(e) => setReviewForm({ ...reviewForm, interestRate: e.target.value })} /></div>
              <div><Label>Months</Label><Input type="number" value={reviewForm.months} onChange={(e) => setReviewForm({ ...reviewForm, months: e.target.value })} /></div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-4 py-3 text-[12.5px] text-slate-400">
              Estimated monthly recovery:{" "}
              <span className="font-bold text-emerald-300">
                {kes((Number(reviewing.request.amount) * (1 + (Number(reviewForm.interestRate) / 100) * (Number(reviewForm.months) / 12))) / Math.max(1, Number(reviewForm.months)))}
              </span>{" "}
              — auto-deducted in each payroll run once approved.
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="danger" disabled={busy} onClick={reject}>Reject</Button>
              <Button disabled={busy} onClick={approve}>Approve & Issue Loan</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
