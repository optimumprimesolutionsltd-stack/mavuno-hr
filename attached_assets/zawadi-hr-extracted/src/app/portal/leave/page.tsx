"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "@/components/PortalShell";
import { Card, PageHeader, Spinner, Badge, Input, Select, Label, Button, Th, Td } from "@/components/ui";

interface LeaveDoc { id: number; fileName: string; uploadedAt: string; size: number }
interface Leave {
  id: number; type: string; startDate: string; endDate: string; days: number; reason: string | null;
  status: string; documents: LeaveDoc[];
}
interface Principal { name: string }
interface Me { employee: { firstName: string; lastName: string } }

const TYPES = ["annual", "sick", "maternity", "paternity", "compassionate", "study", "unpaid"];

export default function PortalLeavePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null);
  const [leaves, setLeaves] = useState<Leave[] | null>(null);
  const [form, setForm] = useState({ type: "annual", startDate: "", endDate: "", reason: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const load = () => fetch("/api/portal/leave").then((r) => r.json()).then((d) => {
    setLeaves(d.leaves);
    setLeaveBalance(d.leaveBalance);
  });

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
      const res = await fetch("/api/portal/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Could not submit request");
      setForm({ type: "annual", startDate: "", endDate: "", reason: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const uploadDoc = async (leaveId: number, file: File) => {
    setUploadingFor(leaveId);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/portal/leave/${leaveId}/documents`, { method: "POST", body: fd });
    setUploadingFor(null);
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error || "Upload failed");
    }
  };

  if (!me || !leaves || leaveBalance === null) return <Spinner />;

  return (
    <PortalShell employeeName={`${me.employee.firstName} ${me.employee.lastName}`}>
      <PageHeader
        title="Leave"
        subtitle={`Apply for leave and track the status of your requests. Available annual leave: ${(leaveBalance / 10).toFixed(1)} days.`}
      />

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-white">Apply for Leave</h3>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>Type</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label>Start Date</Label>
            <Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <Label>End Date</Label>
            <Input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
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
        <div className="px-5 pt-4 pb-2 text-sm font-bold text-white">My Leave Requests</div>
        {leaves.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No leave requests yet.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr><Th>Type</Th><Th>Dates</Th><Th right>Days</Th><Th>Status</Th><Th>Documents</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {leaves.map((l) => (
                <tr key={l.id} className="align-top hover:bg-white/[0.03]">
                  <Td className="capitalize">{l.type}</Td>
                  <Td>{l.startDate} → {l.endDate}</Td>
                  <Td right>{(l.days / 10).toFixed(1)}</Td>
                  <Td><Badge value={l.status} /></Td>
                  <Td>
                    {l.type === "sick" ? (
                      <div className="space-y-1.5">
                        {l.documents.map((d) => (
                          <a key={d.id} href={`/api/portal/leave/${l.id}/documents/${d.id}`} target="_blank" rel="noreferrer" className="block text-[12px] font-medium text-emerald-300 hover:underline">
                            📄 {d.fileName}
                          </a>
                        ))}
                        {l.status === "pending" && (
                          <>
                            <input
                              ref={(el) => { fileInputs.current[l.id] = el; }}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && uploadDoc(l.id, e.target.files[0])}
                            />
                            <button
                              onClick={() => fileInputs.current[l.id]?.click()}
                              disabled={uploadingFor === l.id}
                              className="text-[12px] font-semibold text-sky-300 hover:underline disabled:opacity-50"
                            >
                              {uploadingFor === l.id ? "Uploading…" : "+ Upload medical note"}
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-slate-600">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PortalShell>
  );
}
