export type DayStatus = "present" | "absent" | "half" | "off" | "leave";

export const STATUS_META: Record<DayStatus, { label: string; letter: string; cls: string }> = {
  present: { label: "Present", letter: "P", cls: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" },
  absent:  { label: "Absent",  letter: "A", cls: "bg-destructive/20 text-destructive border-destructive/30" },
  half:    { label: "Half day", letter: "H", cls: "bg-amber-500/20 text-amber-500 border-amber-500/30" },
  off:     { label: "Off / holiday", letter: "O", cls: "bg-muted text-muted-foreground border-border/50" },
  leave:   { label: "On leave", letter: "L", cls: "bg-sky-500/20 text-sky-500 border-sky-500/30" },
};

export function daysInPeriod(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function dateOf(period: string, day: number): string {
  return `${period}-${String(day).padStart(2, "0")}`;
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(period: string, day: number): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, day).getDay();
}

export type LeaveSpan = { employeeId: number; type: string; startDate: string; endDate: string };

export function onLeave(leave: LeaveSpan[], employeeId: number, date: string): boolean {
  return leave.some((l) => l.employeeId === employeeId && l.startDate.slice(0, 10) <= date && l.endDate.slice(0, 10) >= date);
}
