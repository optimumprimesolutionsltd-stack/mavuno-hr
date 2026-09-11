import { PageLayout, PageHero } from "@/components/page-layout";
import { Compliance } from "@/components/compliance";
import { Cta } from "@/components/cta";
import { Receipt, PiggyBank, HeartPulse, Home, FileCheck2 } from "lucide-react";

/**
 * Deliberately describes WHAT is deducted and filed, never the rates, bands or
 * tier ceilings. Those move with each Finance Act and the NSSF phase-in
 * schedule, and a stale number on a compliance page is worse than no number —
 * the rate card that is actually applied lives server-side in the statutory
 * packs, which is the only place it should be written down.
 */
const DEDUCTIONS = [
  {
    icon: Receipt,
    name: "PAYE",
    body: "Pay As You Earn across the current KRA bands, with personal relief, insurance relief and pension relief applied in the right order. Taxable pay is built from the benefits and allowances you have actually configured, not a flat assumption.",
  },
  {
    icon: PiggyBank,
    name: "NSSF",
    body: "Tier I and Tier II handled separately, following the phased upper-limit schedule rather than a single hardcoded ceiling. Employer and employee halves are computed and reported apart, because the returns need them apart.",
  },
  {
    icon: HeartPulse,
    name: "SHIF",
    body: "The Social Health Insurance Fund deduction that replaced NHIF, calculated on gross pay for every active employee and carried into the monthly return in the format the fund expects.",
  },
  {
    icon: Home,
    name: "Affordable Housing Levy",
    body: "The AHL employee deduction and the matching employer contribution, both tracked from the first payroll run so the employer share never gets discovered at year end.",
  },
];

const RETURNS = [
  "P9 — the annual tax deduction card each employee needs to file their own return",
  "P10 and P10A — the employer's annual PAYE return, in iTax-ready format",
  "Monthly SHIF and NSSF returns, per fund, in each fund's expected layout",
  "Payslips as PDFs, per employee, per period, reproducible after the fact",
];

export default function CompliancePage() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Statutory Compliance"
        title="Kenyan statutory deductions, calculated and filed"
        intro="PAYE, NSSF, SHIF and the Affordable Housing Levy are not four settings — they are four different rulebooks that change on different schedules. Mavuno HR keeps them current so a Finance Act does not become a payroll rewrite."
      />

      <section className="pb-8 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-secondary tracking-tight mb-4">
            What gets deducted, and how
          </h2>
          <p className="text-muted-foreground mb-10 max-w-3xl leading-relaxed">
            Every statutory line is computed per employee, per period, from that
            period's configured rules — so a run from eight months ago still
            recomputes to the same figures it produced then.
          </p>

          <div className="grid gap-5 md:grid-cols-2">
            {DEDUCTIONS.map(({ icon: Icon, name, body }) => (
              <div
                key={name}
                className="rounded-xl border border-border bg-white p-6 hover:border-primary/40 transition-colors"
              >
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
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-secondary tracking-tight mb-4">
            The returns that come out of it
          </h2>
          <p className="text-muted-foreground mb-8 max-w-3xl leading-relaxed">
            Deducting correctly is half the job. These are generated from the same
            payroll data, so the filing and the payslips can never disagree.
          </p>
          <ul className="space-y-3">
            {RETURNS.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <FileCheck2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-secondary leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mt-10 leading-relaxed border-l-2 border-border pl-4">
            Mavuno HR automates the calculation and the paperwork. It does not
            replace your accountant or tax adviser, and the filing obligation
            stays with you as the employer.
          </p>
        </div>
      </section>

      <Compliance />
      <Cta />
    </PageLayout>
  );
}
