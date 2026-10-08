/**
 * Which payroll month's returns fall due this month. A payroll's period is
 * the month worked ("2026-09"), and its P10A, NSSF, SHIF and AHL are due by
 * the 9th of the month after — so in October we chase September's returns.
 */
export function filingPeriodFor(now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based, so this is already "last month" 1-based
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, "0")}`;
}

/** "2026-09" → "September 2026". */
export function filingPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
}
