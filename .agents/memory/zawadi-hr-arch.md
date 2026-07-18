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

## RBAC summary
- `admin`: `["*"]` — all permissions
- `hr`: employee:read/write, leave management (no payroll)
- `payroll_officer`: payroll:read/calculate/submit (no employee:write, no approve/disburse)
- `approver`: payroll:read/approve/disburse (no calculate/submit)
- `employee`/`manager`: self-service only
- `canApproveRun`: admin bypasses segregation; others cannot approve their own submissions

## Feature inventory (as of 2026-07-18)
**Admin:** Dashboard (MoM variance, net payout, recent hires, anniversaries, dual-bar chart), Employees (CRUD, terminate, bulk), Leave (approve), Loans, Payroll (list with color badges, detail with email+PDF+payslip-edit), Timesheets, Reports (11 types), Users/RBAC, Audit logs, Settings.
**Employee portal:** Profile (payslip history with PDF download + eye view), Leave, Loans, P9.
**API routes:** /auth, /employees, /payroll (+ PDF + email-payslips), /leaves, /loans, /reports, /timesheets, /audit, /portal (+ payslip PDF), /users, /super, /dashboard, /calculator.

## PDF payslips
- Generated server-side with pdfkit (`artifacts/api-server/src/lib/pdf-payslip.ts`).
- Admin: `GET /api/payroll/:id/payslips/:slipId/pdf` and `POST /api/payroll/:id/email-payslips`.
- Portal: `GET /api/portal/payslip/:slipId/pdf` (employee downloads own slip).
- Email sent via nodemailer+Gmail with PDF attachment (`sendPayslipEmail` in `mailer.ts`).

## Reports (11 types)
muster, paye, nssf, shif, housing, pension, bank, mpesa, cash, gl, p9.
All money cells = raw cent integers; frontend calls `formatMoney(cell)`.

## DB seed state (as of 2026-07-18, after fixes)
- Employees: Jane (75K), John (70K — fixed from 1M), Alice (75K), Brian (95K).
- Payroll runs: July=paid (Jane only — historical). August and September were deleted; user must recreate fresh runs including all 4 employees.
- Super-admin: `optimumprimesolutionsltd@gmail.com`.

## Payroll action workflow
- Draft → submit → pending_approval → approve → approved → pay → paid
- Only `admin` and `approver` roles can approve. Segregation of duties: non-admin cannot approve their own submission.
- Actions call `PATCH /api/payroll/:id` with body `{ action: "submit"|"approve"|"reject"|"pay"|"reverse" }`.
