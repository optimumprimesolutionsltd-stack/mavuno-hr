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

app.use(
  "/app",
  express.static(appDist, { index: false }),
  (_req, res) => {
    res.sendFile(path.join(appDist, "index.html"));
  },
);
app.use(
  express.static(siteDist, { index: false }),
  (_req, res) => {
    res.sendFile(path.join(siteDist, "index.html"));
  },
);

export default app;
