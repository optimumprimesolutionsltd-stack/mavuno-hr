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

// The marketing site is the opposite case: one real route ("/") plus its static
// files, because the nav is all in-page anchors. So a request for anything else
// is genuinely a miss, and 200-ing the homepage for it would hand crawlers an
// unbounded space of soft 404s off a domain that has one page to rank. Send the
// same document either way — the SPA renders its 404 screen — but tell the
// truth in the status line.
app.use(express.static(siteDist, { index: false }), (req, res) => {
  // This mount has no path prefix, so nothing is stripped from req.path.
  res.status(req.path === "/" ? 200 : 404).sendFile(path.join(siteDist, "index.html"));
});

export default app;
