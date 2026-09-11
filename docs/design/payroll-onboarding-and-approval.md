# Design: payroll onboarding (historical runs) & approval workflow

Status: **draft / for review**
Author: engineering
Last updated: 2026-09-10

---

## 1. Context

Two problems surfaced from real usage:

1. **Mid‑year migration.** A customer switching to Mavuno part‑way through the tax
   year has no way to bring the months they already ran on their old system.
   Kenyan PAYE is computed **monthly** (not cumulatively), so each new month's
   figures are correct regardless — but the **year‑end P9A / P10** are
   incomplete, because those aggregate every paid run in the calendar year and
   Mavuno only holds the post‑cutover months. There is no "opening balances"
   concept and no import path.

2. **Approval is too heavy for small orgs.** The run lifecycle is
   `draft → submit → approve → pay`, `approve` is blocked when the approver is
   the person who submitted (`canApproveRun`), and disbursement, statutory
   filing and payslip email are three further separate actions. For a one‑ or
   two‑person business where the owner does everything, the maker‑checker
   handoff is impossible to satisfy and the click count is punishing.

Both are **onboarding / day‑to‑day friction**, not compliance gaps. This doc
specifies a fix for each, plus the small shared org‑settings surface they need.

### What already works (no change needed)

- `payroll_runs.run_type` is a free `text` column (`"regular"` today).
- `payroll_runs.period` accepts any `YYYY-MM`; there is **no** "must be the
  current month" guard.
- `resolveConfig(tx, orgId, country, period)` already selects the statutory pack
  whose `effective_from ≤ period` and which has not expired — so a backdated run
  uses period‑correct SHIF / NSSF / Housing Levy / PAYE rules. Built‑in packs go
  back to `2021-01-01`.
- `payableDays()` prorates against the employee's real `hire_date` /
  `termination_date`.
- Year‑to‑date / P9A / P10 aggregate `paid` runs by
  `period.startsWith(<year>)` — so any run that reaches `status = 'paid'` with an
  in‑year period is picked up automatically.
- `employees.leave_balance` is editable on create/update (tenths of a day).
- The `pay` action's only side effects are `applyLoanRepayments` + status change.
  Payout files (`POST /:id/payouts`), filings (`POST /:id/filings`) and payslip
  email (`POST /:id/email-payslips`) are **separate** endpoints.

---

## 2. Shared: organisation payroll settings

New columns on `organizations`:

| column | type | default (new / existing) | purpose |
|---|---|---|---|
| `requires_payroll_approval` | `boolean` | `false` / `true` | maker‑checker on/off (Feature B) |
| `payroll_start_period` | `text` `YYYY-MM`, nullable | `null` | first month Mavuno is the system of record; earlier = historical (Feature A) |
| `auto_generate_payout_on_pay` | `boolean` | `false` | build the bank / M‑Pesa file automatically when a run is paid |
| `auto_email_payslips_on_pay` | `boolean` | `false` | email payslips automatically when a run is paid |

- Existing orgs migrate to `requires_payroll_approval = true` → **zero behaviour
  change**. New orgs start `false`.
- Only the **admin** role may change any of these.
- Changing a setting never rewrites past runs.
- Statutory **filing** is never automated — remitting to KRA/NSSF/SHIF and
  re‑filing are dangerous as click side effects.

Settings live under **Settings → Payroll**; the key ones are also asked in the
onboarding wizard (§6).

---

## 3. Feature A — historical (migration) payroll runs

### 3.1 Goal / non‑goals

**Goal:** let a live customer reconstruct the payroll months they ran elsewhere
so Mavuno holds a correct year‑to‑date and a complete P9A/P10 for the current
tax year — **without** Mavuno re‑filing returns, generating bank files, or
emailing payslips for those months.

**Non‑goals:** GL/accounting migration; retroactive compliance; automated
reconciliation against the prior system's PDFs.

### 3.2 Model

- `payroll_runs.run_type` gains the value `"historical"`. No column change.
- Shortened lifecycle:

  ```
  draft ──(finalize)──▶ paid          (reuses "paid" so every existing
    │                                   year-to-date / P9A query works unchanged)
    └──(reverse)──▶ reversed
  ```

  `paid_at` = last day of `period`; `paid_by_user_id` = the migrator.
  "paid" here means *recorded as already paid on the prior system*.

- Draft historical runs stay **payslip‑editable** (reuse
  `payslip-edit-dialog.tsx`) so the migrator can match the old system's numbers
  (rounding, ad‑hoc items) before finalising.

- Optional, Phase 2 — `employee_ytd_opening` table, only for customers who want
  to enter **summary** YTD figures instead of month‑by‑month:

  ```
  id, org_id, employee_id, tax_year,
  opening_gross, opening_paye, opening_nssf_employee, opening_shif,
  opening_housing_levy_employee, opening_pension_relief,
  opening_insurance_relief,                          -- all money (cents)
  source text, created_at, created_by_user_id
  ```

  P9A/P10 aggregation adds these to the per‑year sum. Unused for month‑by‑month
  migrations.

### 3.3 API

**`POST /api/payroll`** (`calculateRunSchema`)

- `run_type` enum gains `"historical"`.
- When `run_type === "historical"`:
  - `period` must be **strictly before** `org.payroll_start_period` (or, if
    unset, before the current month) → else `422 HISTORICAL_PERIOD_NOT_PAST`.
  - `period` must resolve a statutory config (existing `422 NO_STATUTORY_CONFIG`).
  - Reject if a **`regular` paid run already exists for the same `period`** →
    `409 PERIOD_ALREADY_LIVE` (prevents double counting in P9A). Symmetric
    warning on the regular path when a historical paid run exists for the period.
- Calculation is **identical** to a regular run (period‑correct config, real
  hire/termination proration).
- **`applyLoanRepayments` is NOT called** for historical runs — loans are
  migrated separately at their end‑of‑history balance (§3.6).
- Historical runs **do not touch `leave_balance`**.

**Run action — `finalize`** (add to `runActionSchema.action`)

- Valid only when `run_type = "historical"` and `status = "draft"`.
- Sets `status = "paid"`, `paid_at = end(period)`, `paid_by_user_id`.
- Runs **no** `applyLoanRepayments`, creates **no** `payout_batches` /
  `statutory_filings`, sends **no** email.
- Audit `PAYROLL_HISTORICAL_FINALIZED`.

**Blocked for `run_type = "historical"` → `409 HISTORICAL_RUN_LOCKED`**

- `POST /api/payroll/:id/payouts`
- `POST /api/payroll/:id/filings`
- `POST /api/payroll/:id/email-payslips`

**Filing reminders** (`lib/filing-reminders.ts`) skip runs where
`run_type = 'historical'` **or** `period < org.payroll_start_period`.

**Variance report** (`GET /:id/compare`) — exclude `run_type = 'historical'`
when choosing the "previous run" for a regular run (cosmetic).

### 3.4 Reports (mostly automatic)

| Report | Behaviour |
|---|---|
| P9A (12‑month card) | historical runs are `paid` + in‑year → **included**; add a footnote when a year contains historical runs |
| P10 / annual PAYE | included via existing `paidRuns.filter(period.startsWith(year))` |
| Per‑run muster roll / summary CSV | unchanged |
| Statutory filing screens | badge **"Historical — recorded, not filed via Mavuno"**; file buttons disabled |
| Dashboard "last payroll run" | ignores historical runs |
| CRM usage sync (`payrollRuns`) | count `run_type != 'historical'`; expose `historicalRuns` separately |

### 3.5 UI

- **New‑run dialog:** run‑type control gains **"Historical / migration"**. Period
  picker limited to past months (floor = Jan of current tax year; "include prior
  year" advanced toggle). Inline notice:
  > Records a month you already ran on your previous system. Builds your
  > year‑to‑date and P9A. Will not file returns, generate bank files, or email
  > payslips.
- **Payroll list:** distinct badge + a "Migration history" filter.
- **Run detail:** hide Payout / Filing / Email actions; show *"Recorded &lt;date&gt;
  by &lt;user&gt; · migrated from prior system."*; keep payslip edit on draft.
- **Employee form:** helper text that `leave_balance` is the opening balance at
  migration.
- **Settings → Payroll:** "Mavuno is our payroll system from"
  (`payroll_start_period`); warn if set at/after a month that already has
  historical runs.

### 3.6 Loans (Phase 4) ✅ shipped

`POST /api/loans` gained optional body:

| field | type | effect |
|---|---|---|
| `openingBalance` | money string | `loans.balance = openingBalance`; `loans.principal = amount` (original); rejected with `422` if it exceeds `amount` |

Audit `LOAN_MIGRATED` (instead of `LOAN_ISSUED`) when `openingBalance` is set.
`disbursedOn` was not added as a separate field — the existing `startDate`
already accepts any past date, so it doubles as the disbursement date for
migrated loans. Surfaced in the admin "Issue loan" dialog as a "this loan was
already partially repaid" checkbox that reveals the outstanding-balance field.

### 3.7 CSV bulk import (Phase 5 — large migrations only) ✅ shipped

`POST /api/payroll/historical/import`, JSON body `{ rows: [...], dryRun? }`
— **not** multipart; the admin UI parses the CSV client-side (same pattern
as the employee bulk importer) and posts rows as JSON, so no new upload
middleware was needed. One historical run per distinct `period`, payslip
rows inserted **verbatim from the CSV** (no recompute — trust the prior
system), run totals rolled up, run created directly at `paid` (no separate
finalize step — CSV import trusts the source fully).

```
period,empNo,daysPayable,basic,allowances,nonCashBenefit,gross,
nssfEmployee,shif,housingLevyEmployee,pensionEmployee,
taxableIncome,payeBeforeRelief,personalRelief,insuranceRelief,paye,
helb,sacco,otherDeductions,netPay
```

`resolveConfig` requirement relaxed: falls back to the oldest config on file
for the country (the snapshot is informational only — CSV rows are never
recomputed against it) rather than blocking the import.

`dryRun: true` runs the full validation (unknown `empNo`, period ≥ cutover,
duplicate `(period, empNo)` in the same file, a run already existing for
the period) without writing anything, returning the same `{ imported,
skipped, errors, runs }` shape the real import would. The admin UI always
dry-runs first and shows the per-period breakdown before the user commits.
Template download: `GET /api/payroll/historical/import/template`.

**Known gap, not addressed here:** the single-run "Historical / migration"
option specified in §3.5 for the New Payroll Run dialog, and the
draft-editable / finalize UI on the run detail page, were never actually
wired up on the frontend — only the backend (`calculateRun`, the `finalize`
action, the `HISTORICAL_RUN_LOCKED` guards) shipped in Phase 2. Today there
is no UI path to create a **single** historical run by hand; only this CSV
importer (which always finalizes immediately) can create one. Flagged as a
follow-up, out of scope for Phase 5.

### 3.8 Edge cases

| Case | Handling |
|---|---|
| Employee hired after the historical period | `payableDays` → 0; exclude via `employeeIds` or emit a zero payslip |
| Employee terminated mid‑history | `termination_date` prorates automatically |
| No statutory config for an old month | `422 NO_STATUTORY_CONFIG` (packs reach 2021‑01‑01); CSV import bypasses |
| Two historical runs, same period | second → `409` |
| Historical run for current/future month | `409` |
| Reverse a historical run | allowed → `reversed`, drops out of P9A |
| Prior‑year (e.g. 2025) historical run | allowed if a config exists; picker defaults to current tax year |
| Loan repayments during history | not applied by historical runs; migrate the loan at end‑of‑history balance |

---

## 4. Feature B — approval workflow

### 4.1 The switch

`organizations.requires_payroll_approval` (`boolean`, default `false` for new
orgs, `true` for existing).

**OFF (default):** whoever runs payroll takes it all the way,
`draft → paid` in one action ("Run & pay", optional Preview first). No
"different person" rule. Covers the solo admin / two‑person business.

**ON:** today's flow — `payroll:submit` prepares, a **different** user with
`payroll:approve` signs off (`canApproveRun` enforces maker ≠ checker), then
`payroll:disburse` pays. Maker‑checker for orgs that want it; a genuine
mid‑market selling point, so it is kept, not removed.

Binary beats a 3‑mode enum: the real decision is *"does a second person sign
off? yes / no"*. "Preview then pay" remains available as a UI habit in the OFF
state, not a configured mode. Two‑approver support, if ever needed, is a future
`approval_levels int` — out of scope now.

### 4.2 Implementation

- One column: `requires_payroll_approval boolean not null default false`.
- `canApproveRun` → `if (!org.requires_payroll_approval) return { ok: true }`
  (the `payroll:approve` permission is still required — `admin` holds it).
- `approve` action becomes valid from `draft` (not only `pending_approval`) when
  approval is OFF, merging submit + approve.
- New `run` action = approve + pay in one call when approval is OFF; gate on
  `role === 'admin'` (or a `payroll:run_all` permission only `admin` holds).
- `POST /api/payroll` gains `finalize?: boolean` → when approval is OFF and the
  caller is `admin`, chain calculate → approve → pay in one transaction.
- **Audit unchanged:** still write `PAYROLL_SUBMITTED` / `APPROVED` / `PAID`
  rows with the real actor and timestamps. The clicks collapse, the trail does
  not.
- Readiness check (missing NSSF/SHIF/KRA numbers) still blocks finalise in every
  mode — surfaced inline, not as a step.
- Confirmation modal on the one‑click path: *"Pay KES X to N employees — final,
  no further approval."*
- `reverse` unchanged — the escape hatch when there is no second reviewer.
- Setting is admin‑only; toggling it never touches past runs.

### 4.3 Killing the tail

The `auto_generate_payout_on_pay` and `auto_email_payslips_on_pay` org toggles
(§2) remove the remaining post‑pay clicks. Approval OFF + both toggles =
**one button** produces the run, payslips, bank file and payslip emails.
Filing stays the only deliberate action.

---

## 5. Data model — all changes in one place

### `organizations` (new columns)

```
requires_payroll_approval  boolean  not null default false   -- existing orgs migrated to true
payroll_start_period       text     null                     -- 'YYYY-MM'
auto_generate_payout_on_pay boolean not null default false
auto_email_payslips_on_pay  boolean not null default false
```

### `payroll_runs`

- No column change. `run_type` gains accepted value `"historical"`.

### `runActionSchema.action` (Zod)

- add `"finalize"` (historical runs)
- add `"run"` (approve + pay, approval‑OFF only)

### `calculateRunSchema` (Zod)

- `run_type` enum gains `"historical"`
- add `finalize?: boolean`

### New table (Phase 2, optional)

- `employee_ytd_opening` (§3.2)

### `loans` (Phase 3)

- `POST /api/loans` body gains optional `openingBalance`, `disbursedOn`
  (no column change — `principal` / `balance` / `start_date` already exist)

---

## 6. Onboarding wizard

Two questions, both writing org settings:

1. **"Does someone other than the person preparing payroll need to approve it?"**
   - No → `requires_payroll_approval = false`
   - Yes → `true`

2. **"Have you run payroll on another system this year?"**
   - No → `payroll_start_period = <current month>`
   - Yes, from &lt;month&gt; → `payroll_start_period = <that month>` and offer the
     "add historical months" flow.

---

## 7. Phasing

| Phase | Scope | Unblocks |
|---|---|---|
| **1** | `requires_payroll_approval` column + `canApproveRun` bypass + `approve`‑from‑draft + `run` action + `finalize` audit chain | small‑org approval pain |
| **2** | `run_type = "historical"` + `finalize` action (skip loans) + block payout/filing/email on historical + filing‑reminder exclusion + same‑period guard + new‑run UI toggle + run‑detail suppression | **mid‑year migration (e.g. current Ujenzi onboarding)** |
| **3** | `payroll_start_period` + reminders/reports/CRM‑signal awareness + `auto_*_on_pay` toggles | clean multi‑customer onboarding, fewer clicks |
| **4** ✅ | loan `openingBalance` on `POST /api/loans` | customers with running loans |
| **5** ✅ (CSV half) | `employee_ytd_opening` summary entry **or** CSV historical import + template | 50+ staff migrations |

Phases 1 and 2 are independent and can ship in either order.

---

## 8. Testing

**Feature A**

- Unit: `calculateRun({ runType: 'historical', period: '2026-03' })` → payslips
  use the March pack; `applyLoanRepayments` not invoked.
- Integration: create historical `2026-03` → `finalize` → appears in 2026
  P9A/P10; `POST /:id/filings` → 409; `POST /:id/payouts` → 409; filing‑reminder
  job skips it.
- Guard: `regular` run for a period with an existing historical paid run → 409.
- Reversal: reversed historical run drops out of P9A.
- Cutover: `payroll_start_period = 2026-09` → reminders silent Jan–Aug;
  historical run for `2026-09` rejected.

**Feature B**

- `requires_payroll_approval = false`: single user takes a run `draft → paid`
  via `run`; all three audit events written with that actor.
- `= true`: `approve` by the submitter → 403; by a different `payroll:approve`
  user → ok.
- Readiness failure blocks `run` / `finalize` in both modes.
- Non‑admin in an approval‑OFF org: run lands in `draft`, cannot `run`.

---

## 9. Open questions

1. CRM `payrollRuns` usage signal — exclude historical (recommended) or show a
   combined count with a breakdown?
2. Historical runs — recompute from the employee master only, or always allow
   per‑payslip edit on the draft (recommended: allow edit — reuse the existing
   dialog)?
3. Onboarding default for `payroll_start_period` when the customer skips the
   question — current month, or leave `null` (no historical awareness)?
4. Should `run` (one‑click approve + pay) also be available to a dedicated
   `payroll_officer` role in an approval‑OFF org, or admin‑only?
