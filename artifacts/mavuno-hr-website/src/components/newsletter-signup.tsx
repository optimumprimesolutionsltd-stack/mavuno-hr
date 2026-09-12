import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

/**
 * Newsletter signup.
 *
 * Posts to /api/public/newsletter, which upserts on lower(email) so a repeat
 * submission is a no-op rather than a duplicate — people do forget they have
 * already signed up, and a list with the same address three times is worse than
 * useless once it is being mailed.
 *
 * The promise made here is narrow on purpose: statutory changes, not "news".
 * The KRA and NSSF move rates with little warning and that is the one thing a
 * Kenyan payroll administrator genuinely wants an email about. Promising less
 * makes the list easier to keep and harder to resent.
 *
 * Rendered at build time in its empty state, identical on both sides of
 * hydration.
 */
export function NewsletterSignup({ pagePath }: { pagePath?: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          pagePath:
            pagePath ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
        }),
      });
      if (res.status === 429) {
        setError("Too many requests just now. Try again in a minute.");
      } else if (!res.ok) {
        setError("That did not go through. Please try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="newsletter" className="rounded-2xl border border-border bg-muted/40 p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
        <div className="md:flex-1">
          <h3 className="flex items-center gap-2 font-semibold text-secondary mb-2">
            <Mail className="h-4 w-4 text-primary" />
            Kenyan payroll changes, in your inbox
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When PAYE bands, SHIF, NSSF or the Housing Levy change, we send a
            short email explaining what moved and what it does to your payroll.
            Nothing else. Unsubscribe in one click.
          </p>
        </div>

        <div className="md:w-[22rem] md:flex-shrink-0">
          {sent ? (
            <p className="flex items-start gap-2 text-sm text-secondary">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              <span>
                You are on the list. We only write when something actually
                changes.
              </span>
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-label="Email address"
                  placeholder="you@company.co.ke"
                  className="bg-white"
                />
                <Button type="submit" disabled={busy} className="flex-shrink-0">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
