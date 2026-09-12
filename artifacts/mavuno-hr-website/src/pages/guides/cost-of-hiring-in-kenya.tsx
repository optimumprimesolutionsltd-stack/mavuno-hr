import { Link } from "wouter";
import { GuidePage, GuideSection, FigureTable, KeyPoint } from "@/components/guide-page";
import { Cta } from "@/components/cta";

/**
 * Every figure in this piece was computed by the production payroll engine
 * through /api/public/calculator on the date in FIGURES_DATE, using the
 * statutory pack named in FIGURES_PACK. They are not illustrative and they were
 * not typed from memory.
 *
 * Deliberately no rates, bands, tiers or ceilings appear in the prose — only
 * computed totals. Rates move with each Finance Act and the NSSF phase-in, and
 * a stale percentage in an article is worse than no article. The structural
 * claims that do appear (PAYE is progressive; NSSF is capped; the Housing Levy
 * has no ceiling) are properties of the design rather than values, so they
 * survive a rate change.
 *
 * If these numbers are refreshed, rerun them against the live endpoint rather
 * than adjusting by hand, and move FIGURES_DATE with them.
 */
const FIGURES_DATE = "13 September 2026";
const FIGURES_PACK = "Kenya FY2025/26 (Finance Act 2025 / TLAA 2024)";

const GROSS_ROWS = [
  ["30,000", "26,193.75", "32,300.00", "+23%"],
  ["50,000", "39,029.15", "53,800.00", "+38%"],
  ["80,000", "58,212.65", "85,570.00", "+47%"],
  ["120,000", "85,022.65", "126,170.00", "+48%"],
  ["200,000", "138,642.65", "207,370.00", "+50%"],
];

const NET_ROWS = [
  ["30,000", "35,654.60", "38,378.70", "+28%"],
  ["50,000", "67,462.55", "72,572.24", "+45%"],
  ["100,000", "142,345.91", "148,851.10", "+49%"],
];

const ONCOST_ROWS = [
  ["30,000", "2,300.00", "7.7%"],
  ["50,000", "3,800.00", "7.6%"],
  ["80,000", "5,570.00", "7.0%"],
  ["120,000", "6,170.00", "5.1%"],
  ["200,000", "7,370.00", "3.7%"],
];

export default function CostOfHiringInKenya() {
  return (
    <GuidePage
      title="What a hire actually costs in Kenya"
      published="13 September 2026"
      readingMinutes={6}
      intro="When you agree a salary with someone, you have agreed to a number that neither of you will ever see on a bank statement. You will pay more than it. They will receive less. The distance between those two figures is wider than most employers expect, and it grows as salaries rise."
    >
      <GuideSection heading="There are three numbers, not one">
        <p>
          Every hire has three figures attached to it, and confusing them is how
          a payroll budget goes wrong:
        </p>
        <p>
          <strong className="text-secondary">Employer cost</strong> — what leaves
          your account.{" "}
          <strong className="text-secondary">Gross salary</strong> — the number
          on the contract.{" "}
          <strong className="text-secondary">Net pay</strong> — what reaches the
          employee.
        </p>
        <p>
          Here is what those look like on real figures, computed from the same
          rules Mavuno HR runs payroll on:
        </p>

        <FigureTable
          caption={`All amounts in KES per month. Computed ${FIGURES_DATE} using ${FIGURES_PACK}, for a resident employee on a full month with no pension, HELB or insurance relief. The last column is how far the employer's cost sits above what the employee actually receives.`}
          headers={["Gross", "Employee receives", "You pay", "Gap"]}
          rows={GROSS_ROWS}
          highlightLast
        />

        <KeyPoint>
          At the bottom of that table a salary costs you about 23% more than the
          employee gets. At the top it costs you roughly <strong>half as much
          again</strong>. The number you shook hands on sits somewhere in the
          middle, drifting further from both ends as the salary rises.
        </KeyPoint>
      </GuideSection>

      <GuideSection heading="Why the gap widens">
        <p>
          Two things pull in opposite directions, and the net effect surprises
          people.
        </p>
        <p>
          <strong className="text-secondary">PAYE is progressive.</strong> It is
          charged in bands, and each additional slice of salary is taxed at a
          higher rate than the one below it. So as gross rises, the employee
          keeps a steadily smaller share of each extra shilling.
        </p>
        <p>
          <strong className="text-secondary">
            But your own contributions do not rise in step.
          </strong>{" "}
          NSSF is capped: above a certain earnings level the employer
          contribution stops growing entirely. The Housing Levy has no such
          ceiling, and NITA is a flat charge per employee. Put together, your
          on-cost as a share of gross actually <em>falls</em> as salary rises:
        </p>

        <FigureTable
          caption={`KES per month. "On-cost" is employer contributions on top of gross — the NSSF employer share, the employer side of the Housing Levy, and NITA. Same computation date and pack as above.`}
          headers={["Gross", "Your on-cost", "As % of gross"]}
          rows={ONCOST_ROWS}
        />

        <p>
          So the widening gap between what you pay and what they receive is not
          driven by your contributions. It is almost entirely tax. By the time
          you are paying someone 200,000 a month, the difference between your
          cost and their take-home is close to 69,000 — and only about 7,400 of
          that is yours. The rest went to the KRA before the employee saw it.
        </p>
      </GuideSection>

      <GuideSection heading="If you agree a net salary, you have agreed to an unknown number">
        <p>
          Plenty of Kenyan hiring conversations happen in take-home terms.{" "}
          <em>"I need to clear 50,000."</em> It is a reasonable thing for a
          candidate to say, and it is a dangerous thing to agree to casually,
          because the number you have actually committed to is not 50,000 and
          cannot be worked out in your head.
        </p>

        <FigureTable
          caption={`KES per month. The gross required to produce each take-home figure, and what that gross then costs you. Same computation date and pack as above.`}
          headers={["They take home", "Gross needed", "You pay", "Above agreed"]}
          rows={NET_ROWS}
          highlightLast
        />

        <KeyPoint>
          Agreeing to a take-home of 100,000 commits you to nearly{" "}
          <strong>149,000</strong> a month — almost half as much again as the
          figure discussed. Over a year that is a difference of about 586,000
          against a budget built on the number in the conversation.
        </KeyPoint>

        <p>
          You cannot arrive at that by adding the deductions back on, either. The
          statutory deductions come out <em>before</em> PAYE is calculated, so
          raising the gross raises the tax, which raises the gross needed again.
          It settles, but only by searching for it — which is what the{" "}
          <Link
            href="/net-to-gross-calculator"
            className="text-primary font-medium hover:underline"
          >
            net to gross calculator
          </Link>{" "}
          does.
        </p>
      </GuideSection>

      <GuideSection heading="The costs that get forgotten">
        <p>
          The figures above cover statutory deductions only. A realistic hiring
          budget also carries things payroll never sees: recruitment, equipment,
          any medical cover you provide above SHIF, training, and leave —
          statutory annual leave means you are paying for roughly eleven months
          of attendance and receiving twelve months of salary cost.
        </p>
        <p>
          There is also the employer's obligation that does not appear as a
          deduction at all: you must be able to produce the records. P9s, P10s
          and the returns behind them can be asked for years after an employee
          has left, which makes payroll history something to keep rather than
          something to run and forget.
        </p>
      </GuideSection>

      <GuideSection heading="What to do with this">
        <p>
          Three practical habits, none of which need software to adopt:
        </p>
        <p>
          <strong className="text-secondary">Budget from employer cost</strong>,
          not from gross and certainly not from net. It is the only one of the
          three numbers that matches what leaves your account.
        </p>
        <p>
          <strong className="text-secondary">
            Quote gross in offers, and say so.
          </strong>{" "}
          If a candidate negotiates in take-home terms, convert it before you
          agree rather than after — and tell them what the gross will be, so
          nobody is surprised by their first payslip.
        </p>
        <p>
          <strong className="text-secondary">
            Recheck after every Finance Act.
          </strong>{" "}
          The bands, the NSSF ceiling and the levies all move, and they move
          independently. A cost model built on last year's rules will be wrong in
          a direction you did not choose.
        </p>
        <p>
          You can check any figure in this article yourself with the{" "}
          <Link
            href="/paye-calculator"
            className="text-primary font-medium hover:underline"
          >
            PAYE calculator
          </Link>{" "}
          — it shows the employer total alongside take-home. What each deduction
          is and which return it ends up on is set out on the{" "}
          <Link href="/compliance" className="text-primary font-medium hover:underline">
            compliance page
          </Link>
          .
        </p>
        <p className="text-sm border-l-2 border-border pl-4">
          Figures computed {FIGURES_DATE} using {FIGURES_PACK}, for a resident
          employee on a full month with no pension, HELB or insurance relief.
          They are an estimate to illustrate the shape of the problem, not tax
          advice, and your own numbers will differ. The filing obligation stays
          with you as the employer.
        </p>
      </GuideSection>

      <Cta />
    </GuidePage>
  );
}
