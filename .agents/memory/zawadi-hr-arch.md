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

## Leave days
- Stored as tenths: 21 days = 210. Display: `Math.round(val / 10)`.

## NSSF Tier 2 provider
- `tier2Provider?: "nssf" | "private"` and `tier2ProviderName?: string` added to `StatutoryConfig.socialSecurity` (JSONB — no migration needed).
- When `"private"`: NSSF return shows Tier I only; Pension Fund report handles Tier II.

## Key design constraints
- All money API responses are raw integer cents (never fromCents strings).
- `breakdown` JSONB on payslips stores: `bands`, `nssfTier1`, `nssfTier2`, `nssfTier1Employer`, `nssfTier2Employer`, `warnings`.
- `computeSocialSecurity` returns `tier1`, `tier2`, `employee`, `employer`, `tier1Employer`, `tier2Employer`.

## Feature inventory (as of 2026-07-18)
**Admin:** Dashboard (MoM variance, net payout, recent hires, anniversaries, dual-bar chart), Employees (CRUD, terminate, bulk), Leave (approve), Loans, Payroll (list with color badges, detail with email+PDF), Timesheets, Reports (11 types), Users/RBAC, Audit logs, Settings.
**Employee portal:** Profile (payslip history with PDF download), Leave, Loans, P9.
**API routes:** /auth, /employees, /payroll (+ PDF + email-payslips), /leaves, /loans, /reports, /timesheets, /audit, /portal (+ payslip PDF), /users, /super, /dashboard, /calculator.

## PDF payslips
- Generated server-side with pdfkit (`artifacts/api-server/src/lib/pdf-payslip.ts`).
- Admin: `GET /api/payroll/:id/payslips/:slipId/pdf` and `POST /api/payroll/:id/email-payslips`.
- Portal: `GET /api/portal/payslip/:slipId/pdf` (employee downloads own slip).
- Email sent via nodemailer+Gmail with PDF attachment (`sendPayslipEmail` in `mailer.ts`).

## Reports (11 types)
muster, paye, nssf, shif, housing, pension, bank, mpesa, cash, gl, p9.
All money cells = raw cent integers; frontend calls `formatMoney(cell)`.

## DB seed state (as of session)
- Employees: Jane (75K), John (1M — should be 70K, fix via edit dialog), Alice (75K), Brian (95K).
- Payroll runs: July=paid, August=pending_approval, September=draft.
- Super-admin: `optimumprimesolutionsltd@gmail.com`.

## Outstanding TODOs
- John's salary: change from KES 1,000,000 → KES 70,000 via EDIT SALARY button on his employee detail page, then RECALCULATE the September draft run.
