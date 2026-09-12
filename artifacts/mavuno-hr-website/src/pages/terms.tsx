import { Link } from "wouter";
import { LegalPage, Section, Bullets, Callout } from "@/components/legal-page";

/**
 * Billing terms mirror PLAN_RATES in api-server/src/lib/pricing.ts and the
 * pricing page — if the rate card moves, this moves with it. The statutory
 * accuracy section is the one that actually matters: it has to be unambiguous
 * that computing a return is not the same as being responsible for filing it.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="13 September 2026"
      intro="These terms apply when you use Mavuno HR. They are written to be read rather than skimmed, and the section on statutory accuracy is the one worth reading twice."
    >
      <Section heading="Who you are contracting with">
        <p>
          Mavuno HR is provided by <strong>Optimum Prime Solutions Ltd</strong>, a
          company registered in Kenya. By creating an account you agree to these
          terms on behalf of your organisation, and confirm you are authorised to
          do so.
        </p>
      </Section>

      <Section heading="What the service does">
        <p>
          Mavuno HR maintains employee records, runs payroll, calculates statutory
          deductions, generates payslips and returns, and produces bank and M-Pesa
          payment files. Features available on your plan are described on the{" "}
          <Link href="/features" className="text-primary font-medium hover:underline">
            features
          </Link>{" "}
          and{" "}
          <Link href="/pricing" className="text-primary font-medium hover:underline">
            pricing
          </Link>{" "}
          pages.
        </p>
      </Section>

      <Section heading="Statutory calculations, and what you remain responsible for">
        <Callout>
          <strong>
            Mavuno HR calculates and prepares your statutory obligations. It does
            not assume them.
          </strong>{" "}
          You remain the employer. The legal duty to deduct correctly, to file on
          time and to remit to the KRA, NSSF and SHIF stays with you, and any
          penalty for a late or incorrect filing is yours.
        </Callout>
        <p>
          We maintain the tax rules with care and update them as the law changes.
          But we do not provide tax, legal or accounting advice, and the software
          is not a substitute for your accountant or tax adviser. If a figure looks
          wrong to you, do not file it — tell us.
        </p>
        <p>
          Calculations depend entirely on the data you enter. A wrong salary, a
          missing KRA PIN or an out-of-date employment status will produce a wrong
          result, and we cannot detect that for you.
        </p>
        <p>
          The free PAYE calculator on this site is an estimate for illustration.
          Nothing produced by it should be relied on as a filing.
        </p>
      </Section>

      <Section heading="Plans, billing and VAT">
        <Bullets
          items={[
            "Plans are priced as a flat monthly fee by team size. Going a little over your plan's included headcount is charged per additional active employee until you move up a plan.",
            "Prices shown exclude VAT at 16%, which is added to invoices.",
            "Annual billing is charged at ten months for twelve.",
            "Organisations of five employees or fewer are free. A trial of the full platform is available for new accounts.",
            "Enterprise pricing is negotiated and a per-organisation agreed rate overrides the published rate card.",
            "Subscriptions are paid by M-Pesa. Payment is due for the period it covers.",
          ]}
        />
        <p>
          If payment lapses, access becomes read-only rather than being cut off —
          you can still see and export your records. We will not delete payroll
          data because an invoice is late.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            "Upload data you have no lawful basis to process, or use the service in breach of the Data Protection Act 2019.",
            "Attempt to access another organisation's data, or probe, scan or test the service's security without our written permission.",
            "Resell or white-label the service without a written agreement.",
            "Use automated means to place unreasonable load on the service, including the public calculator, which is rate limited.",
          ]}
        />
      </Section>

      <Section heading="Your data">
        <p>
          Your payroll data remains yours. We process it on your instructions to
          deliver the service, as set out in the{" "}
          <Link href="/privacy" className="text-primary font-medium hover:underline">
            Privacy Policy
          </Link>
          . You can export your records at any time while your account is active,
          and we will not hold them hostage.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          We aim to keep the service running continuously but do not currently
          offer a contractual uptime guarantee. Maintenance, third-party outages
          and faults will sometimes interrupt access. See{" "}
          <Link href="/security" className="text-primary font-medium hover:underline">
            Security
          </Link>{" "}
          for a frank account of what is and is not in place.
        </p>
      </Section>

      <Section heading="Ending the agreement">
        <p>
          You may stop using the service at any time. We may suspend an account
          that breaches these terms, or where required by law, and will tell you
          why unless prevented from doing so.
        </p>
        <p>
          After closure we retain payroll records unless you ask us to delete them.
          You can also delete the account yourself from Settings. That is
          scheduled rather than immediate: nothing is removed for 30 days and you
          can cancel within that window. Export anything you are required to
          retain before the date arrives — as the employer, that duty is yours.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          Nothing in these terms excludes liability that cannot lawfully be
          excluded. Subject to that, we are not liable for indirect or
          consequential loss, and our total liability for any claim is limited to
          the fees you paid us in the twelve months before it arose.
        </p>
        <p>
          These terms are governed by the laws of Kenya and the courts of Kenya
          have exclusive jurisdiction.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms; the date at the top will change and material
          changes will be notified in the application. For any question about them,
          write to{" "}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary font-medium hover:underline">
            info@mavunohr.co.ke
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
