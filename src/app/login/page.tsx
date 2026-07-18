"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Input, Button, Label } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  /* If the same email exists in two orgs, the API answers 409 with the list
   * and we reveal the org picker so the person can disambiguate. */
  const [orgs, setOrgs] = useState<{ slug: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(orgSlug ? { orgSlug } : {}) }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        /* The server returned an empty body or non-JSON (typically a crash
         * from a missing DATABASE_URL or SESSION_SECRET). Surface a useful
         * message instead of a raw parse error. */
        setError(
          res.status === 500
            ? "Server error — check that DATABASE_URL and SESSION_SECRET are set"
            : `Server returned ${res.status} with no details`,
        );
        return;
      }

      if (res.status === 409 && data.code === "ORG_REQUIRED") {
        setOrgs(data.organizations as { slug: string; name: string }[]);
        setError("This email belongs to more than one organization — pick one.");
        return;
      }
      if (!res.ok) {
        setError((data.error as string) || "Unable to sign in");
        return;
      }
      router.push(params.get("next") || "/");
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
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">Admin Console</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Work Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.co.ke" autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" />
          </div>

          {orgs && (
            <div>
              <Label>Organization</Label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-slate-200"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                required
              >
                <option value="">Select organization…</option>
                {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-[12.5px] text-rose-300">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        </form>

        <p className="mt-5 text-center text-[11.5px] text-slate-500">
          Employee? Use the <a className="text-emerald-400 hover:underline" href="/portal/login">employee portal</a> instead.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
