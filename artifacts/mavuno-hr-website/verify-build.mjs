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
  if (!title) note(route, "has no <title>.");

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

if (problems.length > 0) {
  console.error(`\nThe built site is not shippable:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`Verified ${locations.length} pages: markup, metadata, canonical, JSON-LD and assets.`);
