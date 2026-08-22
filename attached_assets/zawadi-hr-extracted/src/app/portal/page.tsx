"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PortalShell from "@/components/PortalShell";
import { Card, PageHeader, Stat, Spinner, Badge, Input, Label, Button } from "@/components/ui";

interface Principal {
  name: string; email: string; role: string; mustChangePassword: boolean;
}
interface Me {
  employee: {
    firstName: string; lastName: string; email: string; empNo: string; position: string; leaveBalance: number;
  };
  department: { name: string } | null;
}
interface Leave {
  id: number; type: string; startDate: string; endDate: string; days: number; status: string;
}

export default function PortalDashboard() {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [leaves, setLeaves] = useState<Leave[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (r.status === 401) return setNotFound(true);
      const p: Principal = await r.json();
      setPrincipal(p);
      if (p.mustChangePassword) setShowChangePw(true);
    });
    fetch("/api/portal/me").then((r) => (r.ok ? r.json() : null)).then(setMe);
    fetch("/api/portal/leave").then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLeaves(d.leaves));
  }, []);

  useEffect(() => {
    if (notFound) router.push("/portal/login");
  }, [notFound, router]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) return setPwMsg(data.error || "Could not update password");
    setPwMsg("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
    setTimeout(() => setShowChangePw(false), 1200);
  };

  if (!principal || !me || !leaves) return <Spinner />;
  const e = me.employee;
  const pending = leaves.filter((l) => l.status === "pending").length;

  return (
    <PortalShell employeeName={`${e.firstName} ${e.lastName}`}>
      <PageHeader title={`Welcome back, ${e.firstName}`} subtitle={`${e.position} · ${me.department?.name || "Unassigned"} · Staff No ${e.empNo}`} />

      {principal.mustChangePassword && (
        <Card className="mb-4 border-amber-400/20 bg-amber-400/[0.05] p-4 text-[13px] text-amber-200">
          You&apos;re using a temporary password. Please set a new one below to secure your account.
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {/* leaveBalance is stored in tenths of a day so half-days are representable. */}
        <Stat label="Leave Balance" value={`${(e.leaveBalance / 10).toFixed(1)} days`} hint="Available annual leave" accent="emerald" />
        <Stat label="Pending Requests" value={String(pending)} hint="Awaiting HR approval" accent="amber" />
        <Stat label="Total Requests" value={String(leaves.length)} hint="All-time leave history" accent="sky" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-white">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Link href="/portal/leave" className="rounded-lg bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 text-[13px] font-semibold text-black shadow-lg shadow-emerald-500/25 hover:brightness-110">
              Apply for Leave
            </Link>
            <Link href="/portal/p9" className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-slate-200 hover:bg-white/[0.08]">
              View My P9
            </Link>
            <button onClick={() => setShowChangePw((v) => !v)} className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-slate-200 hover:bg-white/[0.08]">
              Change Password
            </button>
          </div>

          {showChangePw && (
            <form onSubmit={changePassword} className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
              <div>
                <Label>Current Password</Label>
                <Input type="password" required value={currentPassword} onChange={(ev) => setCurrentPassword(ev.target.value)} />
              </div>
              <div>
                <Label>New Password</Label>
                <Input type="password" required minLength={12} value={newPassword} onChange={(ev) => setNewPassword(ev.target.value)} />
              </div>
              <p className="text-[11.5px] text-slate-500">At least 12 characters, with upper case, lower case and a digit.</p>
              {pwMsg && <p className="text-[12.5px] text-emerald-300">{pwMsg}</p>}
              <Button type="submit">Update Password</Button>
            </form>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-white">Recent Leave Requests</h3>
          {leaves.length === 0 ? (
            <p className="text-sm text-slate-500">No leave requests yet.</p>
          ) : (
            <div className="space-y-2.5">
              {leaves.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-[12.5px]">
                  <div>
                    <span className="font-medium capitalize text-slate-200">{l.type}</span>
                    <span className="ml-2 text-slate-500">{l.startDate} → {l.endDate}</span>
                  </div>
                  <Badge value={l.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PortalShell>
  );
}
