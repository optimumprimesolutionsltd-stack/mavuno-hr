/**
 * MONEY — integer minor units (cents).
 *
 * Every amount in this system is an integer number of cents. There are no
 * floats anywhere in the payroll path. This module is the ONLY place allowed
 * to convert between cents and human-facing decimals.
 *
 * Why: `0.1 + 0.2 !== 0.3`. Across a 5,000-employee run with ~20 money fields
 * per payslip, float error compounds until the run no longer reconciles to the
 * cent — and a payroll run that doesn't reconcile is a payroll run you cannot
 * defend to an auditor or to KRA.
 */

export type Cents = number;

/** Largest amount we can represent exactly: 2^53-1 cents ≈ KES 90 trillion. */
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export function assertCents(n: number, label = "amount"): Cents {
  if (!Number.isInteger(n)) throw new Error(`${label} must be integer cents, got ${n}`);
  if (Math.abs(n) > MAX_SAFE_CENTS) throw new Error(`${label} exceeds safe integer range`);
  return n;
}

/** Parse a human decimal string/number ("1234.56") into cents (123456). */
export function toCents(value: string | number): Cents {
  const s = String(value).trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid money value: ${value}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = (neg ? s.slice(1) : s).split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  // Round the third decimal, if the caller supplied one.
  const third = frac[2];
  const rounded = third && Number(third) >= 5 ? cents + 1n : cents;
  const out = Number(neg ? -rounded : rounded);
  return assertCents(out);
}

/** Cents -> decimal string ("123456" -> "1234.56"). */
export function fromCents(c: Cents): string {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Display: "KSh 1,234.56" */
export function formatMoney(c: Cents, currency = "KES", locale = "en-KE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(c / 100);
}

/**
 * Multiply cents by a rate expressed in BASIS POINTS (1 bp = 0.01%).
 * 6% = 600 bps. 2.75% = 275 bps. 1.5% = 150 bps.
 *
 * Rates are integers so the computation stays entirely in integer arithmetic.
 * Banker's rounding (round-half-to-even) is used — the same convention KRA and
 * commercial payroll bureaux apply — so that rounding error does not drift in
 * a single direction across a large run.
 */
export function mulBps(cents: Cents, bps: number): Cents {
  const num = BigInt(cents) * BigInt(bps);
  const den = 10_000n;
  return bankersDivide(num, den);
}

/** Multiply by a rational n/d, keeping integers throughout (e.g. proration). */
export function mulRatio(cents: Cents, numerator: number, denominator: number): Cents {
  if (denominator === 0) throw new Error("division by zero");
  return bankersDivide(BigInt(cents) * BigInt(numerator), BigInt(denominator));
}

/** Round-half-to-even division of BigInts, returned as a safe integer. */
export function bankersDivide(num: bigint, den: bigint): Cents {
  if (den < 0n) { num = -num; den = -den; }
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = a / den;
  const r = a * 2n;
  const twiceRem = r - q * den * 2n;   // 2 * remainder
  let out = q;
  if (twiceRem > den) out = q + 1n;
  else if (twiceRem === den) out = q % 2n === 0n ? q : q + 1n;  // ties -> even
  return assertCents(Number(neg ? -out : out));
}

export const sum = (...xs: Cents[]): Cents => assertCents(xs.reduce((a, b) => a + b, 0));
export const clampMin = (x: Cents, lo: Cents): Cents => (x < lo ? lo : x);
export const clampMax = (x: Cents, hi: Cents): Cents => (x > hi ? hi : x);
export const clamp = (x: Cents, lo: Cents, hi: Cents): Cents => clampMax(clampMin(x, lo), hi);
export const zeroFloor = (x: Cents): Cents => (x < 0 ? 0 : x);
