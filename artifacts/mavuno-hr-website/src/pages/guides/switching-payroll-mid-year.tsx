import { Link } from "wouter";
import { GuidePage, GuideSection, FigureTable, KeyPoint } from "@/components/guide-page";
import { Cta } from "@/components/cta";

/**
 * Deliberately no rates, bands or ceilings — same rule as the other guides.
 * This one is about the PROCESS of moving payroll systems part-way through a
 * tax year, so it stays correct across Finance Acts and NSSF phase-ins.
 *
 * The one hard requirement it describes — that a P9 covers the whole year
 * regardless of which system produced each month — is a property of how the
 * KRA works, not a number, so it does not rot.
 */
const CARRY_ROWS = [
  ["Gross pay, month by month", "Every month from January", "The P9 totals it for the year"],
  ["PAYE already deducted", "Every month from January", "Understating it overstates what is still owed"],
  ["NSSF, SHIF and Housing Levy", "Every month from January", "They reduce taxable pay, so they change the tax"],
  ["Personal relief already claimed", "Every month from January", "Claiming it twice in one year is a real risk"],
  ["Leave already taken", "Current leave year", "Otherwise everyone starts again on a full entitlement"],
  ["Loan and advance balances", "Outstanding only", "The balance matters; the history does not"],
];

export default function SwitchingPayrollMidYear() {
  return (
    <GuidePage
      title="Switching payroll systems mid-year without breaking your P9s"
      published="15 September 2026"
      readingMinutes={7}
      intro="Nobody changes payroll system in January. It happens in June, because the current one finally broke something — and the year-to-date figures sitting in the old system are suddenly the thing standing between you and a clean P9 in December."
    >
      <GuideSection heading="The problem is the year, not the month">
        <p>
          A payroll system only has to get one month right at a time. The KRA
          does not work that way. A P9 covers a full calendar year, and it has
          to reconcile with what was actually deducted and remitted across that
          whole year — including the months your new system has never seen.
        </p>
        <p>
          So the risk in a mid-year switch is not the first payroll you run in
          the new system. That one is usually fine. The risk arrives in
          December, when you produce P9s that start from the month you migrated
          and quietly omit everything before it. Every employee's income looks
          understated, their tax paid looks understated, and the first person to
          notice is whoever is trying to file.
        </p>
        <KeyPoint>
          If your new system cannot hold the months that happened before you
          arrived, you do not have a payroll system for this year. You have one
          for next year, and a spreadsheet to get you through December.
        </KeyPoint>
      </GuideSection>

      <GuideSection heading="What actually has to come across">
        <p>
          Less than people expect, but the list is not negotiable. Everything
          here changes a figure the KRA will eventually see, or a balance an
          employee will notice:
        </p>

        <FigureTable
          caption="What to carry from the old system when you move part-way through a year, and why each one matters."
          headers={["What", "How far back", "Why it matters"]}
          rows={CARRY_ROWS}
        />

        <p>
          Note what is <em>not</em> on that list. You do not need every payslip
          PDF, every historical bank file, or three years of archived runs. The
          old system can keep those. What you need is enough to make this year's
          totals correct and this year's balances continuous.
        </p>
      </GuideSection>

      <GuideSection heading="Historical months are records, not payroll runs">
        <p>
          This is the distinction that makes a mid-year switch safe, and the one
          most systems get wrong.
        </p>
        <p>
          The months before your switch have already happened. The employees
          were paid. The deductions were remitted. The filings were made, by
          whoever was running payroll at the time. Loading those months into a
          new system must therefore record what happened — and must not pay
          anybody again, file anything again, or email a payslip for a month
          that was settled in March.
        </p>
        <p>
          Mavuno HR treats them as exactly that. A month recorded as historical
          counts towards year-to-date figures and P9s, and is deliberately
          excluded from filing reminders, payout batches and automatic payslip
          emails. You tell it which month you became the system of record, and
          everything before that is a record rather than an instruction.
        </p>
        <KeyPoint>
          Ask any payroll system you are evaluating what happens when you load a
          month that has already been paid. If the honest answer is "it would
          generate a payment batch", you will be doing this year's P9s by hand.
        </KeyPoint>
      </GuideSection>

      <GuideSection heading="Leave balances are the one people forget">
        <p>
          Tax gets the attention because the KRA is on the other end of it.
          Leave quietly costs more, because nobody notices until somebody
          resigns.
        </p>
        <p>
          A new system that starts everyone on a full annual entitlement has
          just given your whole team their leave twice — once under the old
          system, where they already took some of it, and again under the new
          one. That is a real liability, and it crystallises the day you pay
          somebody out for untaken days they had in fact already taken.
        </p>
        <p>
          The fix is to enter the balance each employee had{" "}
          <strong className="text-secondary">remaining</strong> at the switch,
          not their annual entitlement. It is an opening balance, in the
          accounting sense, and treating it as anything else is how a leave
          liability appears from nowhere at year end.
        </p>
      </GuideSection>

      <GuideSection heading="A sequence that works">
        <p>
          <strong className="text-secondary">Pick the cutover month first</strong>{" "}
          and write it down. Everything before it is history; everything from it
          onwards is live. Ambiguity here is what produces a month that gets
          paid twice or filed twice.
        </p>
        <p>
          <strong className="text-secondary">Load employees before months.</strong>{" "}
          A historical run needs someone to attach itself to, and an employee
          record missing a KRA PIN will fail validation whichever month you are
          loading.
        </p>
        <p>
          <strong className="text-secondary">
            Reconcile one month before loading twelve.
          </strong>{" "}
          Load a single historical month, then compare its totals against what
          the old system reported for that month. If they disagree, find out why
          before repeating the mistake eleven more times.
        </p>
        <p>
          <strong className="text-secondary">
            Run the first live month in parallel.
          </strong>{" "}
          Run it in both systems and compare before paying anyone. It is the
          only test that matters, and it costs one afternoon.
        </p>
        <p>
          <strong className="text-secondary">
            Check a P9 before December, not in December.
          </strong>{" "}
          Produce one for a single employee as soon as the historical months are
          in. If it covers the whole year and reconciles, the migration worked.
          If it starts at your cutover month, you have found the problem in
          August rather than in the filing window.
        </p>
      </GuideSection>

      <GuideSection heading="When to just wait for January">
        <p>
          Sometimes the right answer is not to migrate now. If you are already
          in the last quarter, the old system is working, and nothing is
          actually broken, running the remainder of the year where you are and
          starting clean in January is a legitimate choice — and a much shorter
          project.
        </p>
        <p>
          Migrate mid-year when the current system is the problem: when it is
          producing wrong figures, when the person who understood it has left,
          or when the cost of one more month of it exceeds the cost of moving.
          Do not migrate mid-year merely because a contract renews.
        </p>
      </GuideSection>

      <GuideSection heading="Where Mavuno HR fits">
        <p>
          Mavuno HR is built for Kenyan payroll specifically — PAYE, NSSF, SHIF
          and the Housing Levy, with statutory rates applied from the pack in
          force for the month being run, not the month you happen to be sitting
          in. That last part is what lets a historical month recompute to what
          it actually was rather than to today's rates.
        </p>
        <p>
          Mid-year migration is a supported path rather than a workaround: you
          set the month Mavuno becomes your system of record, load the earlier
          months as historical runs one at a time or by CSV, and your P9s and
          year-to-date figures cover the whole year. You can{" "}
          <Link href="/pricing" className="text-primary font-medium hover:underline">
            see what it costs
          </Link>{" "}
          or{" "}
          <a href="/app/register" className="text-primary font-medium hover:underline">
            start a free trial
          </a>{" "}
          and load a single historical month to see whether the totals
          reconcile before committing to anything.
        </p>
      </GuideSection>

      <Cta
        heading="Moving payroll part-way through the year?"
        blurb="Show us the months you need to carry across and we will run one of them with you, on your own figures, before you decide anything."
      />
    </GuidePage>
  );
}
