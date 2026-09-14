import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const CONTACT_EMAIL = "info@mavunohr.co.ke";

// Used to open the visitor's mail client via mailto:, which does nothing
// visible on a device with no mail app configured -- the click just vanishes.
// Posts to /api/public/demo-requests instead, which writes a real row the
// team can see in the super-admin panel even if the notification email
// never arrives.
export function Cta() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/public/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          company: company.trim() || undefined,
          sourcePath: window.location.pathname,
        }),
      });
      if (res.status === 429) {
        setError("That's a lot of requests. Give it a minute and try again.");
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setError("Enter a valid work email address.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Could not reach the server. Check your connection and try again, or email us directly.");
      setStatus("error");
    }
  }

  return (
    <section id="demo" className="py-32 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <h2 className="text-5xl md:text-6xl font-extrabold text-secondary mb-6 tracking-tight">
          Ready to modernize your HR?
        </h2>
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Join the growing number of Kenyan businesses trusting Mavuno HR for accurate payroll, confident compliance, and happier employees.
        </p>

        {status === "sent" ? (
          <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border border-border">
            <p className="text-lg font-semibold text-secondary">Request received.</p>
            <p className="text-muted-foreground mt-2">We'll reach out at {email} shortly.</p>
          </div>
        ) : (
          <form
            className="max-w-md mx-auto bg-white p-2 rounded-2xl shadow-xl border border-border flex flex-col gap-2"
            onSubmit={handleSubmit}
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                name="email"
                placeholder="Work email address"
                className="border-0 focus-visible:ring-0 shadow-none text-base h-14 px-6"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" size="lg" className="h-14 px-8 text-base shrink-0" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Request Demo"}
              </Button>
            </div>
            <Input
              type="text"
              name="company"
              placeholder="Company name (optional)"
              className="border-0 focus-visible:ring-0 shadow-none text-base h-12 px-6"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>
        )}

        {status !== "sent" && (
          <p className="mt-6 text-sm text-muted-foreground">
            No credit card required. Fast, free onboarding setup. Or email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        )}
      </div>
    </section>
  );
}
