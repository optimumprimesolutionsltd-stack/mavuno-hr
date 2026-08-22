import { fromCents, type Cents } from "@/lib/money";

/**
 * Display formatting for CENTS values. Every amount coming out of the DB and
 * the payroll engine is an integer number of cents — these are the only
 * functions in the app allowed to turn that into a human string.
 */
export const kes = (c: Cents, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(c / 100);

export const kes2 = (c: Cents, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(c / 100);

/** Plain decimal string, no currency symbol — for PDF table cells etc. */
export const num0 = (c: Cents) => Math.round(c / 100).toLocaleString("en-KE");
export const num2 = (c: Cents) => fromCents(c).replace(/\B(?=(\d{3})+(?!\d))/g, ","); // "1,234.56"
