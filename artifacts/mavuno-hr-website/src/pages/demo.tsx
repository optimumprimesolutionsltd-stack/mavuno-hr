import { PageLayout, PageHero } from "@/components/page-layout";
import { Cta } from "@/components/cta";
import { Clock, ListChecks, ShieldCheck, Sparkles } from "lucide-react";

/**
 * A real URL for "book a demo", rather than an #demo anchor on six pages.
 *
 * The anchors still exist and still work — the form is the same component — but
 * a demo request is the thing every other page is trying to produce, and an
 * anchor cannot be linked to from an email, a nav bar, or a search result. It
 * also gives us one path to measure: the form records which page it was
 * submitted from, and now "the demo page" is one of the answers.
 *
 * The "what actually happens" list is here because "book a demo" means very
 * different things to different vendors, and most of them mean a sales call.
 * Saying plainly that it is half an hour, on your own numbers, with no
 * obligation, is cheaper than having people find out.
 */

const EXPECT = [
  {
    icon: Clock,
    title: "Thirty minutes, one call",
    body: "A video call at a time you pick. No sequence of qualification calls before you see the product.",
  },
  {
    icon: ListChecks,
    title: "Your numbers, not a demo company",
    body: "Bring a few real salaries and we run a payroll end to end on them — PAYE, NSSF, SHIF, Housing Levy, payslips, the bank file. You see the actual figures for your own staff.",
  },
  {
    icon: ShieldCheck,
    title: "The awkward questions answered",
    body: "Migrating mid-year, arrears and backdated pay, non-cash benefits, staff on multiple contracts, what happens when a rate changes. Ask the thing you think will break it.",
  },
  {
    icon: Sparkles,
    title: "No obligation, and no pressure",
    body: "If Mavuno HR is wrong for how you run payroll we will say so on the call. You can also skip all of this and start a 30-day trial yourself.",
  },
];

export default function DemoPage() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Book a demo"
        title="See it run on your own payroll"
        intro="A demo of payroll software is only worth anything if it uses numbers you recognise. Bring a handful of real salaries and we will run a full month end to end while you watch."
      />

      <section className="py-20 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-secondary mb-10 text-center">
            What actually happens
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {EXPECT.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <h3 className="font-semibold text-secondary">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground text-center mt-10">
            In a hurry?{" "}
            <a href="/app/register" className="text-primary font-medium hover:underline">
              Start a 30-day trial
            </a>{" "}
            without talking to anyone — no card required.
          </p>
        </div>
      </section>

      <Cta
        heading="Tell us where to send the invite"
        blurb="We reply within one working day with a couple of times to choose from. The more you tell us now, the less of the call is spent on setup questions."
      />
    </PageLayout>
  );
}
