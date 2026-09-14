// ─────────────────────────────────────────────────────────────────────────────
// When a demo can be asked for.
//
// A demo request lands in the Optimum Prime CRM (see api-server's
// lib/optimum-crm.ts), where the team confirms a slot and the customer gets a
// confirmation carrying that date and time. A preferred slot outside the hours
// the team actually works is a slot they have to ring back and renegotiate, so
// the form offers only real ones — the same rules the Tally site's own demo
// form applies, kept here rather than imported because the two sites are
// separate deployments.
//
// Rules (Kenya / EAT):
//   • Closed on Sundays and Kenyan public holidays.
//   • Weekdays 8:00 AM–5:00 PM, with a 1:00–2:00 PM lunch break.
//   • Saturdays 8:00 AM–1:00 PM (no lunch break).
// ─────────────────────────────────────────────────────────────────────────────

// Recurring annual holidays as MM-DD.
const KE_HOLIDAYS_RECURRING = new Set([
  "01-01", // New Year's Day
  "05-01", // Labour Day
  "06-01", // Madaraka Day
  "10-10", // Huduma Day
  "10-20", // Mashujaa Day
  "12-12", // Jamhuri Day
  "12-25", // Christmas Day
  "12-26", // Boxing Day
]);

// One-off holidays (YYYY-MM-DD) — Easter moves each year, so it is listed out.
const KE_HOLIDAYS_ONEOFF = new Set([
  "2026-04-03", // Good Friday 2026
  "2026-04-06", // Easter Monday 2026
  "2027-03-26", // Good Friday 2027
  "2027-03-29", // Easter Monday 2027
]);

export function isKenyaHoliday(dateStr: string): boolean {
  if (!dateStr) return false;
  return KE_HOLIDAYS_RECURRING.has(dateStr.slice(5)) || KE_HOLIDAYS_ONEOFF.has(dateStr);
}

// 0=Sun, 1=Mon … 6=Sat. Noon avoids any timezone date-shift.
export function getDayOfWeek(dateStr: string): number {
  if (!dateStr) return -1;
  return new Date(`${dateStr}T12:00:00`).getDay();
}

export const isSaturday = (dateStr: string): boolean => getDayOfWeek(dateStr) === 6;

/** A date we don't take demo requests on at all (Sunday or public holiday). */
export function isDateBlocked(dateStr: string): boolean {
  if (!dateStr) return false;
  return getDayOfWeek(dateStr) === 0 || isKenyaHoliday(dateStr);
}

/** Bookable hour blocks [startHour, endHour) for a date, lunch already removed. */
function workingBlocks(dateStr: string): [number, number][] {
  if (isDateBlocked(dateStr)) return [];
  if (isSaturday(dateStr)) return [[8, 13]]; // 8am–1pm
  return [
    [8, 13],
    [14, 17],
  ]; // 8–1, lunch, 2–5
}

const label12 = (h: number): string => {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
};

/**
 * The hour slots offered for a date, as `{ value, label }`.
 *
 * `value` is 24-hour `HH:MM` — the shape the CRM stores and the notifier
 * formats for the confirmation message. `label` is what the visitor reads.
 * An empty list means the date is closed, which the form reports directly
 * rather than showing an empty dropdown.
 */
export function timeSlotsFor(dateStr: string): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  for (const [start, end] of workingBlocks(dateStr)) {
    for (let h = start; h < end; h++) {
      slots.push({ value: `${String(h).padStart(2, "0")}:00`, label: label12(h) });
    }
  }
  return slots;
}

/** Today in YYYY-MM-DD, for the date input's `min` — nobody books yesterday. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Why this date can't be used, or null when it is fine. */
export function blockedReason(dateStr: string): string | null {
  if (!dateStr) return null;
  if (dateStr < todayIso()) return "That date has passed — pick a day from today onwards.";
  if (getDayOfWeek(dateStr) === 0) return "We're closed on Sundays. Pick a weekday, or a Saturday morning.";
  if (isKenyaHoliday(dateStr)) return "That's a public holiday. Pick another day.";
  return null;
}
