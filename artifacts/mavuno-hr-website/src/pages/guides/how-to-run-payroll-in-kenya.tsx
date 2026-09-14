import { Link } from "wouter";
import { GuidePage, GuideSection, FigureTable, KeyPoint } from "@/components/guide-page";
import { Cta } from "@/components/cta";

/**
 * Deliberately says nothing about rates, bands or tier ceilings — same
 * reasoning as compliance.tsx and the cost-of-hiring piece: those move with
 * each Finance Act, and a stale number in an article is worse than none. This
 * one is about the PROCESS a new employer follows, not what any deduction is
 * calculated to be, so it does not need refreshing when a rate changes.
 */
const DEADLINE_ROWS = [
  ["PAYE", "KRA (iTax)", "9th of the following month"],
  ["NSSF", "NSSF Fund", "9th of the following month"],
  ["SHIF", "SHIF", "9th of the following month"],
  ["Affordable Housing Levy", "KRA (iTax)", "9th of the following month"],
];

export default function HowToRunPayrollInKenya() {
  return (
    <GuidePage
      title="How to run payroll in Kenya"
      published="14 September 2026"
      readingMinutes={6}
      intro="Most of what goes wrong with a first payroll happens before anyone calculates a shilling — a registration nobody finished, an employee record missing a PIN, a pay date that moves every month. Get those right first and the calculation is the easy part."
    >
      <GuideSection heading="Register as an employer before your first payslip">
        <p>
          A business KRA PIN is not the same as being registered as an employer
          for PAYE — that is a separate obligation added on iTax before the
          first payroll run, not after. NSSF and SHIF each need their own
          employer registration too, each with their own number, and the
          Affordable Housing Levy rides on the PAYE registration rather than
          needing one of its own.
        </p>
        <p>
          Do all of this before you promise anyone a pay date. A registration
          that is still pending on payday does not delay the obligation to
          deduct and remit correctly — it just means you are doing it while
          also chasing paperwork.
        </p>
      </GuideSection>

      <GuideSection heading="Get one clean employee record before you run anything">
        <p>
          Each employee needs their own KRA PIN, national ID number, and bank
          or M-Pesa details on file before their first payslip — not gathered
          after the fact when a return will not file. An NSSF number an
          employee already holds from a previous employer should be recorded
          rather than treated as a fresh registration.
        </p>
        <KeyPoint>
          The single most common source of a payroll that "doesn't balance" is
          not a calculation error — it is a missing or mistyped PIN that only
          surfaces when the PAYE return is rejected weeks later.
        </KeyPoint>
      </GuideSection>

      <GuideSection heading="Fix a pay date, and do not let it move">
        <p>
          Statutory deadlines count from when pay is due, not from whenever it
          actually goes out. Every deduction below is due to its own body by
          the 9th of the month following the one it was deducted in, regardless
          of which day employees were actually paid that month.
        </p>

        <FigureTable
          caption="Every one of these falls on the same date — the 9th of the following month — which is exactly why a drifting pay date compresses the time you have to calculate, file and pay before it hits again."
          headers={["Deduction", "Paid to", "Deadline"]}
          rows={DEADLINE_ROWS}
        />

        <p>
          A pay date that drifts from the 25th one month to the 3rd the next
          does not just look disorganised to employees — it eats into the
          window you have to get everything else below done correctly.
        </p>
      </GuideSection>

      <GuideSection heading="Run it, file it, pay it — three separate steps, in that order">
        <p>
          Running payroll produces the payslips and the figures. Filing
          submits the statutory returns built from those figures. Paying
          settles what is owed with KRA, NSSF and SHIF. Treating these as one
          action is how a business ends up having filed correctly but not
          paid — which still counts as non-compliant.
        </p>
        <p>
          Check each one actually landed before moving to the next: a payslip
          issued, a return accepted (not just submitted — iTax and the fund
          portals can reject a return after submission), and a payment
          confirmed against the right reference.
        </p>
      </GuideSection>

      <GuideSection heading="What repeats every month, without fail">
        <p>
          After the first run, the cycle is the same every month: run payroll
          on the fixed pay date, issue payslips, file that month's PAYE, NSSF
          and SHIF returns, pay each body by the 9th of the following month,
          and keep the records — payslips, returns, proof of payment — for the
          period the law requires.
        </p>
        <p>
          The month this breaks down is usually the one where someone is on
          leave, an employee joined mid-month, or a deadline lands on a
          weekend. None of those change the deadline; they just mean the work
          has to happen a few days earlier than the calendar suggests.
        </p>
        <p className="text-sm border-l-2 border-border pl-4">
          This is a process guide, not tax advice, and the filing obligation
          stays with you as the employer. See the{" "}
          <Link href="/compliance" className="text-primary font-medium hover:underline">
            compliance page
          </Link>{" "}
          for what each deduction is and which return it ends up on, and the{" "}
          <Link href="/paye-calculator" className="text-primary font-medium hover:underline">
            PAYE calculator
          </Link>{" "}
          for the actual figures.
        </p>
      </GuideSection>

      <Cta />
    </GuidePage>
  );
}
