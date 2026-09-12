import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { CheckCircle2, Loader2 } from "lucide-react";

const CONTACT_EMAIL = "info@mavunohr.co.ke";

/**
 * Book a demo.
 *
 * This used to be one email field whose submit handler set window.location to a
 * mailto: — so the button asked people to compose an email, and on a phone with
 * no mail client configured it did nothing visible at all. It now posts to
 * /api/public/demo-request, which stores the enquiry so the CRM can mirror it
 * into the leads pipeline.
 *
 * Asking for more than an address is deliberate. A bare email is a lead nobody
 * can act on; a name, a company and a rough headcount is one somebody can
 * actually prepare for. Everything past name and email is optional, so the
 * extra fields cost a determined visitor nothing.
 *
 * Prerendered with an empty form and no result, so the markup is identical on
 * both sides of hydration.
 */
export function Cta({
  heading = "Book a demo",
  blurb = "Half an hour, your numbers, no obligation. We will run a payroll end to end and answer the awkward questions about your own setup.",
}: {
  /** Overridable so /demo, which already says this in its <h1>, can vary it. */
  heading?: string;
  blurb?: string;
} = {}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          company: String(form.get("company") ?? "").trim() || undefined,
          phone: String(form.get("phone") ?? "").trim() || undefined,
          employeeCount: String(form.get("employeeCount") ?? "").trim() || undefined,
          // Which page converted. The guide and the calculators are meant to be
          // doing work; this is how we find out whether they are.
          pagePath: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      if (res.status === 429) {
        setError("Too many requests just now. Give it a minute and try again.");
      } else if (!res.ok) {
        setError("That did not go through. Please try again, or email us directly.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not reach us. Check your connection, or email us directly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="demo" className="py-32 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto px-6 relative z-10 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-secondary mb-6 tracking-tight">
          {heading}
        </h2>
        <p className="text-lg text-muted-foreground mb-10">{blurb}</p>

        {sent ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-left">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-secondary mb-1">
                  Got it — we will be in touch.
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Someone will reply within one working day to arrange a time. If
                  it is urgent, email{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                    {CONTACT_EMAIL}
                  </a>{" "}
                  and say so.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-xl border border-border p-6 md:p-8 text-left space-y-4"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-secondary mb-1.5">Your name</span>
                <Input name="name" required autoComplete="name" placeholder="Jane Wanjiru" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-secondary mb-1.5">Work email</span>
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="jane@company.co.ke"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-secondary mb-1.5">
                  Company <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <Input name="company" autoComplete="organization" placeholder="Company Ltd" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-secondary mb-1.5">
                  Phone <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <Input name="phone" type="tel" autoComplete="tel" placeholder="07xx xxx xxx" />
              </label>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-secondary mb-1.5">
                How many employees?{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <select
                name="employeeCount"
                defaultValue=""
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              >
                <option value="">Select a range</option>
                <option value="1-5">1–5</option>
                <option value="6-20">6–20</option>
                <option value="21-50">21–50</option>
                <option value="51-150">51–150</option>
                <option value="150+">150+</option>
              </select>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" size="lg" className="w-full h-12" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Request a demo"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              We use this to contact you about Mavuno HR and nothing else. Or
              email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
