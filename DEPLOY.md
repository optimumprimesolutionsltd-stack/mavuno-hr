# Deploy

Mavuno HR runs as **one Render web service** (`@workspace/api-server`) that serves
everything from a single origin:

| Path | Served content | Source package |
|------|----------------|----------------|
| `/api/*` | JSON API + `/api/__clerk` Clerk proxy | `@workspace/api-server` |
| `/app`, `/app/*` | admin + employee portal SPA | `@workspace/mavuno-hr` (built with `BASE_PATH=/app/`) |
| `/`, everything else | marketing site | `@workspace/mavuno-hr-website` (built with `BASE_PATH=/`) |

Static serving lives in `artifacts/api-server/src/app.ts`, registered after the
`/api` router. Each SPA mount falls back to its `index.html` so client-side
routing survives deep links and refreshes. The server resolves the built dirs
relative to its own bundle, so it works regardless of the process CWD.

## Render service config

**Build command**

```sh
pnpm install --frozen-lockfile
BASE_PATH=/     pnpm --filter @workspace/mavuno-hr-website build
BASE_PATH=/app/ pnpm --filter @workspace/mavuno-hr build
pnpm --filter @workspace/api-server build
```

**Start command**

```sh
pnpm --filter @workspace/api-server run start
```

**Environment**

Runtime: `DATABASE_URL`, `SESSION_SECRET` (>= 32 chars), `SUPER_ADMIN_EMAILS`,
`SUPER_ADMIN_PASSWORD`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` (all outbound mail goes through Resend),
plus `MPESA_*` when that feature is enabled. `PORT` is injected by Render.

`APP_BASE_PATH` defaults to `/app` (the SPA mount) and is what emailed links
like the password-reset URL are prefixed with — no need to set it here. Local
dev serving the app at root should set `APP_BASE_PATH=/`.

Build-time (read by Vite): `VITE_CLERK_PUBLISHABLE_KEY`,
`VITE_CLERK_PROXY_URL=/api/__clerk`.

**Custom domains** (on the web service): `mavunohr.co.ke` + `www.mavunohr.co.ke`
(www redirects to the apex). No separate `app.` / `api.` hosts — the single
origin covers both.

## Notes

- The old split deploy (`mavuno-hr-app` / `mavuno-hr-website` static sites plus a
  `/api/*` rewrite rule) is retired. There is no `render.yaml`; config lives in
  the Render dashboard.
- Local dev is unchanged: `pnpm --filter @workspace/api-server dev` for the API,
  `pnpm --filter @workspace/mavuno-hr dev` / `--filter @workspace/mavuno-hr-website dev`
  for the front-ends (Vite proxies `/api` to the local API server).
