/**
 * Post-build step: turn the single-page client build into one real HTML
 * document per route, and generate the sitemap from the same manifest.
 *
 * Runs after BOTH vite builds:
 *   1. vite build          -> dist/public  (client bundle + index.html shell)
 *   2. vite build --ssr    -> dist/server  (entry-server.js)
 *   3. node prerender.mjs  -> this
 *
 * For each route in src/site-routes.ts it renders the React tree to HTML,
 * substitutes it into the shell's root div, and swaps everything between the
 * seo:start / seo:end markers for that page's own title, description, canonical,
 * social cards and JSON-LD. The client entry hydrates whatever it finds, so the
 * markup written here is what both crawlers and real users get first.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(here, "dist", "public");
const SERVER_ENTRY = path.join(here, "dist", "server", "entry-server.js");

const { render, SITE_ROUTES, SITE_ORIGIN } = await import(
  `file://${SERVER_ENTRY.split(path.sep).join("/")}`
);

/** Escape for use inside a double-quoted HTML attribute. */
const attr = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escape for use in element text. */
const text = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

function jsonLd(route) {
  const org = {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: "Mavuno HR",
    url: `${SITE_ORIGIN}/`,
    email: "info@mavunohr.co.ke",
    logo: { "@type": "ImageObject", url: OG_IMAGE, width: 1200, height: 630 },
    areaServed: { "@type": "Country", name: "Kenya" },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Nairobi",
      addressCountry: "KE",
    },
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    url: `${SITE_ORIGIN}/`,
    name: "Mavuno HR",
    inLanguage: "en-KE",
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  };

  const graph = [org, website];

  // Offers only where prices are actually on the page. Structured data that
  // describes something the visitor cannot see is a guidelines violation, and
  // it is how the previous markup ended up asserting a Tally sync that the
  // product does not have.
  if (route.offers) {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${SITE_ORIGIN}/#software`,
      name: "Mavuno HR",
      url: `${SITE_ORIGIN}/`,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Payroll and HR software",
      operatingSystem: "Web browser",
      inLanguage: "en-KE",
      description:
        "Payroll, people management and statutory compliance for Kenyan businesses. Automates PAYE, NSSF, SHIF and the Affordable Housing Levy, generates payslips and P9, P10 and P10A returns, and produces bank and M-Pesa payment files.",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      featureList: [
        "Automated payroll runs and payslips",
        "PAYE, NSSF, SHIF and Affordable Housing Levy calculation",
        "P9, P10, P10A, SHIF and NSSF returns",
        "Employee self-service portal",
        "Leave, loans and timesheets",
        "Bank and M-Pesa payment files",
        "Audit trail and data export",
      ],
      offers: [
        { name: "Free", price: "0", description: "Up to 5 employees." },
        {
          name: "Lite",
          price: "1500",
          description: "6-10 employees. Flat monthly fee, excludes 16% VAT.",
        },
        {
          name: "Starter",
          price: "2500",
          description: "11-20 employees. Flat monthly fee, excludes 16% VAT.",
        },
        {
          name: "Growth",
          price: "4000",
          description: "21-50 employees. Flat monthly fee, excludes 16% VAT.",
        },
        {
          name: "Business",
          price: "7000",
          description: "51-150 employees. Flat monthly fee, excludes 16% VAT.",
        },
      ].map((o) => ({ "@type": "Offer", priceCurrency: "KES", ...o })),
    });
  }

  if (route.breadcrumb) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: route.breadcrumb,
          item: `${SITE_ORIGIN}${route.path}`,
        },
      ],
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

function seoBlock(route) {
  const url = route.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route.path}`;
  // og:title drops the "| Mavuno HR" suffix: social cards truncate harder than
  // SERPs do, and og:site_name already carries the brand.
  const ogTitle = route.title.split("|")[0].trim();
  return `<title>${text(route.title)}</title>
    <meta name="description" content="${attr(route.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <link rel="canonical" href="${attr(url)}" />
    <meta property="og:site_name" content="Mavuno HR" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="en_KE" />
    <meta property="og:url" content="${attr(url)}" />
    <meta property="og:title" content="${attr(ogTitle)}" />
    <meta property="og:description" content="${attr(route.social)}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Mavuno HR — payroll, people and statutory compliance, built for Kenyan businesses." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(ogTitle)}" />
    <meta name="twitter:description" content="${attr(route.social)}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <script type="application/ld+json">
${jsonLd(route)}
    </script>`;
}

const SEO_BLOCK = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;
const APP_SLOT = "<!--app-html-->";

const template = await readFile(path.join(CLIENT_DIR, "index.html"), "utf8");
if (!SEO_BLOCK.test(template) || !template.includes(APP_SLOT)) {
  throw new Error(
    "index.html is missing the seo:start/seo:end markers or the app-html slot",
  );
}

for (const route of SITE_ROUTES) {
  const html = template
    .replace(SEO_BLOCK, seoBlock(route))
    .replace(APP_SLOT, render(route.path));

  const outFile =
    route.path === "/"
      ? path.join(CLIENT_DIR, "index.html")
      : path.join(CLIENT_DIR, route.path.replace(/^\//, ""), "index.html");

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, html, "utf8");
  console.log(`prerendered ${route.path.padEnd(14)} -> ${path.relative(here, outFile)}`);
}

// Sitemap from the same manifest, so a page cannot be added without it.
const lastmod = new Date().toISOString().slice(0, 10);
const urls = SITE_ROUTES.map(
  (r) => `  <url>
    <loc>${SITE_ORIGIN}${r.path === "/" ? "/" : r.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
).join("\n");

await writeFile(
  path.join(CLIENT_DIR, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by prerender.mjs from src/site-routes.ts. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
  "utf8",
);
console.log(`wrote sitemap.xml with ${SITE_ROUTES.length} urls`);
