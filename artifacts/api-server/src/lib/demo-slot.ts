/**
 * The slot a demo request asked for, written the way a person reads it:
 * "Monday, 15 September 2026 at 2:00 PM".
 *
 * Stored as plain text in the two shapes the Optimum Prime CRM uses —
 * YYYY-MM-DD and 24-hour HH:MM — because this is a preference in Nairobi
 * office hours rather than an instant, and nothing here should let a timezone
 * move it. Shared by the CRM bridge and the internal notification email so the
 * team reads the same wording wherever the request reaches them.
 *
 * Returns "" when no date was given, which the form allows.
 */
export function describeSlot(date: string | null | undefined, time: string | null | undefined): string {
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00`);
  const day = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (!time) return `${day} (no time given)`;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return `${day} at ${time}`;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day} at ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
