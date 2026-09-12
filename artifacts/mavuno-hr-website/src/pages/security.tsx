import { Link } from "wouter";
import { LegalPage, Section, Bullets, Callout } from "@/components/legal-page";

/**
 * Only claims things that exist in the codebase. The "not yet" section is the
 * important half: a security page that lists only strengths reads as marketing,
 * and anyone evaluating payroll software for a real company will assume the
 * omissions are the answer anyway.
 */
export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      updated="12 September 2026"
      intro="Payroll is the most sensitive system most companies run — every salary, every bank account, in one place. This page describes what protects it, and is equally clear about what we have not built yet."
    >
      <Section heading="Access">
        <Bullets
          items={[
            <>
              <strong>Passwords are hashed with Argon2id</strong>, a memory-hard
              algorithm designed to resist offline cracking. We cannot read your
              password, and neither can anyone who obtains the database.
            </>,
            <>
              <strong>Role-based access.</strong> Accounts are admin, HR, manager
              or employee, and the data each can reach differs. An employee signing
              in to the self-service portal can see their own payslips and leave —
              not their colleagues'.
            </>,
            <>
              <strong>Every organisation's data is scoped to that organisation</strong>{" "}
              at the query level, so one customer's records cannot be returned to
              another.
            </>,
            <>
              Authentication and session handling are provided by Clerk rather than
              rolled ourselves.
            </>,
          ]}
        />
      </Section>

      <Section heading="The audit trail">
        <p>
          Significant actions — pay changes, payroll approvals, payments — are
          written to an append-only audit log recording the actor, their email, the
          IP address, the time, and the before and after state.
        </p>
        <Callout>
          Each entry stores a hash of its own contents together with the hash of
          the entry before it, forming a chain back to a fixed genesis value. An
          altered or deleted entry breaks the chain and can be detected. This makes
          the log <strong>tamper-evident</strong>: it does not prevent a change,
          but it makes one impossible to hide.
        </Callout>
        <p>
          That matters for payroll specifically. The common fraud is not an
          outsider breaking in — it is an insider adjusting a figure and removing
          the trace.
        </p>
      </Section>

      <Section heading="In transit and at rest">
        <Bullets
          items={[
            "All traffic is served over HTTPS. The application, the API and the portal share one origin, so no payroll data crosses between hosts in the browser.",
            "The admin and employee portal is excluded from search engines by both a robots meta tag and an X-Robots-Tag header, so nothing behind the login is indexed.",
            "Payment processing runs through Safaricom's M-Pesa. We never see or store card details, and we do not handle cards at all.",
            "Callbacks from M-Pesa are checked against an IP allowlist before being accepted, so a forged payment confirmation is rejected.",
          ]}
        />
      </Section>

      <Section heading="What we have not built yet">
        <p>
          A security page that lists only strengths is not worth reading. As of the
          date above, the following are honestly not in place:
        </p>
        <Bullets
          items={[
            "No third-party penetration test or independent security audit has been carried out.",
            "We hold no SOC 2, ISO 27001 or equivalent certification.",
            "Two-factor authentication is not yet available on accounts.",
            "Automated data deletion and a fixed retention schedule do not exist — erasure is handled manually on request.",
            "We do not currently publish a formal uptime SLA or status page.",
          ]}
        />
        <p>
          If any of these is a requirement for your organisation, tell us before
          you commit. We would rather lose the deal than have you discover the gap
          after moving your payroll across.
        </p>
      </Section>

      <Section heading="Reporting a vulnerability">
        <p>
          If you believe you have found a security issue, email{" "}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary font-medium hover:underline">
            info@mavunohr.co.ke
          </a>{" "}
          with enough detail to reproduce it. Please give us a reasonable
          opportunity to fix the issue before disclosing it publicly. We will not
          pursue action against anyone who reports a genuine vulnerability in good
          faith and does not access or alter other people's data in the process.
        </p>
        <p>
          For how the data itself is handled, see our{" "}
          <Link href="/privacy" className="text-primary font-medium hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
