import { Link } from "wouter";
import { LegalPage, Section, Bullets, Callout } from "@/components/legal-page";

/**
 * Written against what the system actually does, not a template. Every data
 * category below exists in lib/db/src/schema, every processor named is one the
 * code actually calls, and the retention section says plainly that automated
 * erasure is not built yet rather than promising a process that does not exist.
 * If any of that changes, this page changes with it.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="12 September 2026"
      intro="Mavuno HR is payroll software, so almost everything in it is personal data about someone. This page sets out exactly what we hold, who it is shared with, and what you can ask us to do about it."
    >
      <Section heading="Who is responsible for your data">
        <p>
          Mavuno HR is operated by <strong>Optimum Prime Solutions Ltd</strong>,
          Nairobi, Kenya. The distinction that matters most under the Data
          Protection Act 2019 is this one:
        </p>
        <Bullets
          items={[
            <>
              <strong>Your employer is the data controller</strong> for employee
              records — salaries, KRA PINs, bank details and so on. They decide
              what to collect and why.
            </>,
            <>
              <strong>We are the data processor</strong> for that information. We
              hold and compute it on your employer's instructions and do not use
              it for our own purposes.
            </>,
            <>
              <strong>We are the controller</strong> only for the account itself —
              the person who signs up, their login, billing records and support
              correspondence.
            </>,
          ]}
        />
        <p>
          If you are an employee and want your own record corrected or removed,
          speak to your employer first. They control it; we act on their
          instruction.
        </p>
      </Section>

      <Section heading="What we hold">
        <p>For employees on a customer's payroll:</p>
        <Bullets
          items={[
            "Identity — name, date of birth, gender, national ID number, nationality and residence status.",
            "Statutory identifiers — KRA PIN, NSSF number and SHIF number.",
            "Contact details — email, phone number, region, and next-of-kin name, relationship, phone and email.",
            "Employment details — employee number, department, position, employment type, hire and termination dates, education level and working pattern.",
            "Payment details — bank name, branch, account number and M-Pesa number.",
            "Pay data — basic salary, allowances, benefits, pension and insurance contributions, HELB and SACCO deductions, mortgage interest, loans, timesheets and leave balances.",
            "Payroll history — every payslip, run and statutory filing generated, retained so a past period can be recomputed and audited.",
            "Documents uploaded in support of leave requests.",
          ]}
        />
        <p>For the account holder and administrators:</p>
        <Bullets
          items={[
            "Name, email address and a password stored as an Argon2id hash. We never store your password itself.",
            "Billing records, including M-Pesa payment references and receipt numbers.",
            <>
              An audit trail of significant actions, recording who did what and
              when, <strong>including the IP address</strong> the action came
              from. This exists so payroll changes can be traced, and it is
              designed to be tamper-evident — see{" "}
              <Link href="/security" className="text-primary font-medium hover:underline">
                Security
              </Link>
              .
            </>,
          ]}
        />
        <p>
          The public PAYE calculator is deliberately excluded from all of this. It
          takes a salary figure, computes a result and stores nothing. No account
          is required and no record of the calculation is kept.
        </p>
      </Section>

      <Section heading="Who else processes it">
        <p>
          We do not sell personal data and we do not share it for advertising. We
          use a small number of service providers, each of which processes data
          only to deliver part of the product:
        </p>
        <Bullets
          items={[
            <><strong>Render</strong> — hosting and the database where all customer data is stored.</>,
            <><strong>Clerk</strong> — authentication and session management for the application.</>,
            <><strong>Resend</strong> — transactional email such as payslip notifications, receipts and password resets.</>,
            <><strong>Safaricom</strong> — M-Pesa payment processing for subscription payments. Safaricom receives the paying phone number and amount, not employee records.</>,
            <><strong>Cloudflare</strong> — DNS and email routing for our own domain.</>,
          ]}
        />
        <p>
          Some of these operate servers outside Kenya, so your data may be
          transferred abroad. We also disclose information where the law requires
          it — for example where a statutory filing has to reach the KRA, NSSF or
          SHIF, which is the point of the product.
        </p>
        <Callout>
          A limited, read-only summary of each organisation's subscription — name,
          plan and employee count — is shared with our own internal CRM so we can
          manage billing. No employee records, salaries or identifiers are
          included in that transfer.
        </Callout>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Payroll records are kept for as long as the account is active, because
          statutory returns must be reproducible years after the fact and Kenyan
          tax law requires employers to retain records.
        </p>
        <Callout>
          <strong>Being straight with you:</strong> we have not yet built
          automated deletion or a fixed retention schedule. Today, erasure is done
          manually when you ask us. If you close your account and want your data
          removed, email us and we will action it — it will not happen
          automatically. We are working on making this self-service.
        </Callout>
      </Section>

      <Section heading="Your rights under the Data Protection Act 2019">
        <p>If you are in Kenya, the Act gives you the right to:</p>
        <Bullets
          items={[
            "Be informed of how your data is being used — which is what this page is for.",
            "Access a copy of the personal data we hold about you.",
            "Have inaccurate or misleading data corrected.",
            "Have your data deleted, subject to records we are legally required to keep.",
            "Object to processing, and to withdraw consent where processing relies on it.",
          ]}
        />
        <p>
          To exercise any of these, email{" "}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary font-medium hover:underline">
            info@mavunohr.co.ke
          </a>
          . If you are an employee rather than our direct customer, we will
          normally need to refer your request to your employer, since they are the
          controller of that record.
        </p>
        <p>
          If you are not satisfied with how we handle a request, you may complain
          to the Office of the Data Protection Commissioner, which regulates data
          protection in Kenya.
        </p>
      </Section>

      <Section heading="Changes and contact">
        <p>
          We will update this page when the product changes in a way that affects
          it, and the date at the top will change with it. For anything about this
          policy, write to{" "}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary font-medium hover:underline">
            info@mavunohr.co.ke
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
