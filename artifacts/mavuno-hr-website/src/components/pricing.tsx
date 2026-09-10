import { Button } from "./ui/button";
import { Check } from "lucide-react";

const INCLUDED = [
  "Automated payroll runs & payslips",
  "PAYE, NSSF, SHIF & Affordable Housing Levy",
  "P9, P10, P10A, SHIF & NSSF returns",
  "Employee self-service portal",
  "Leave, loans & timesheets",
  "Bank & M-Pesa payment files",
  "Audit trail & Tally sync",
];

type Tier = {
  name: string;
  size: string;
  price: string;
  note?: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  { name: "Free", size: "1–5 employees", price: "KES 0" },
  { name: "Lite", size: "6–10 employees", price: "KES 1,500", note: "flat / month" },
  { name: "Starter", size: "11–20 employees", price: "KES 2,500", note: "flat / month", featured: true },
  { name: "Growth", size: "21–50 employees", price: "KES 4,000", note: "flat / month" },
  { name: "Business", size: "51–150 employees", price: "KES 7,000", note: "flat / month" },
  { name: "Enterprise", size: "150+ employees", price: "Custom", note: "talk to sales" },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-4">
          <h2 className="text-3xl md:text-5xl font-bold text-secondary mb-4 tracking-tight">
            One flat price for your team size
          </h2>
          <p className="text-lg text-muted-foreground">
            No per-payslip fees, no features locked behind a higher tier. Every plan is the
            complete Mavuno HR platform.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mb-12">
          Prices exclude 16% VAT · Billed monthly, or{" "}
          <span className="text-primary font-medium">annually with 2 months free</span>
        </p>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          {TIERS.map((t, i) => (
            <div
              key={t.name}
              className={`flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-5 ${
                i > 0 ? "border-t border-border" : ""
              } ${t.featured ? "bg-primary/5" : ""}`}
            >
              <div className="w-28 shrink-0">
                <span className="font-bold text-secondary">{t.name}</span>
                {t.featured && (
                  <span className="ml-2 align-middle text-[10px] font-semibold text-primary uppercase tracking-wide">
                    Popular
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-[8rem] text-sm text-muted-foreground">{t.size}</div>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-secondary tracking-tight">{t.price}</span>
                {t.note && <span className="text-muted-foreground text-xs ml-1">{t.note}</span>}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Go a little over your plan's size and it's KES 130–150 per extra employee until you move
          up — no bill jump the day you hire. Enterprise pricing is per active employee, negotiated.
        </p>

        <div className="mt-8 flex justify-center">
          <Button asChild size="lg">
            <a href="#demo">Start free trial</a>
          </Button>
        </div>

        {/* Free trial + includes */}
        <div className="mt-16 grid lg:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8">
            <h3 className="text-lg font-bold text-secondary mb-2">Start free</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              30-day trial on the full platform, up to 25 employees, no card required. Already run
              payroll elsewhere this year? We import your year-to-date and rebuild your P9 — free.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-8">
            <h3 className="text-lg font-bold text-secondary mb-4">Every plan includes</h3>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-secondary/90">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-12">
          On-site training and multi-entity setup available as add-ons —{" "}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary hover:underline">talk to us</a>.
        </p>
      </div>
    </section>
  );
}
