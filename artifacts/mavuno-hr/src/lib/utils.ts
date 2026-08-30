import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatMoney = (cents: number | null | undefined) => {
  if (cents == null || isNaN(cents)) return "KES 0.00";
  return new Intl.NumberFormat('en-KE', { 
    style: 'currency', 
    currency: 'KES', 
    minimumFractionDigits: 2 
  }).format(cents / 100);
};

export const formatPercent = (bps: number | null | undefined) => {
  if (bps == null || isNaN(bps)) return "0.00%";
  return `${(bps / 100).toFixed(2)}%`;
};

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d);
};

export const formatDateTime = (dateString: string | null | undefined) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
};

export function fullName(employee: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter((s): s is string => !!s)
    .join(" ");
}

export const formatPeriod = (period: string | null | undefined) => {
  if (!period) return "—";
  const parts = period.split('-');
  if (parts.length < 2) return period;
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  if (isNaN(year) || isNaN(month)) return period;
  const date = new Date(year, month - 1);
  if (isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'long'
  }).format(date);
};
