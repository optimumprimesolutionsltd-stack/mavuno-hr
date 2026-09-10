# Design: billing runs & repricing

Status: **draft / for review**
Author: engineering
Last updated: 2026-09-10

---

## 1. Context

The rate card (`lib/pricing.ts`) computes a charge from an org's **current**
plan and **current** headcount, live, every time a billing screen renders.
Nothing turns that into a bill, and nothing keeps the plan right as the org
changes size.

### What's missing

| Gap | Today |
|---|---|
| **Move between bands as headcount changes** | `recommendPlan()` exists but nothing calls it. A Starter org that grows to 40 keeps paying `2,500 + 150×20 = 5,500` — more than Growth's `4,000` flat. A shrinking org stays on its old (higher) flat fee. |
| **Freeze a charge for a period** | No charge record. `billing_payments.period` is free text ("July 2026"). "Amount due" changes retroactively whenever headcount moves. |
| **Proration** | none — and we don't want it (see §4). |
| **Downgrades** | never happen automatically. |
| **Projection** | the customer can't see a price change coming. |

The banded pricing model (Free/Lite/Starter/Growth/Business) makes this sharper
than the old per-employee model did, because bands have edges.

### What exists to build on

- `billing_payments` (M-Pesa STK + manual verify), `organizations.plan` /
  `.billing_cycle` / `.monthly_charge` (negotiated override).
- `lib/pricing.ts`: `standardMonthlyCents`, `effectiveMonthlyCents`,
  `cycleChargeCents`, `recommendPlan`, and (from the banded-pricing PR)
  `priceBreakdown`, `PLAN_RATES[p].softCapSeats`.
- Scheduler convention: `scheduleFilingReminders()` /
  `scheduleMpesaPaymentPoller()` wired in `artifacts/api-server/src/index.ts`
  (a `setInterval` that self-gates on the date).

---

## 2. Model

### `billing_charges` — one row per org per billing period

```
id                  serial pk
org_id              int  not null -> organizations(id) on delete cascade
period              text not null            -- 'YYYY-MM' (monthly) or 'YYYY' (annual term start)
cycle               text not null            -- 'monthly' | 'annual'
plan                text not null            -- plan in force for this period
active_employees    int  not null            -- headcount the charge was based on
amount_cents        bigint not null          -- effective monthly charge (override wins)
cycle_amount_cents  bigint not null          -- what's actually invoiced (annual = 10x)
source              text not null default 'rate_card'  -- 'rate_card' | 'override'
status              text not null default 'open'       -- 'open' | 'paid' | 'void'
paid_at             timestamptz
created_at          timestamptz not null default now()
```

- Unique `(org_id, period, cycle)` — the billing run is idempotent.
- One row is the frozen bill for that period. It never changes after creation
  except `status` / `paid_at` (or `void` by a super-admin).

### `billing_payments` gains a link

```
+ charge_id  int -> billing_charges(id)   -- the period this payment settles (nullable: legacy + ad-hoc)
```

A verified payment whose amount ≥ the charge's `cycle_amount_cents` flips the
charge to `paid`. Partial payments leave it `open` with the shortfall visible.

---

## 3. The billing run (`scheduleBillingRun`)

A scheduled job, self-gating like `scheduleFilingReminders`: on the **1st of the
month** (and a catch-up if the process starts later), for every organisation
with `status = 'active'`:

1. **Headcount** = active employees **on the last day of the *previous* period**
   (the period being billed). Simple, deterministic, matches "who you had".
   Casuals who left mid-month drop off.

2. **Repricing** (skip entirely if `monthly_charge` override > 0):
   - `nextPlan = recommendPlan(headcount)`.
   - If `nextPlan !== org.plan`:
     - update `organizations.plan`
     - audit `PLAN_AUTO_ADJUSTED` (`{ from, to, headcount, period }`)
     - notify the org admins — **prominently on an increase**:
       *"Your team grew to 40 — from `<period>` you're on Growth, KES 4,000/mo."*
       On a decrease: *"Your team is smaller — you're now on Lite, KES 1,500/mo."*

3. **Snapshot** a `billing_charges` row:
   `amount_cents = effectiveMonthlyCents({ plan, activeEmployees: headcount, overrideCents })`,
   `cycle_amount_cents = cycleChargeCents(amount_cents, org.billing_cycle)`,
   `source = override>0 ? 'override' : 'rate_card'`.
   Idempotent on `(org_id, period, cycle)` — a re-run is a no-op.

4. **Annual cycle:** only create a charge in the org's renewal month (12 months
   after the last annual charge). Between renewals, no monthly charge is written.
   Headcount growth during an annual term **trues up at the next renewal** — the
   renewal charge uses the then-current plan/headcount. (No mid-term overage
   billing in v1.)

**No mid-cycle changes, no proration.** Plan and headcount are read once per
run. Anything that changes after the run applies to the *next* period.

---

## 4. Customer & super-admin surfaces

### `GET /api/billing/my`
Add to the response:
- `currentCharge`: the open `billing_charges` row for the current period
  (period, plan, amount, cycle amount, status, shortfall).
- `nextChargeProjection`: `{ plan, amountCents, cycleAmountCents, changingFrom? }`
  computed from **today's** headcount — so the admin always sees what's coming.
- `payments[]` unchanged, each now carrying its `charge_id` when set.

### Billing screen
Shows: *this period — KES X (paid / due)*, and when the projection differs,
a banner: *"Next month: KES Y (Growth) — your team grew."*

### Super-admin
- `GET /api/super/orgs` gains `currentPeriodStatus` (`paid` / `open` / `overdue`).
- `POST /api/super/billing-run` — trigger the run now (idempotent), for testing
  and catch-up.
- `POST /api/super/charges/:id/void` — write off a period (audited).

---

## 5. Interactions & edge cases

| Case | Handling |
|---|---|
| `monthly_charge` override set | repricing skipped; charge = override amount; `source = 'override'`. Sticky until a human changes it. |
| Org on Trial | no charge while `trial_ends_at` is in the future and plan is `trial`. First charge is the period after the trial ends. |
| Org suspended | no billing run (they can't use the product). Resumes next period on reactivate. |
| Headcount 0 for a month | `recommendPlan(0)` → `free`; charge is KES 0. No dunning. |
| Plan auto-moved then admin disagrees | they can request an override via support → super-admin sets `monthly_charge`. |
| Two runs in one month (restart) | unique `(org_id, period, cycle)` makes the second a no-op. |
| Annual org shrinks | headroom, no rebate. Trues down at renewal. |
| Legacy `billing_payments` with no `charge_id` | left as-is; `charge_id` is nullable. |

---

## 6. Data-model delta

```
billing_charges          new table (§2)
billing_payments
  + charge_id  int null -> billing_charges(id)
organizations            no change (plan / billing_cycle / monthly_charge already exist)
```

Startup migration: `CREATE TABLE IF NOT EXISTS billing_charges (…)` +
`ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS charge_id INTEGER` +
the DDL added to `createBaseSchema()`.

---

## 7. Phasing

| Phase | Scope | Value |
|---|---|---|
| **1** | `billing_charges` table + `scheduleBillingRun` (snapshot only, **no repricing yet**) + `charge_id` link + `currentCharge` in `GET /billing/my` + `POST /api/super/billing-run` | deterministic, frozen monthly bill; foundation for receipts/dunning |
| **2** | Plan onboarding (§9): `PATCH /api/billing/plan` + plan picker + trial-end assignment. Repricing in the run: `recommendPlan` → move plan → audit → notify. `nextChargeProjection` + the "next month" banner | customers can reach a paid band; plan stays right; no surprise bills |
| **3** | Annual renewal handling (charge only in the renewal month, true-up) | correct annual behaviour |
| **4** | `currentPeriodStatus` in super `/orgs`, `void` a charge, overdue flag | ops visibility |
| **5** | Dunning: reminder notifications at +3 / +7 / +14 days overdue; auto-suspend at +30 (super-admin-configurable, off by default) | revenue collection |

Phase 1 is safe to ship alone — it only records what's already computed.

---

## 8. Testing

- **Run idempotency:** two runs for the same period → one `billing_charges` row.
- **Repricing up:** org at 18 employees on Starter, add 10, run → plan `growth`,
  charge `4,000`, `PLAN_AUTO_ADJUSTED` audit, notification queued.
- **Repricing down:** Growth org drops to 8, run → plan `lite`, charge `1,500`.
- **Override:** `monthly_charge = 9000`, headcount 200, run → plan unchanged,
  charge `9,000`, `source = 'override'`.
- **Trial:** `trial_ends_at` next month → no charge this run; charge appears the
  run after expiry.
- **Payment settles charge:** verify a payment ≥ `cycle_amount_cents` → charge
  `status = 'paid'`, `paid_at` set.
- **Projection:** headcount changed since the last run → `nextChargeProjection`
  reflects today's count and flags `changingFrom`.

---

## 9. Plan onboarding — prerequisite for the bands to do anything

The banded rate card (Free / Lite / Starter / Growth / Business) is defined but
**a customer cannot land on any of it**. Today:

- `POST /api/auth/register` hardcodes `plan: 'trial'`.
- `trial_ends_at` passing does nothing — no gate, no transition, no charge.
- Only the super-admin can set a paid plan (`PATCH /api/super/orgs/:id`).
- There is no plan-picker anywhere in the customer app.

So the billing run (§3) has nothing to bill until this exists. Needed:

1. **`PATCH /api/billing/plan`** (`org:admin`) — a customer sets their own plan.
   Constrained: the chosen plan's `softCapSeats` must fit current headcount
   (can't pick Free with 30 employees). Rejects when `monthly_charge` override
   is set (that's negotiated — talk to us). Audited `PLAN_SELECTED`.

2. **Plan picker UI** on the billing screen — the bands as cards/rows, current
   headcount → recommended band highlighted (`recommendPlan`), each showing
   "KES X/mo from `<next period>`". Admin confirms or changes. On confirm →
   `PATCH /api/billing/plan`.

3. **Trial-end transition** (open question #3): when `trial_ends_at` passes and
   plan is still `trial`, the billing run assigns `recommendPlan(headcount)`,
   audits `PLAN_AUTO_ASSIGNED`, and notifies:
   *"Your trial ended — you're on `<plan>`, KES X/mo. Change anytime in Billing."*
   The app is not hard-gated; the first `billing_charges` row for the following
   period makes it real. A persistent banner nudges payment.

4. **Registration** keeps `plan: 'trial'`, but the signup form captures expected
   team size so the billing screen can pre-select the right band on day one.

5. This is the *first-assignment* half of repricing — §3 step 2 is the ongoing
   version. Same `recommendPlan` call, same audit/notify shape.

Suggested placement: **Phase 2** of the rollout (§7), alongside repricing —
they share the plumbing. `PATCH /api/billing/plan` + the picker could ship in
Phase 1 if a manual paid-plan path is wanted before the run exists.

---

## 10. Open questions

1. Headcount basis — **last day of the billed period** (proposed) vs max vs
   average during it? Last-day is simplest and hardest to game in the customer's
   favour.
2. Should an auto-**increase** get a grace period (e.g. one month at the old
   price after notification) rather than applying immediately? Softer, but adds
   state. Leaning: apply immediately, notify clearly — the grace buffer in the
   rate card already cushions small overages.
3. Trial→paid: auto-assign `recommendPlan(headcount)` at trial end, or leave on
   `trial` (KES 0) until they pick? Leaning: auto-assign + notify, so revenue
   doesn't silently sit at zero.
4. Do we need a real invoice document (PDF) in Phase 1, or is the
   `billing_charges` row + the existing receipt flow enough until dunning?
