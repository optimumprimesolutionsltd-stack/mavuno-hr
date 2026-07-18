"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "@/components/PortalShell";
import { Card, PageHeader, Spinner, Badge, Input, Select, Label, Button, Th, Td, kes } from "@/components/ui";

interface LoanRequest {
  id: number; type: string; amount: number; months: number; reason: string | null;
  status: string; reviewNote: string | null; createdAt: string;
}
interface Loan {
  id: number; type: string; principal: number; balance: number; monthlyInstallment: number;
  interestRateBps: number; status: string; startDate: string;
}
interface Me { employee: { firstName: string; lastName: string } }

const TYPES = [
  { value: "advance", label: "Salary Advance" },
  { value: "emergency", label: "Emergency Loan" },
  { value: "company", label: "Company Loan" },
  { value: "sacco", label: "SACCO Loan" },
];

export default function PortalLoansPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<{ requests: LoanRequest[]; loans: Loan[] } | null>(null);
  const [form, setForm] = useState({ type: "advance", amount: "", months: "12", reason: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => fetch("/api/portal/loans").then((r) => r.json()).then(setData);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => {
      if (r.status === 401) return router.push("/portal/login");
    });
    fetch("/api/portal/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setMe(d));
    load();
  }, [router]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      /* amount goes as a decimal string ("15000.00"); months as an integer —
       * exactly what loanRequestSchema on the server expects. */
      const res = await fetch("/api/portal/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount: form.amount,
          months: Number(form.months),
          reason: form.reason || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) return setError(result.error || "Could not submit request");
      setForm({ type: "advance", amount: "", months: "12", reason: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (!me || !data) return <Spinner />;

  const activeOutstanding = data.loans
    .filter((l) => l.status === "active")
    .reduce((a, l) => a + l.balance, 0);

  return (
    <PortalShell employeeName={`${me.employee.firstName} ${me.employee.lastName}`}>
      <PageHeader
        title="Loans & Advances"
        subtitle={`Apply for a salary advance or loan and track approval status. Current outstanding balance: ${kes(activeOutstanding)}.`}
      />

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-white">Apply for a Loan / Advance</h3>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>Type</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" min="1" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>Repayment (months)</Label>
            <Input type="number" min="1" max="60" required value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional" />
          </div>
          <div className="md:col-span-4">
            {error && <p className="mb-2 text-[12.5px] text-rose-300">{error}</p>}
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit Request"}</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4 overflow-x-auto">
        <div className="px-5 pt-4 pb-2 text-sm font-bold text-white">My Requests</div>
        {data.requests.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No loan requests yet.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr><Th>Type</Th><Th right>Amount</Th><Th right>Months</Th><Th>Status</Th><Th>Note</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.requests.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03]">
                  <Td className="capitalize">{r.type}</Td>
                  <Td right>{kes(r.amount)}</Td>
                  <Td right>{r.months}</Td>
                  <Td><Badge value={r.status} /></Td>
                  <Td className="max-w-xs whitespace-normal text-slate-400">{r.reviewNote || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-4 overflow-x-auto">
        <div className="px-5 pt-4 pb-2 text-sm font-bold text-white">My Active & Past Loans</div>
        {data.loans.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No loans issued yet.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr><Th>Type</Th><Th right>Principal</Th><Th right>Balance</Th><Th right>Monthly Recovery</Th><Th>Status</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.loans.map((l) => (
                <tr key={l.id} className="hover:bg-white/[0.03]">
                  <Td className="capitalize">{l.type}</Td>
                  <Td right>{kes(l.principal)}</Td>
                  <Td right><span className="font-semibold text-amber-300">{kes(l.balance)}</span></Td>
                  <Td right>{kes(l.monthlyInstallment)}</Td>
                  <Td><Badge value={l.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PortalShell>
  );
}
