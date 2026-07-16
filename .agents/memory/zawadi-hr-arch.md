---
name: Zawadi HR Architecture
description: Key design decisions and constraints for the Zawadi HR & Payroll system
---

## Architecture overview
- React+Vite frontend (`artifacts/zawadi-hr`) + Express API (`artifacts/api-server`) in pnpm monorepo
- DB: Drizzle ORM + Postgres via `@workspace/db`
- API contracts: OpenAPI spec in `lib/api-spec/openapi.yaml`, codegen via Orval into `lib/api-client-react`

## Non-negotiable design rules
- **Money is integer cents everywhere** (bigint in DB, number in JS). `toCents()`/`fromCents()` in `artifacts/api-server/src/lib/money.ts` are the only conversion points.
- **Session auth is DB-backed** (table: `sessions`), not JWT. Firing an employee must kill sessions immediately. Stored as SHA-256(raw_token + SESSION_SECRET).
- **Payroll engine is pure**: `computePayslip()` in `src/lib/payroll.ts` has no DB/clock/global access. Takes (PayInput, StatutoryConfig) → PayResult.
- **Maker-checker enforced**: the user who created/submitted a payroll run cannot approve it (`canApproveRun()` in `src/lib/rbac.ts`). Admin is NOT exempt.
- **Audit log is hash-chained** (SHA-256, prevHash chain). `writeAudit()` must run in the same DB transaction as the change it records.
- **Statutory config is snapshotted** at run creation (`statutorySnapshot` column) so historical payslips remain reproducible.

## Build / run
- API server: `pnpm --filter @workspace/api-server run dev` (builds with esbuild then runs dist)
- Frontend: `pnpm --filter @workspace/zawadi-hr run dev`
- DB push: `pnpm --filter @workspace/db run push`
- Seed: `SESSION_SECRET=<32+chars> artifacts/api-server/node_modules/.bin/tsx artifacts/api-server/scripts/seed.ts --org "Name" --admin email@org.ke`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`

## Key gotchas
- `@node-rs/argon2` must be in esbuild `external[]` in `artifacts/api-server/build.mjs` — it's a native addon.
- `lib/api-client-react/package.json` needs `"./custom-fetch": "./src/custom-fetch.ts"` export for subpath imports.
- Tailwind v4: `@apply dark` is not valid — use `dark` CSS class on `<html>` element directly, not via `@apply`.
- API server uses `cookie-parser` middleware for session cookies (httpOnly, sameSite:strict).
- `zod` must be in `@workspace/api-server` dependencies (not just workspace catalog) since it's used in route handlers.

## Demo credentials (zawadi-demo org)
- Email: admin@zawadi.co.ke  
- Password: FsMP6jAh64WF (shown once at seed time — change this in production)

**Why:** SESSION_SECRET for dev seeding was a static string; for production use a real random secret ≥32 chars.
