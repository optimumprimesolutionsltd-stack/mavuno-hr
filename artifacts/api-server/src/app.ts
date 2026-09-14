import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware.js";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { getClerkProxyHost } from "./middlewares/clerkProxyMiddleware.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
  })),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Anything under /api that no route claimed is a missing endpoint, not a page.
// Without this it would fall through to the marketing site's catch-all below
// and answer an API client with a lump of HTML.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Static client apps ----------------------------------------------------
// This service also serves the two built front-ends so the whole product runs
// from a single origin (required for the Clerk same-origin proxy and a
// single-domain deploy). Registered after /api so API routes always win.
//   /      -> marketing site     (@workspace/mavuno-hr-website, built with BASE_PATH=/)
//   /app   -> admin + portal SPA (@workspace/mavuno-hr,        built with BASE_PATH=/app/)
// Each mount ends with an index.html fallback so client-side routing survives
// deep links and refreshes. A missing dist dir is tolerated (API-only runs).
const artifactsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appDist = path.join(artifactsDir, "mavuno-hr", "dist", "public");
const siteDist = path.join(artifactsDir, "mavuno-hr-website", "dist", "public");

// The portal is behind authentication and every deep link under it is a
// client-side route, so it has to answer 200 for paths that do not exist on
// disk. That makes it unindexable-by-shape rather than by status code, so say
// so explicitly: the header reaches the asset and JSON responses that the
// <meta name="robots"> tag in its index.html cannot. /app is deliberately left
// crawlable in robots.txt so this header is actually seen.
app.use(
  "/app",
  (_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  },
  express.static(appDist, { index: false }),
  (_req, res) => {
    res.sendFile(path.join(appDist, "index.html"));
  },
);

// The marketing site is prerendered: the build writes one real HTML document
// per route ("/" -> index.html, "/features" -> features/index.html, ...), each
// with its own <title>, canonical and JSON-LD baked in. Discover them from the
// build output rather than hardcoding a list here — the routes are declared
// once, in the website's src/site-routes.ts, and duplicating them in the server
// is how the two drift apart.
function prerenderedRoutes(dir: string): Set<string> {
  const routes = new Set<string>(["/"]);

  // Recursive, because routes are not all one level deep: /guides/<slug> lives
  // at guides/<slug>/index.html and a single-level scan would prerender it
  // happily and then 404 it, which is the worst of both.
  const walk = (current: string, prefix: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      const route = `${prefix}/${entry.name}`;
      if (fs.existsSync(path.join(full, "index.html"))) routes.add(route);
      // Keep descending regardless: an index page and its children are both
      // routes, and a directory without one can still hold them.
      walk(full, route);
    }
  };

  try {
    walk(dir, "");
  } catch {
    // No dist yet (API-only run) — tolerated, same as the mounts above.
  }
  return routes;
}

const siteRoutes = prerenderedRoutes(siteDist);
logger.info({ routes: [...siteRoutes] }, "marketing routes served");

// Anything not in that set genuinely does not exist, and 200-ing the homepage
// for it would hand crawlers an unbounded space of soft 404s. Serve the 404
// document so a mistyped URL still renders the branded page, but say 404.
// redirect:false is load-bearing, not tidiness. Each route is a DIRECTORY here
// ("features/index.html"), and express.static's default is to answer a
// directory request without a trailing slash with a 301 that adds one. That
// redirect would fire before the handler below ever runs, and the handler
// redirects the trailing-slash form back — an infinite loop on every sub-page.
app.use(express.static(siteDist, { index: false, redirect: false }), (req, res) => {
  // This mount has no path prefix, so nothing is stripped from req.path.
  const canonical =
    req.path.length > 1 && req.path.endsWith("/") ? req.path.slice(0, -1) : req.path;

  if (!siteRoutes.has(canonical)) {
    res.status(404).sendFile(path.join(siteDist, "index.html"));
    return;
  }

  // One URL per page: "/features/" redirects to "/features" rather than serving
  // the same document at a second address and splitting its signals.
  if (canonical !== req.path) {
    res.redirect(301, canonical);
    return;
  }

  // Only paths this process itself enumerated reach sendFile, so req.path
  // cannot be used to escape siteDist.
  const file = canonical === "/" ? "index.html" : path.join(canonical.slice(1), "index.html");
  res.sendFile(path.join(siteDist, file));
});

export default app;
