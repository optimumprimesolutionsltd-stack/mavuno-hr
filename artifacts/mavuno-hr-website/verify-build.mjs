/**
 * Checks that the prerendered site is actually a site.
 *
 * A build exiting 0 is not the assurance it looks like: prerender.mjs could
 * silently write a page with no markup, no metadata, or a broken asset
 * reference, and the build would still succeed. This runs as the last step
 * so Render fails the deploy rather than replacing a working site with a
 * blank page.
 *
 * Mirrors artifacts/jamvi-website/scripts/verify-build.mjs, adapted to this
 * repo's prerender.mjs output shape.
 */

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(root, "dist", "public");

const problems = [];
const note = (route, message) => problems.push(`${route}: ${message}`);

// Warnings are things worth fixing that do not make the build unshippable, so
// they are reported without failing the deploy. A title a few pixels over the
// SERP limit costs you the tail of a headline; it does not break the page, and
// failing a deploy over it would be worse than the problem.
const warnings = [];
const warn = (route, message) => warnings.push(`${route}: ${message}`);

// Google truncates result titles on rendered WIDTH, not character count, which
// is why a 61-character lowercase title can fit where a 58-character one full
// of capitals does not. This approximates Arial at the desktop SERP size; it is
// close enough to catch a title drifting over, which a .length check is not.
const NARROW_CHARS = "iljtfrI.,:;'|!()[]- ";
const WIDE_CHARS = "mwMW—…@%";
const TITLE_WIDTH_LIMIT = 600;
// The prerendered HTML escapes the title, so "&" arrives as "&amp;" and would
// be measured as five characters rather than one - enough on its own to push a
// title 43px over the limit and report a problem that does not exist. Measure
// what a reader sees, not the markup.
function decodeEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: String.fromCharCode(34),
    apos: String.fromCharCode(39),
    nbsp: " ",
    mdash: String.fromCharCode(8212),
    ndash: String.fromCharCode(8211),
    hellip: String.fromCharCode(8230),
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => (name in named ? named[name] : whole));
}

function titleWidth(text) {
  let width = 0;
  for (const character of text) {
    if (NARROW_CHARS.includes(character)) width += 5.6;
    else if (WIDE_CHARS.includes(character)) width += 16.5;
    else if (character >= "A" && character <= "Z") width += 13.3;
    else width += 10.4;
  }
  return Math.round(width);
}

const sitemapXml = await readFile(path.join(outputDir, "sitemap.xml"), "utf8");
const locations = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

if (locations.length === 0) {
  problems.push("sitemap.xml lists no URLs at all.");
}

for (const location of locations) {
  const route = new URL(location).pathname;
  const file = path.join(outputDir, route === "/" ? "" : route, "index.html");

  try {
    await access(file);
  } catch {
    note(route, "listed in the sitemap but no page was written for it.");
    continue;
  }

  const html = await readFile(file, "utf8");

  if (html.includes("<!--app-html-->")) {
    note(route, "still has the unfilled app-html slot - prerender.mjs did not run for this route.");
  }

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) {
    note(route, "has no <title>.");
  } else {
    const width = titleWidth(decodeEntities(title));
    if (width > TITLE_WIDTH_LIMIT) {
      warn(
        route,
        `title renders ~${width}px, over the ~${TITLE_WIDTH_LIMIT}px SERP limit - Google will truncate it. Shorten it in src/site-routes.ts.`,
      );
    }
  }

  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!description) note(route, "has no meta description.");

  // Every page inheriting some other page's canonical would tell search
  // engines the whole site is one page, which is how duplicate-content
  // penalties start.
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!canonical) {
    note(route, "has no canonical URL.");
  } else if (new URL(canonical).pathname !== route) {
    note(route, `canonical points at ${new URL(canonical).pathname}, not itself.`);
  }

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    note(route, `has ${blocks.length} JSON-LD blocks, expected exactly 1.`);
  } else {
    try {
      const parsed = JSON.parse(blocks[0][1]);
      if (!Array.isArray(parsed["@graph"]) || parsed["@graph"].length === 0) {
        note(route, "has JSON-LD with an empty @graph.");
      }
    } catch (error) {
      note(route, `has JSON-LD that does not parse: ${error.message}`);
    }
  }

  // A hashed bundle that is not there means a blank page for every visitor,
  // whatever the HTML says.
  const asset = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
  if (!asset) {
    note(route, "loads no JavaScript bundle.");
  } else {
    try {
      await access(path.join(outputDir, asset.replace(/^\//, "")));
    } catch {
      note(route, `references ${asset}, which was not built.`);
    }
  }
}

// llms.txt is hand-maintained, not generated from site-routes.ts the way the
// sitemap is - which is exactly how a guide added after it was last edited
// could go missing from it. The sitemap is already the source of truth for
// "which guides exist"; this just makes sure llms.txt actually agrees.
const llmsTxt = await readFile(path.join(outputDir, "llms.txt"), "utf8");
for (const location of locations) {
  if (!new URL(location).pathname.startsWith("/guides/")) continue;
  if (!llmsTxt.includes(location)) {
    note(new URL(location).pathname, "is in the sitemap but missing from llms.txt.");
  }
}

if (warnings.length > 0) {
  console.warn("");
  console.warn("Shippable, but worth fixing:");
  console.warn("");
  for (const warning of warnings) console.warn(`  - ${warning}`);
  console.warn("");
}

if (problems.length > 0) {
  console.error(`\nThe built site is not shippable:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`Verified ${locations.length} pages: markup, metadata, canonical, JSON-LD and assets.`);
