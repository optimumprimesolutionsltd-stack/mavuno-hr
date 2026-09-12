import { Link } from "wouter";
import { PageLayout, PageHero } from "@/components/page-layout";
import { NetToGrossCalculator } from "@/components/net-to-gross-calculator";
import { Cta } from "@/components/cta";
import { Search, Layers, Wallet } from "lucide-react";

/**
 * Deliberately has no `faq` entry in the route manifest. FAQPage markup belongs
 * on exactly one page — /paye-calculator, which renders the questions — and CI
 * asserts that. Adding a second FAQ here would need the questions on the page
 * and the check updated, not just the schema.
 */
const POINTS = [
  {
    icon: Layers,
    title: "The deductions interact",
    body: "NSSF, SHIF and the Housing Levy are all taken before PAYE is worked out, so each one lowers the tax as well as the take-home. Raising the gross raises all four at once, in different proportions.",
  },
  {
    icon: Search,
    title: "So there is no formula",
    body: "PAYE is charged in progressive bands, which means the relationship between gross and net has steps in it. The answer is found by searching for the gross that lands on your target, which is what this does.",
  },
  {
    icon: Wallet,
    title: "And the real cost is higher again",
    body: "The employer contributions sit on top of the gross, not inside it. Agreeing a take-home figure without checking the employer total is the usual way a hire ends up costing more than budgeted.",
  },
];

export default function NetToGrossCalculatorPage() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Free tool"
        title="Net to gross salary calculator"
        intro="Someone has agreed to take home a particular figure. This works out the gross you need to put on the contract to get them there — and what the whole thing will actually cost you once the employer contributions are added."
      />

      <section className="pb-16 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <NetToGrossCalculator />
        </div>
      </section>

      <section className="py-16 bg-white border-y border-border">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-secondary tracking-tight mb-4">
            Why you can&rsquo;t just add the deductions back on
          </h2>
          <p className="text-muted-foreground mb-10 max-w-3xl leading-relaxed">
            The instinct is to take the net, add the PAYE, and call that the
            gross. It never works, and the gap grows with the salary.
          </p>

          <div className="grid gap-5 md:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-secondary mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mt-8 leading-relaxed">
            Going the other way — from a gross figure to take-home — is the{" "}
            <Link href="/paye-calculator" className="text-primary font-medium hover:underline">
              PAYE calculator
            </Link>
            . What each deduction is and which returns it ends up on is covered
            on the{" "}
            <Link href="/compliance" className="text-primary font-medium hover:underline">
              compliance page
            </Link>
            . As there, no rates or bands are written into this page: they move
            with each Finance Act, and the calculator reads them from the same
            statutory configuration Mavuno HR runs payroll on.
          </p>
        </div>
      </section>

      <Cta />
    </PageLayout>
  );
}
