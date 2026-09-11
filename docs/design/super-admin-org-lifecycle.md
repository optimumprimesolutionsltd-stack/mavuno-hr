# Design: super-admin org lifecycle — access window, provisioning, SLA credits

Status: **draft / for review**
Author: engineering
Last updated: 2026-09-10

---

## 1. Context

Three related gaps in how the super-admin manages customer organisations:

1. **There is no access-expiry.** A trial never actually ends; a lapsed
   subscription never locks. (Details in §2.)
2. **The super-admin cannot create an org.** Orgs are born only by
   self-registration (`POST /api/auth/register`). There is no way to
   provision one for a customer, or to onboard someone who can't self-serve.
3. **There is no way to credit a customer.** When Mavuno owes a customer money
   or time — an outage, a goodwill gesture, a billing correction — the only
   lever is to quietly change a number on the org row. No record, no audit, no
   customer-visible trail.

This doc specs a fix for each, in dependency order.

### Current state (verified in code)

| Thing | Where | Behaviour |
|---|---|---|
| Access gate | `session.ts` `getPrincipal` | session must be valid & unexpired; `user.disabledAt` must be null; **`org.status` must not be `"suspended"`**. That is the whole gate. |
| `trialEndsAt` | schema + `super.ts` only | Never set on registration (stays `NULL`). Never read to gate anything. Purely a display field in the super console. |
| `status` | `super.ts` suspend/activate | `active` ↔ `suspended`. `suspended` hard-blocks every authenticated request for that org. |
| `seatLimit` | `payroll-run.ts` | Soft block: a payroll run covering more employees than `seatLimit` returns `402 SEAT_LIMIT_EXCEEDED`. |
| Billing | `billing.ts` | Manual receipt entry + M-Pesa STK; a verified payment writes a `billing_payments` row. **No invoice engine, no dunning, no auto-suspend, no credits.** |
| Org creation | `auth.ts` `POST /register` | self-service only: creates org (`plan:"trial"`, `seatLimit:25`, `status:"active"`) + first admin user (`role:"admin"`, `mustChangePassword:false`). |
| Same email, many orgs | `users` unique index `(org_id, email)` | Allowed — a person can be a user/admin in more than one org. |

**Answer to "is the expiry period for access present?": no.** Access is binary
(`active` vs `suspended`), flipped by hand. Nothing time-based below the session
layer.

---

## 2. Feature A — access window (`organizations.access_until`)

Foundational: comping, grace periods and "trial actually ends" all need a
single enforced date.

### Model

| column | type | meaning |
|---|---|---|
| `access_until` | `timestamptz`, nullable | Hard access cut-off. `NULL` = unlimited (no expiry). |

- Registration sets `access_until = now() + 14 days` and `trialEndsAt =` the same
  value. `trialEndsAt` stays as the informational "trial" label; `access_until`
  is the enforced one. (A later cleanup can drop `trialEndsAt`.)
- A verified payment (or a super-admin action) pushes `access_until` forward —
  by one billing cycle for a monthly plan, ~12 months for annual, etc.
- Startup migration adds the column `NULL`; existing orgs stay `NULL` (unlimited)
  until someone sets a date, so nothing locks unexpectedly.

### Enforcement

`getPrincipal` keeps returning the principal (so a lapsed customer can still log
in and reach the billing page). A new middleware gates the *rest*:

```
requireActiveAccess()   ->   402 ACCESS_EXPIRED   when
    org.access_until IS NOT NULL AND org.access_until < now()
```

Applied to the feature routers (`payroll`, `employees`, `timesheets`, `leaves`,
`loans`, `departments`, report exports). **Not** applied to: `auth`, `billing`
(read + pay), `settings` (read), `notifications`. So the experience is:
"everything is read-only / locked, here's how to pay" rather than a blunt logout.

`status = "suspended"` still hard-blocks at `getPrincipal` (unchanged) — that is
the heavier hammer for abuse / chargebacks.

### Super-admin control

`PATCH /api/super/orgs/:id` gains `accessUntil: string datetime | null`.
`GET /api/super/orgs` already returns `trialEndsAt`; add `accessUntil` and a
derived `accessState: "active" | "expiring_soon" | "expired" | "unlimited"`.

### Grace period

No separate concept — a grace period *is* `access_until` pushed a few days past
the paid-through date. The super console can offer a "＋7 days grace" quick action.

### Shipped (Phase 1) ✅

Built as specified, plus one addition beyond the Phase 1 table row: **a
verified payment now pushes `access_until` forward automatically** —
`extendAccessUntil(current, cycle)` in `lib/pricing.ts` (+1 month / +1 year
from the later of "now" or the current `access_until`, so paying early never
wastes days), wired into both `POST /api/billing/:id/verify` (super-admin
manual verification) and the M-Pesa callback path in `POST
/api/billing/mpesa/callback`. Without this, Phase 1 would ship an expiry
mechanism with no way for an actual payment to clear it — only a manual
super-admin edit. Both paths write `ORG_ACCESS_UNTIL_SET` audit rows (the
M-Pesa one with `actorUserId: null`, `actorEmail: "mpesa@system"` — no human
initiated it).

`GET /api/billing/my` also gained `accessUntil` / `accessState`, and the
customer billing page (`src/pages/admin/billing/index.tsx`) shows a banner
when `expiring_soon` or `expired` — the "everything is read-only / locked,
here's how to pay" experience the design calls for. The super console's
company table swapped its "Trial ends" column for "Access" (state-colored),
and the edit dialog gained an "Access until" date field + a "+7 days grace"
button that pre-fills the date (still requires hitting Save).

**Decision on Open question #1** (block mutations only vs. the whole
router): shipped as **whole-router** lock, matching §2's literal
"Applied to the feature routers" wording rather than splitting by verb — the
read/write split stays an open question, not implemented.

Gated routers, exactly as listed: `payroll`, `employees`, `timesheets`,
`leaves`, `loans`, `departments`. `audit`, `calculator`, `portal`, `users`,
and `filings` were **not** gated — they're not in §2's explicit list, and
`portal` in particular (employee self-service payslip viewing) seemed wrong
to lock over the org's own non-payment. `requireActiveAccess()`
(`middlewares/require-auth.ts`) does its own `getPrincipal()` lookup rather
than reusing `req.principal`, because it runs at the router-mount level in
`routes/index.ts`, before each route's own `requireAuth()` populates that —
a second cheap, indexed session lookup per gated request, not a schema or
behavior compromise.

---

## 3. Feature B — super-admin provisioning (`POST /api/super/orgs`)

### Request

```jsonc
{
  "name": "Ujenzi Distributors Ltd",
  "slug": "ujenzi-distributors-ltd",   // optional; slugified from name if absent
  "countryCode": "KE",                 // default "KE"
  "currencyCode": "KES",               // default "KES"
  "kraPin": "P051234567X",             // optional
  "plan": "growth",                    // PLAN_IDS; default "trial"
  "seatLimit": 30,                     // default from plan
  "billingCycle": "monthly",           // BILLING_CYCLES; default "monthly"
  "monthlyChargeOverrideCents": 0,     // optional negotiated override
  "accessUntil": "2026-12-31T23:59:59Z", // optional; default now + 14d
  "admin": {
    "email": "hr@ujenzi.co.ke",
    "name": "Jane Mwangi",
    "sendInvite": true                 // true: email a set-password link.
                                       // false: return a one-time link for the
                                       //        super-admin to pass on.
  }
}
```

### Behaviour (one transaction)

1. Slug: validate `^[a-z0-9-]+$`; on `orgs_slug_uq` collision → `409`
   (or auto-suffix `-2` when `?autoSlug=true`).
2. Insert `organizations` row with the above + `status:"active"`.
3. Insert the admin `users` row: `role:"admin"`, `mustChangePassword:true`,
   `passwordHash` = a random unusable hash. Reuse `password_reset_tokens` to
   mint a set-password token (longer TTL — 7 days).
4. `writeAudit` `SUPER_ORG_CREATED` (+ `SUPER_ORG_ADMIN_INVITED`).
5. If `admin.sendInvite`: send a "Set up your Mavuno HR account" email via Resend
   (same infra as password reset). Else: return the token URL in the response.

### Response

```jsonc
{
  "org": { "id": 42, "slug": "ujenzi-distributors-ltd", "plan": "growth", ... },
  "admin": { "id": 128, "email": "hr@ujenzi.co.ke" },
  "inviteUrl": "https://mavunohr.co.ke/app/admin/reset-password?token=…", // when sendInvite=false
  "inviteEmailed": true                                                   // when sendInvite=true
}
```

### Guardrails

- Super-admin only (`requireSuperAdmin()`).
- `admin.email` may already exist in another org (unique index is
  `(org_id, email)`), so no cross-org check — but warn in the response if it does.
- `countryCode` with no statutory config on file → still create, but flag
  `warnings: ["No statutory config for XX — payroll will 422 until one is loaded"]`.
- `seatLimit` defaults to the plan's cap if omitted.

### UI

`src/pages/super/index.tsx` gains a **"New organisation"** button → a modal with
the fields above. On success, show the invite link (copyable) or "invite sent".

### Shipped (Phase 2) ✅

Built as specified, with one deliberate deviation from the response shape:
**`inviteUrl` is always returned**, not only when `sendInvite: false`. When
`sendInvite: true` and the email fails to send (still a possible outcome —
`sendOrgInviteEmail` failures are caught and turned into a `warnings[]` entry
rather than failing the whole request, since the org and admin user are
already committed by that point), the super-admin would otherwise have no
way to get the customer their set-up link at all. `inviteEmailed: boolean`
still tells the UI which case it is.

`seatLimit` default is `PLAN_RATES[plan].softCapSeats ?? 1_000_000` — the
point at which `recommendPlan()` would point to the next plan up (matches
the "unlimited seats" convention already used elsewhere for `softCapSeats:
null` plans). The admin's initial `passwordHash` is `hashPassword(
generateTempPassword())` (existing `lib/password.ts` helper) — a random
string nobody is told, reusing the same "impossible to log in with until the
token is redeemed" trick rather than inventing a new one.

The set-password token reuses `password_reset_tokens` unmodified (no `kind`
column needed — `POST /api/auth/reset-password` sets the password, clears
`mustChangePassword`, and revokes sessions identically whether the token
started life as a forgot-password or a first-time invite). TTL is 7 days
vs. the 1-hour forgot-password window.

Slug collision: `409 SLUG_TAKEN` by default; `?autoSlug=true` retries
`{base}-2`, `{base}-3`, ... until one is free, per §3.

---

## 4. Feature C — SLA credits & billing adjustments

### Model — new table `billing_credits`

```
id                     serial pk
org_id                 int  not null  -> organizations(id) on delete cascade
amount_cents           bigint not null           -- positive = owed TO the customer
currency               text not null default 'KES'
kind                   text not null             -- 'sla' | 'goodwill' | 'refund'
                                                 -- | 'correction' | 'promo'
reason                 text not null             -- human explanation
period                 text                      -- 'YYYY-MM' this credit offsets, or null (any)
status                 text not null default 'open'  -- 'open' | 'applied' | 'void'
applied_to_payment_id  int   -> billing_payments(id)  -- set when consumed
created_by_user_id     int   -> users(id)
created_at             timestamptz not null default now()
applied_at             timestamptz
voided_at              timestamptz
voided_by_user_id      int   -> users(id)
note                   text
```

Index `(org_id, status)`.

### Endpoints

| method | path | who | notes |
|---|---|---|---|
| `POST` | `/api/super/orgs/:id/credits` | super-admin | issue a credit (`amount_cents`, `kind`, `reason`, optional `period`) |
| `GET`  | `/api/super/orgs/:id/credits` | super-admin | list, with running open balance |
| `POST` | `/api/super/credits/:id/void`  | super-admin | void an **open** credit only |
| `GET`  | `/api/billing/my` (existing)   | company admin | add `credits: [...]` + `openCreditCents` to the response |

Audit: `BILLING_CREDIT_ISSUED`, `BILLING_CREDIT_VOID`, `BILLING_CREDIT_APPLIED`.

### How a credit gets consumed

Mavuno has no invoice engine, so "apply" happens at **payment-verification**
time (`billing.ts` manual verify, and the M-Pesa callback path):

1. Compute `expectedCents` for the period = `effectiveMonthlyCents(...)` (or the
   annual figure).
2. `netExpected = max(0, expectedCents − sum(open credits, oldest first, capped
   at expectedCents))`.
3. When a payment ≥ `netExpected` is verified: mark the consumed credits
   `applied`, set `applied_to_payment_id` + `applied_at`, and push
   `access_until` forward by the paid cycle.
4. Any credit larger than the invoice is split: the consumed part closes, the
   remainder stays `open` for next time.

v1 can ship steps 1–2 as **advisory only** (the super-admin sees "expected KES X,
credits KES Y, collect KES Z" and verifies manually); step 3 automation is a
fast-follow.

### Customer-facing

`GET /api/billing/my` returns open credits; the billing page shows
*"KES 4,500 credit — applies to your next payment"* with the reason.

### Shipped (Phase 3) ✅ — table + issue/list/void + display only

Built exactly as specified: `billing_credits` table (both in
`createBaseSchema()` and its own `createBillingCreditsTable()` startup-migration
step, matching the dual pattern already used for `billing_payments`), the
three super-admin endpoints, and `GET /api/billing/my` gaining `credits: []`
+ `openCreditCents`. The super console's org actions row gained a "Billing
credits" (gift icon) button opening a dialog with the open balance, an issue
form, and a void action per open credit — all three `BILLING_CREDIT_*` audit
actions are written (`APPLIED` is defined and used nowhere yet — see below).

**Not shipped: consumption.** The "How a credit gets consumed" steps 1–4
above — computing `netExpected` at payment-verification time, auto-marking
credits `applied`, splitting a credit larger than the payment — are **all**
still open, including the "advisory only" v1 the design suggested (step
1–2: showing "expected KES X, credits KES Y, collect KES Z" to the
super-admin during manual verification). Today `openCreditCents` is purely
informational on both the super console and the customer billing page; nothing
reads it during `POST /api/billing/:id/verify` or the M-Pesa callback, so a
verified payment does **not** currently account for open credits before
pushing `access_until` forward (Phase 1's `extendAccessUntil()` runs
unconditionally). A super-admin issuing a credit today must still manually
remember to collect less, or issue/verify a payment for the reduced amount
by hand. This is Phase 4, not started.

### Downtime → credits (Feature C+, later)

A super-admin **"Apply outage credit"** tool:

- input: outage window (start, end), affected scope (all active paid orgs / a
  list), and a multiplier (1× = pure pro-rata, >1× = goodwill).
- for each org: `credit = round(monthly_charge × outage_minutes ÷
  minutes_in_month × multiplier)`, `kind:'sla'`,
  `reason:"Service disruption 2026-09-10 08:00–11:30 EAT"`.
- optionally also bump `access_until` by the outage duration (access make-good).
- one audit event per org + one summary event.

---

## 5. Worked example — "company paid, Mavuno had downtime"

1. Outage 09:00–12:30 EAT (3.5 h ≈ 210 min).
2. Super-admin opens **Apply outage credit**, scope = all active paid orgs,
   multiplier 2×.
3. For "Acme Ltd" on `growth` at KES 30,000/mo:
   `30000 × 210 ÷ 43200 × 2 ≈ KES 292` credit, `kind:'sla'`.
   *(also, if desired: `access_until += 210 min`.)*
4. Acme's admin sees *"KES 292 credit — Service disruption 2026-09-10"* on their
   billing page.
5. Next month Acme owes `30,000 − 292 = KES 29,708`; on verification the credit
   flips to `applied` and links to that payment.

No untracked edits to the org row; every step is audited and visible to the
customer.

---

## 6. Data-model delta

```
organizations
  + access_until  timestamptz null

billing_credits   (new table, see §4)

runActionSchema / super patchOrgSchema
  + accessUntil (super PATCH)

users            no change  (unique index already (org_id, email))
```

---

## 7. Permissions & audit

- All new `/api/super/*` routes: `requireSuperAdmin()`.
- `requireActiveAccess()` middleware: applied per-router (feature routes only).
- Audit events: `SUPER_ORG_CREATED`, `SUPER_ORG_ADMIN_INVITED`,
  `ORG_ACCESS_UNTIL_SET`, `BILLING_CREDIT_ISSUED`, `BILLING_CREDIT_VOID`,
  `BILLING_CREDIT_APPLIED`, `SUPER_OUTAGE_CREDIT_RUN`.

---

## 8. Phasing

| Phase | Scope | Unblocks |
|---|---|---|
| **1** ✅ | `organizations.access_until` + `requireActiveAccess()` middleware + super `PATCH accessUntil` + `accessState` in `GET /orgs`. Registration sets it to now+14d. | trials that actually end; grace periods; a meaningful "let them keep using it" lever |
| **2** ✅ | `POST /api/super/orgs` + invite email + "New organisation" modal in the super console | provisioning for customers who can't self-serve |
| **3** ✅ | `billing_credits` table + issue / list / void endpoints + `GET /api/billing/my` credit display | recorded, customer-visible credits |
| **4** | advisory `netExpected` at payment-verify + auto-mark `applied` | credits actually reduce what's collected |
| **5** | "Apply outage credit" bulk tool | one-click SLA make-good across the customer base |

Phase 1 is the prerequisite for the downtime scenario to mean anything;
Phases 3–5 make it fair and auditable.

---

## 9. Open questions

1. When `access_until` lapses, lock **all** feature routes, or leave payroll
   *read* open (so they can still see last month's payslips) and block only
   *mutations*? (Leaning: block mutations + exports, allow reads.)
2. Should a credit be able to *extend `access_until`* directly (time instead of
   money), or always be a money amount that the customer still has to "spend" by
   paying less? (Leaning: support both — `kind:'sla'` credits may carry an
   optional `access_days` that bumps the date on issue.)
3. Provisioning: if `admin.email` already exists in another org, create a second
   `users` row (current unique index allows it) or link the existing user?
   (Leaning: second row — orgs are hard tenancy boundaries here.)
4. Do we need per-plan default `seatLimit` / trial length in `lib/pricing.ts`,
   or keep the hardcoded 25 / 14 days?
