import { useMemo, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { blockedReason, timeSlotsFor, todayIso } from "../lib/demo-timings";

const CONTACT_EMAIL = "info@mavunohr.co.ke";

// Used to open the visitor's mail client via mailto:, which does nothing
// visible on a device with no mail app configured -- the click just vanishes.
// Posts to /api/public/demo-requests instead, which writes a real row the
// team can see in the super-admin panel (even if the notification email
// never arrives) and pushes the lead into the Optimum Prime CRM, which
// alerts the team on WhatsApp and sends the visitor a WhatsApp confirmation
// -- both need a real name and phone number, which is why this collects
// more than just an email address.
//
// It also asks when they'd like the demo. The CRM's booking flow confirms a
// slot and sends the customer that date and time; without a preferred one to
// work from, every Mavuno request starts with a round of phone tag that the
// Tally site's equivalent form has never needed.
/** The homepage wording, unless a page that has already made the pitch passes
 *  its own — /demo has spent a whole page explaining the call by the time the
 *  form appears, so repeating "Ready to modernize your HR?" there would be
 *  asking a question the visitor has already answered. */
export function Cta({ heading, blurb }: { heading?: string; blurb?: string } = {}) {
  heading ??= "Ready to modernize your HR?";
  blurb ??= "Join the growing number of Kenyan businesses trusting Mavuno HR for accurate payroll, confident compliance, and happier employees.";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [demoDate, setDemoDate] = useState("");
  const [demoTime, setDemoTime] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  /** Back to an empty form — for someone booking a second demo, or who
   *  mistyped an address and noticed on the confirmation. */
  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setDemoDate("");
    setDemoTime("");
    setError(null);
    setStatus("idle");
  };

  const dateProblem = blockedReason(demoDate);
  const slots = useMemo(() => (dateProblem ? [] : timeSlotsFor(demoDate)), [demoDate, dateProblem]);

  // Saturday is a shorter day, so a time picked on a weekday can stop existing
  // when the date moves. Drop it rather than submitting a slot we no longer
  // offer.
  const pickDate = (value: string) => {
    setDemoDate(value);
    setError(null);
    if (demoTime && !timeSlotsFor(value).some((s) => s.value === demoTime)) setDemoTime("");
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    if (dateProblem) {
      setError(dateProblem);
      setStatus("error");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/public/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          company: company.trim() || undefined,
          demoDate: demoDate || undefined,
          demoTime: demoDate && demoTime ? demoTime : undefined,
          sourcePath: window.location.pathname,
        }),
      });
      if (res.status === 429) {
        setError("That's a lot of requests. Give it a minute and try again.");
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setError("Check your name, phone number, and email address, and try again.");
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

      <div className="max-w-2xl mx-auto px-6 relative z-10 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-secondary mb-6 tracking-tight">
          {heading}
        </h2>
        <p className="text-lg text-muted-foreground mb-10">{blurb}</p>

        {status === "sent" ? (
          /* A confirmation is not the end of the visit. This used to be two
             lines of text and nothing else — the form vanished, no button
             remained, and on a phone the card filled the screen with a dead
             end. Somebody who has just asked for a demo is the most interested
             person on the site; leaving them with nowhere to go is the one
             moment not to do it. They also do not have to wait for the call:
             the trial is self-service and available now. */
          <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border border-border text-left">
            <p className="text-lg font-semibold text-secondary">Request received.</p>
            <p className="text-muted-foreground mt-2">
              We'll reach out on WhatsApp or at {email} shortly — usually within one working day.
            </p>

            <div className="mt-6 pt-6 border-t border-border space-y-3">
              <p className="text-sm text-muted-foreground">
                You don't have to wait for us to start looking around:
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild className="flex-1">
                  <a href="/app/register">Start a free trial</a>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <a href="/features">See what it does</a>
                </Button>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
              >
                Book another demo
              </button>
            </div>
          </div>
        ) : (
          <form
            className="max-w-md mx-auto bg-white p-4 rounded-2xl shadow-xl border border-border flex flex-col gap-2.5"
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text"
                name="name"
                placeholder="Your name"
                className="text-base h-12 px-4"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                type="tel"
                name="phone"
                placeholder="WhatsApp / phone"
                className="text-base h-12 px-4"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Input
              type="email"
              name="email"
              placeholder="Work email address"
              className="text-base h-12 px-4"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="text"
              name="company"
              required
              placeholder="Company name"
              className="text-base h-12 px-4"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />

            {/* When would suit them. Required: the team confirms a slot and
                sends that date and time straight back, and a request with no
                preferred time starts with a round of phone tag instead. Date
                first, then the slots that actually exist on that day. */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                name="demoDate"
                required
                aria-label="Preferred demo date"
                min={todayIso()}
                className="text-base h-12 px-4 w-full rounded-md border border-input bg-background text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={demoDate}
                onChange={(e) => pickDate(e.target.value)}
              />
              <select
                name="demoTime"
                required
                aria-label="Preferred demo time"
                disabled={!demoDate || slots.length === 0}
                className="text-base h-12 px-4 w-full rounded-md border border-input bg-background text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                value={demoTime}
                onChange={(e) => setDemoTime(e.target.value)}
              >
                <option value="">{demoDate ? "Preferred time" : "Pick a date first"}</option>
                {slots.map((slot) => (
                  <option key={slot.value} value={slot.value}>{slot.label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground text-left -mt-1">
              {dateProblem
                ? <span className="text-red-600">{dateProblem}</span>
                : "Mon–Fri 8am–5pm, Sat 8am–1pm. We'll confirm the slot with you."}
            </p>

            <Button type="submit" size="lg" className="h-12 text-base mt-1" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Request Demo"}
            </Button>
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
