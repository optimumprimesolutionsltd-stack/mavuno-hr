import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatMoney = (cents: number) => 
  new Intl.NumberFormat('en-KE', { 
    style: 'currency', 
    currency: 'KES', 
    minimumFractionDigits: 2 
  }).format(cents / 100);

export const formatPercent = (bps: number) =>
  `${(bps / 100).toFixed(2)}%`;

export const formatDate = (dateString: string) => {
  if (!dateString) return "";
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateString));
};

export const formatDateTime = (dateString: string) => {
  if (!dateString) return "";
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString));
};

export const formatPeriod = (period: string) => {
  if (!period) return "";
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'long'
  }).format(date);
};
