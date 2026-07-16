export type Cents = number;

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export function assertCents(n: number, label = "amount"): Cents {
  if (!Number.isInteger(n)) throw new Error(`${label} must be integer cents, got ${n}`);
  if (Math.abs(n) > MAX_SAFE_CENTS) throw new Error(`${label} exceeds safe integer range`);
  return n;
}

export function toCents(value: string | number): Cents {
  const s = String(value).trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid money value: ${value}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = (neg ? s.slice(1) : s).split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  const third = frac[2];
  const rounded = third && Number(third) >= 5 ? cents + 1n : cents;
  const out = Number(neg ? -rounded : rounded);
  return assertCents(out);
}

export function fromCents(c: Cents): string {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export function mulBps(cents: Cents, bps: number): Cents {
  const num = BigInt(cents) * BigInt(bps);
  return bankersDivide(num, 10_000n);
}

export function mulRatio(cents: Cents, numerator: number, denominator: number): Cents {
  if (denominator === 0) throw new Error("division by zero");
  return bankersDivide(BigInt(cents) * BigInt(numerator), BigInt(denominator));
}

export function bankersDivide(num: bigint, den: bigint): Cents {
  if (den < 0n) { num = -num; den = -den; }
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = a / den;
  const r = a * 2n;
  const twiceRem = r - q * den * 2n;
  let out = q;
  if (twiceRem > den) out = q + 1n;
  else if (twiceRem === den) out = q % 2n === 0n ? q : q + 1n;
  return assertCents(Number(neg ? -out : out));
}

export const sum = (...xs: Cents[]): Cents => assertCents(xs.reduce((a, b) => a + b, 0));
export const clampMin = (x: Cents, lo: Cents): Cents => (x < lo ? lo : x);
export const clampMax = (x: Cents, hi: Cents): Cents => (x > hi ? hi : x);
export const clamp = (x: Cents, lo: Cents, hi: Cents): Cents => clampMax(clampMin(x, lo), hi);
export const zeroFloor = (x: Cents): Cents => (x < 0 ? 0 : x);
