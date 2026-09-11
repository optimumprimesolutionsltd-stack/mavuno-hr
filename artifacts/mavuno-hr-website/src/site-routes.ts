/**
 * Every URL the marketing site serves, and the <head> each one gets.
 *
 * SINGLE SOURCE OF TRUTH. Three things read this and must not drift apart:
 *   - App.tsx          decides which component a path renders
 *   - prerender.mjs    decides which pages to pre-render, and their meta
 *   - prerender.mjs    also generates sitemap.xml from it
 *
 * Adding a page means adding it here and nowhere else. That is deliberate: the
 * hand-maintained sitemap this replaced was wrong within a day of being right.
 */

export const SITE_ORIGIN = "https://mavunohr.co.ke";

export interface SiteRoute {
  /** Path, always with a leading slash and never a trailing one. */
  path: string;
  /** <title>. Aim for under ~60 rendered characters. */
  title: string;
  /** <meta name="description">. Aim for ~150-160 characters. */
  description: string;
  /** Shorter line for og:/twitter: cards, which truncate earlier than SERPs. */
  social: string;
  /** Sitemap priority relative to the other pages here. */
  priority: string;
  /** Label used for the BreadcrumbList on sub-pages. Home has none. */
  breadcrumb?: string;
  /** Whether the SoftwareApplication offer graph belongs on this page. */
  offers?: boolean;
  /**
   * Questions rendered on the page AND emitted as FAQPage structured data.
   * Deliberately one array rather than two: schema that describes something the
   * visitor cannot see is a guidelines violation, so the only safe way to ship
   * FAQ markup is to make the page and the schema read from the same source.
   */
  faq?: { q: string; a: string }[];
}

export const SITE_ROUTES: SiteRoute[] = [
  {
    path: "/",
    title: "Mavuno HR — Payroll & HR Software for Kenya | PAYE, NSSF, SHIF",
    description:
      "Kenyan payroll and HR software. Automated PAYE, NSSF, SHIF and Housing Levy, P9 and P10 filing, employee self-service and bank and M-Pesa payment files.",
    social:
      "Automated PAYE, NSSF, SHIF and Housing Levy. Payslips, P9s and self-service, built for Kenyan businesses.",
    priority: "1.0",
    offers: true,
  },
  {
    path: "/features",
    title: "Features — HR & Payroll Software for Kenyan Teams | Mavuno HR",
    description:
      "One-click payroll runs, a single employee directory, leave and loans, self-service payslips and bank and M-Pesa payment files. Built for Kenyan HR teams.",
    social:
      "One-click payroll, a single employee directory, leave, loans and self-service payslips.",
    priority: "0.8",
    breadcrumb: "Features",
  },
  {
    path: "/compliance",
    title: "Kenya Statutory Compliance — PAYE, NSSF, SHIF & Housing Levy",
    description:
      "How Mavuno HR handles Kenyan statutory deductions: PAYE and personal relief, NSSF Tier I and II, SHIF, the Housing Levy, and P9, P10 and P10A returns.",
    social:
      "PAYE, NSSF Tier I and II, SHIF and the Affordable Housing Levy — calculated, then filed.",
    priority: "0.9",
    breadcrumb: "Compliance",
  },
  {
    path: "/paye-calculator",
    title: "Kenya PAYE Calculator — Net Pay After NSSF, SHIF & Housing Levy",
    description:
      "Free Kenyan PAYE calculator. Enter a monthly gross salary to see PAYE, NSSF, SHIF and Housing Levy deductions, take-home pay, and total employer cost.",
    social:
      "Enter a monthly gross salary and see PAYE, NSSF, SHIF, Housing Levy, net pay and the employer's total cost.",
    priority: "0.9",
    breadcrumb: "PAYE Calculator",
    faq: [
      {
        q: "How is PAYE calculated in Kenya?",
        a: "PAYE is charged on taxable income using progressive bands: each slice of income is taxed at its own rate rather than the whole salary being taxed at the top rate. Personal relief is then subtracted from the result. Taxable income is your gross pay less the deductions that are allowed before tax, which is why NSSF and SHIF change the PAYE figure rather than just sitting alongside it.",
      },
      {
        q: "Is NSSF deducted before PAYE?",
        a: "Yes. NSSF is treated as tax deductible, so the employee contribution reduces taxable income before PAYE is worked out. NSSF itself is split into Tier I and Tier II against the current earnings limits, and the employer pays a matching contribution on top of gross pay.",
      },
      {
        q: "Does SHIF reduce my taxable pay?",
        a: "Under the rules this calculator applies, the SHIF deduction is tax deductible, so it lowers taxable income in the same way NSSF does. SHIF replaced NHIF, and it is calculated on gross pay rather than from a band table.",
      },
      {
        q: "What is the Affordable Housing Levy?",
        a: "The Affordable Housing Levy is deducted from the employee and matched by the employer. The employee side is tax deductible, so it also reduces taxable income. The employer's matching contribution is a cost on top of gross pay and is included in the employer total shown above.",
      },
      {
        q: "Does this include HELB, pension or insurance relief?",
        a: "No. The figures above assume a resident employee on a full month with no HELB repayment, no pension contribution and no insurance relief. Any of those would change the result, and Mavuno HR handles all of them on a real payroll run.",
      },
      {
        q: "Is this an official KRA calculator?",
        a: "No. It is an estimate produced by the same payroll engine Mavuno HR runs on, using the statutory rules currently on file. It is not tax advice, and the filing obligation stays with you as the employer.",
      },
    ],
  },
  {
    path: "/pricing",
    title: "Pricing — Kenyan Payroll Software from KES 0 | Mavuno HR",
    description:
      "Flat monthly pricing by team size, free up to 5 employees. Every plan is the complete platform — no per-payslip fees, nothing locked behind a higher tier.",
    social:
      "Flat monthly pricing by team size, free up to 5 employees. Every plan is the whole platform.",
    priority: "0.9",
    breadcrumb: "Pricing",
    offers: true,
  },
];

export function routeFor(path: string): SiteRoute | undefined {
  const normalised = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  return SITE_ROUTES.find((r) => r.path === normalised);
}
