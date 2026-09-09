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
  price: string;
  priceUnit: string;
  minimum: string;
  bestFor: string;
  support: string;
  onboarding: string;
  cta: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    price: "KES 200",
    priceUnit: "/ employee / month",
    minimum: "Minimum KES 3,500 / month",
    bestFor: "1–40 employees",
    support: "Email support, next business day",
    onboarding: "Self-serve onboarding",
    cta: "Start free trial",
  },
  {
    name: "Growth",
    price: "KES 150",
    priceUnit: "/ employee / month",
    minimum: "Minimum KES 12,000 / month",
    bestFor: "40–150 employees",
    support: "Priority email support, same day",
    onboarding: "Guided onboarding (KES 15,000, waived on annual)",
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "From KES 110",
    priceUnit: "/ employee / month",
    minimum: "Minimum KES 75,000 / month",
    bestFor: "150+ employees",
    support: "Dedicated account manager + SLA",
    onboarding: "Scoped onboarding, SSO & API access",
    cta: "Talk to sales",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-6">
          <h2 className="text-3xl md:text-5xl font-bold text-secondary mb-4 tracking-tight">
            Simple, per-employee pricing
          </h2>
          <p className="text-lg text-muted-foreground">
            You pay for active employees each month. Every plan includes the entire platform —
            no features locked behind a higher tier.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mb-14">
          Prices exclude 16% VAT · Billed monthly, or <span className="text-primary font-medium">annually with 2 months free</span>
        </p>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border bg-white p-8 flex flex-col ${
                t.featured
                  ? "border-primary shadow-xl md:-mt-4 md:mb-4"
                  : "border-border shadow-sm"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  Most popular
                </span>
              )}

              <h3 className="text-xl font-bold text-secondary">{t.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t.bestFor}</p>

              <div className="mt-6">
                <span className="text-4xl font-extrabold text-secondary tracking-tight">{t.price}</span>
                <span className="text-muted-foreground text-sm ml-1">{t.priceUnit}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t.minimum}</p>

              <ul className="mt-6 space-y-3 text-sm text-secondary/90">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  {t.support}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  {t.onboarding}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  The complete Mavuno HR platform
                </li>
              </ul>

              <Button
                asChild
                variant={t.featured ? "default" : "outline"}
                size="lg"
                className="mt-8 w-full"
              >
                <a href="#demo">{t.cta}</a>
              </Button>
            </div>
          ))}
        </div>

        {/* Free trial + includes */}
        <div className="mt-16 grid lg:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8">
            <h3 className="text-lg font-bold text-secondary mb-2">Start free</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              30-day free trial, up to 25 employees, full platform. No card required. Convert to any
              plan when you're ready — your data stays exactly where it is.
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
          Monthly charge = the greater of the plan minimum or the per-employee rate × active
          employees. Historical data migration and on-site training available as add-ons —{" "}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary hover:underline">talk to us</a>.
        </p>
      </div>
    </section>
  );
}
