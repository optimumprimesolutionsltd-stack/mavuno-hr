"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Label } from "@/components/ui";

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      /* Same login endpoint as the admin app — one session system, RBAC decides
       * what a given account can see. There is no separate "portal auth". */
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        setError(
          res.status === 500
            ? "Server error — check that DATABASE_URL and SESSION_SECRET are set"
            : `Server returned ${res.status} with no details`,
        );
        return;
      }
      if (!res.ok) {
        setError((data.error as string) || "Unable to sign in");
        return;
      }
      router.push("/portal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070c] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-black text-black shadow-lg shadow-emerald-500/25">
            Z
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">ZawadiHR</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">Employee Portal</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Work Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.co.ke" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-[12.5px] text-rose-300">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-[11.5px] text-slate-500">
          Ask HR for your portal credentials if you haven&apos;t received them.
        </p>
      </div>
    </div>
  );
}
