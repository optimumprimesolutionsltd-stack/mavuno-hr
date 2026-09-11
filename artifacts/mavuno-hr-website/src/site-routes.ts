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
