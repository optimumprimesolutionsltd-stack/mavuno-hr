# Mavuno HR API — Render deploy

`render.yaml` in the repo root is a Render Blueprint that provisions:

| Resource | Name | Notes |
|---|---|---|
| Web service (Node) | `mavuno-hr-api` | Express API, region `frankfurt`, plan `starter` |
| Postgres | `mavuno-hr-db` | plan `basic-256mb`, region `frankfurt` |

The **frontend is not in this blueprint** — `artifacts/mavuno-hr` builds to static files and
should be deployed separately (Render Static Site or Cloudflare Pages) with its API base URL
pointed at `https://mavuno-hr-api.onrender.com` (or the custom API domain).

---

## How the build works

- **Build:** `bash scripts/render-build.sh` — `pnpm install --frozen-lockfile`, then runs
  esbuild's own `install.js` to fetch its native binary, then `node artifacts/api-server/build.mjs`.
  The extra esbuild step is deliberate: `pnpm-workspace.yaml` strips every `@esbuild/*`
  platform package via `overrides`, so esbuild must download its binary on postinstall — and
  that postinstall is gated by pnpm's build-script approval, which doesn't reliably run on a
  fresh CI install. The script guarantees the binary is present before the bundle step.
  esbuild bundles the API to `artifacts/api-server/dist/index.mjs` (ESM, `platform: node`).
  `pdfkit`, `fontkit`, `@node-rs/argon2`, `nodemailer`, `pg-native` are kept **external** in
  `build.mjs`, so they load from `node_modules` at runtime — do not prune `node_modules`.
- **Start:** `node --enable-source-maps artifacts/api-server/dist/index.mjs`
  The server **hard-requires `PORT`** — Render injects it automatically, nothing to set.
- **Pre-deploy:** `pnpm --filter @workspace/db exec drizzle-kit push` syncs the DB schema
  before each release goes live.
- **Health check:** `GET /api/healthz` → `{"status":"ok"}`.

`pnpm install` prints `ERR_PNPM_IGNORED_BUILDS` warnings for `@clerk/shared` / `core-js` —
harmless, those scripts are cosmetic. If a build ever *fails* at the esbuild step, check
`scripts/render-build.sh` still points at the esbuild version pinned in
`pnpm-workspace.yaml` (`overrides: esbuild: <version>`).

---

## First deploy — step by step

### 1. Create the blueprint
Render dashboard → **New → Blueprint** → connect `optimumprimesolutionsltd-stack/mavuno-hr`
→ it picks up `render.yaml` on the `mavuno-hr` branch → **Apply**. This creates the service
and the database (still needs secrets before it will boot).

### 2. Fill in the secret env vars
On **mavuno-hr-api → Environment**, set every `sync: false` var:

| Var | Value |
|---|---|
| `SUPER_ADMIN_PASSWORD` | the super-admin login password (re-synced from this on every boot) |
| `CLERK_PUBLISHABLE_KEY` | Clerk **Production** instance publishable key (`pk_live_…`) |
| `CLERK_SECRET_KEY` | Clerk **Production** secret key (`sk_live_…`) |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | e.g. `Mavuno HR <noreply@mavunohr.co.ke>` — the domain must be verified in Resend |
| `GMAIL_USER` | the Gmail address that sends transactional mail |
| `GMAIL_APP_PASSWORD` | Gmail **app password** (not the account password) |
| `MPESA_ENV` | leave unset (defaults to sandbox). Set `production` only when M-Pesa go-live is done — this charges real money |
| `MPESA_CALLBACK_IP_ALLOWLIST` | optional |

Also confirm `SESSION_SECRET` (auto-generated) is **≥ 32 characters** — the app refuses to
start otherwise. Regenerate from the dashboard if it came out short.

### 3. Deploy
Trigger the first deploy (**Manual Deploy → Deploy latest commit**). Watch the logs:

- Build → esbuild "build finished" and `dist/index.mjs` written.
- Pre-deploy → `drizzle-kit push` creates all tables (empty DB → no prompts).
- Start → `Server listening {"port":10000}`, then startup migrations log:
  `startup-migration: admin credentials updated` / `super-admin password synced`.
- Health check on `/api/healthz` goes green.

### 4. Smoke test
```
curl https://mavuno-hr-api.onrender.com/api/healthz          # {"status":"ok"}
curl -X POST https://mavuno-hr-api.onrender.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"optimumprimesolutionsltd@gmail.com","password":"<SUPER_ADMIN_PASSWORD>"}'
```

### 5. Custom domain (optional, later)
mavuno-hr-api → **Settings → Custom Domains** → add `api.mavunohr.co.ke` → add the CNAME
Render shows at the `mavunohr.co.ke` DNS host. Then point the frontend at that host.

---

## Watch-outs

- **`drizzle-kit push` on later deploys.** It is safe for additive schema changes. A column
  **rename** makes it prompt interactively — the pre-deploy step will hang/fail. If that
  happens: open **mavuno-hr-api → Shell**, run `pnpm --filter @workspace/db exec drizzle-kit push`
  by hand, answer the prompts, then re-deploy. Consider moving to generated SQL migrations
  before the schema changes much further.
- **Single instance only.** The API runs two in-process schedulers
  (`scheduleFilingReminders`, `scheduleMpesaPaymentPoller`). If the service is ever scaled to
  more than one instance they double-fire. Keep instance count at 1, or add a lock first.
- **CORS is wide open** (`cors({ origin: true })` in `artifacts/api-server/src/app.ts`).
  Fine for launch; tighten to the real frontend origin in code when there is one.
- **Native/external deps.** If a deploy fails with `MODULE_NOT_FOUND` for `pdfkit`, `fontkit`,
  `@node-rs/argon2` or `nodemailer`, the `external` list in `artifacts/api-server/build.mjs`
  and the installed `node_modules` are out of sync — do not add `--prod`/prune to the build.
- **Free Postgres expires.** `basic-256mb` is a paid plan and does not; don't downgrade the DB
  to free for a production payroll system.
- **DB backups.** Enable point-in-time recovery / daily backups on `mavuno-hr-db` in the
  dashboard — not expressible in the blueprint.
