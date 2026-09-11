import { Link } from "wouter";
import { PageLayout, PageHero } from "@/components/page-layout";
import { PayeCalculator } from "@/components/paye-calculator";
import { Cta } from "@/components/cta";
import { routeFor } from "@/site-routes";
import { Receipt, PiggyBank, HeartPulse, Home } from "lucide-react";

/**
 * The FAQ below is read from the route manifest, which is also what
 * prerender.mjs emits as FAQPage structured data. One array, so the markup and
 * the visible page cannot drift apart.
 */
const FAQ = routeFor("/paye-calculator")?.faq ?? [];

const DEDUCTIONS = [
  {
    icon: Receipt,
    name: "PAYE",
    body: "Charged on taxable income through progressive bands, then reduced by personal relief. Because it is charged on taxable income rather than gross, the deductions below change it.",
  },
  {
    icon: PiggyBank,
    name: "NSSF",
    body: "Split into Tier I and Tier II against the current earnings limits. Tax deductible, so it lowers the PAYE figure. The employer pays a matching contribution on top of gross.",
  },
  {
    icon: HeartPulse,
    name: "SHIF",
    body: "Calculated on gross pay rather than from a band table, and tax deductible. SHIF replaced NHIF, which used a fixed table of bands.",
  },
  {
    icon: Home,
    name: "Housing Levy",
    body: "Deducted from the employee and matched by the employer. The employee side is tax deductible; the employer's side is a cost on top of gross pay.",
  },
];

export default function PayeCalculatorPage() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Free tool"
        title="Kenya PAYE calculator"
        intro="Enter a monthly gross salary to see what comes out of it — PAYE, NSSF, SHIF and the Housing Levy — what lands in the employee's account, and what the whole thing actually costs you as the employer."
      />

      <section className="pb-16 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <PayeCalculator />
        </div>
      </section>

      <section className="py-16 bg-white border-y border-border">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-secondary tracking-tight mb-4">
            What comes out of a Kenyan payslip
          </h2>
          <p className="text-muted-foreground mb-10 max-w-3xl leading-relaxed">
            Four statutory deductions, and they are not independent of each
            other — three of them reduce taxable income, so getting one wrong
            quietly changes the PAYE figure too. That interaction is the usual
            source of a payroll that almost balances.
          </p>

          <div className="grid gap-5 md:grid-cols-2">
            {DEDUCTIONS.map(({ icon: Icon, name, body }) => (
              <div key={name} className="rounded-xl border border-border p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-secondary">{name}</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mt-8 leading-relaxed">
            The rates, bands and tier ceilings behind these are not written on
            this page on purpose — they move with each Finance Act and the NSSF
            phase-in schedule. The calculator reads them from the same statutory
            configuration Mavuno HR runs payroll on, so it updates when that
            does. More on how the deductions and returns fit together on the{" "}
            <Link href="/compliance" className="text-primary font-medium hover:underline">
              compliance page
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-secondary tracking-tight mb-8">
            Common questions
          </h2>
          <dl className="space-y-6">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-6 last:border-0">
                <dt className="text-lg font-semibold text-secondary mb-2">{q}</dt>
                <dd className="text-muted-foreground leading-relaxed">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Cta />
    </PageLayout>
  );
}
