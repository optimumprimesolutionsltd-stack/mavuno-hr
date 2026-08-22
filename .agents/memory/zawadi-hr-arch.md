---
name: Zawadi HR architecture
description: Full-stack Kenya payroll SaaS — design constraints, auth pattern, money encoding, and feature inventory
---

## Auth
- Bearer token in `sessionStorage` (`zawadi_session_token`) — cookies blocked by Replit cross-site iframe.
- All future auth work must use this pattern (not cookies).

## Money encoding
- Stored as integer cents: KES 70,000 = 7,000,000 in DB.
- `formatMoney(cents)` in frontend.
- `toCents()` / `fromCents()` in API — `fromCents()` returns a **string** ("70000.00"), not a number.
- Reports API returns raw cents integers; frontend calls `formatMoney(cell)` directly (no ×100).
- Employee edit dialog: `centsToStr(cents)` = `(cents / 100).toFixed(2)` for display; backend sends value back as decimal string (e.g. "70000.00"), backend regex `/^\d{1,12}(\.\d{1,2})?$/` validates it, `toCents()` converts to int.

## Leave days
- Stored as tenths: 21 days = 210. Display: `Math.round(val / 10)`.

## NSSF Tier 2 provider
- `tier2Provider?: "nssf" | "private"` and `tier2ProviderName?: string` added to `StatutoryConfig.socialSecurity` (JSONB — no migration needed).
- When `"private"`: NSSF return shows Tier I only; Pension Fund report handles Tier II.

## Key design constraints
- All money API responses are raw integer cents (never fromCents strings).
- `breakdown` JSONB on payslips stores: `bands`, `nssfTier1`, `nssfTier2`, `nssfTier1Employer`, `nssfTier2Employer`, `warnings`.
- `computeSocialSecurity` returns `tier1`, `tier2`, `employee`, `employer`, `tier1Employer`, `tier2Employer`.

## Critical bug patterns to avoid
- **`writeAudit` must always receive `(tx, entry)` as first arg** — calling it without a transaction crashes the endpoint silently. Always wrap in `db.transaction(async (tx) => writeAudit(tx as any, { ... }))`.
- **`ApiError` puts parsed body at `e.data`**, NOT `e.response.data`. Error handlers must use `(e?.data as any)?.error ?? e?.message`.
- **Never define helper components (F, S, etc.) inside a React component body** — each render creates a new function reference (new type), causing React to unmount/remount the element on every state change, breaking keyboard input mid-type. Use plain render functions called as `{textField(...)}` instead of `<F ...>`. This pattern was the root cause of salary and phone fields saving only 1-2 characters.
- **pdfkit must be marked external in esbuild** — when bundled into `dist/index.mjs`, fontkit's `require('@swc/helpers/...')` resolves from the bundle output dir (not fontkit's node_modules), breaking PDF generation with MODULE_NOT_FOUND. Keep `"pdfkit"` and `"fontkit"` in the `external` array in `build.mjs`.

## RBAC summary
- `admin`: `["*"]` — all permissions
- `hr`: employee:read/write, leave management (no payroll)
- `payroll_officer`: payroll:read/calculate/submit (no employee:write, no approve/disburse)
- `approver`: payroll:read/approve/disburse (no calculate/submit)
- `employee`/`manager`: self-service only
- `canApproveRun`: admin bypasses segregation; others cannot approve their own submission.

## Feature inventory (verified by E2E test 2026-07-18)
**Admin:** Dashboard (MoM variance, net payout, recent hires, anniversaries, dual-bar chart), Employees (CRUD, portal-access, terminate, bulk), Leave (approve), Loans, Payroll (list → detail → calculate → submit → approve → pay → email payslips + PDF), Reports (11 types), Users/RBAC.
**Note:** No standalone `/admin/audit` or `/admin/settings` page routes exist; audit events visible in dashboard Security Log only.
**Employee portal:** Profile + payslip history (PDF download), Leave, Loans, P9.
**API routes:** /auth, /employees (+ /portal-access), /payroll (+ PDF + email-payslips), /leaves, /loans, /reports, /timesheets, /audit, /portal (+ payslip PDF), /users, /super, /dashboard, /calculator.

## PDF payslips
- Generated server-side with pdfkit (`artifacts/api-server/src/lib/pdf-payslip.ts`).
- Admin: `GET /api/payroll/:id/payslips/:slipId/pdf` and `POST /api/payroll/:id/email-payslips`.
- Portal: `GET /api/portal/payslip/:slipId/pdf` (employee downloads own slip).
- Email sent via nodemailer+Gmail with PDF attachment (`sendPayslipEmail` in `mailer.ts`).
- **pdfkit must be external in esbuild** — see bug patterns above.

## Reports (11 types)
muster, paye, nssf, shif, housing, pension, bank, mpesa, cash, gl, p9.
All money cells = raw cent integers; frontend calls `formatMoney(cell)`.

## DB state (as of 2026-07-18 end of session)
- Employees: Jane/EMP0001 (75K), John/EMP0002 (70K), Alice/EMP0003 (75K), Brian/EMP0004 (95K), Test/EMP0005 (55K), FYr0DM/EMP0006 (terminated).
- Payroll runs: July=paid (Jane only — historical), August=paid (all employees, run id=4).
- Super-admin: `optimumprimesolutionsltd@gmail.com`.

## Payroll action workflow
- Draft → submit → pending_approval → approve → approved → pay → paid
- Only `admin` and `approver` roles can approve. Segregation of duties: non-admin cannot approve their own submission.
- Actions call `PATCH /api/payroll/:id` with body `{ action: "submit"|"approve"|"reject"|"pay"|"reverse" }`.
