import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export const LOAN_TYPE_OPTIONS = [
  { value: "company",   label: "Company Loan" },
  { value: "sacco",     label: "SACCO Loan" },
  { value: "advance",   label: "Salary Advance" },
  { value: "emergency", label: "Emergency Advance" },
] as const;

export type LoanConfig = Record<string, { enabled: boolean; maxMonths: number }>;

export const DEFAULT_LOAN_CONFIG: LoanConfig = Object.fromEntries(
  LOAN_TYPE_OPTIONS.map((t) => [t.value, { enabled: true, maxMonths: 60 }]),
);

/** Enabled loan types (with their longest term) for admin or portal dialogs. */
export function useLoanTypes(scope: "admin" | "portal") {
  const { data } = useQuery({
    queryKey: ["loan-config", scope],
    queryFn: () => scope === "admin"
      ? customFetch<LoanConfig>("/api/loans/config")
      : customFetch<{ loanConfig: LoanConfig }>("/api/portal/features").then((r) => r.loanConfig),
    staleTime: 30_000,
  });
  const cfg = data ?? DEFAULT_LOAN_CONFIG;
  const types = LOAN_TYPE_OPTIONS.filter((t) => cfg[t.value]?.enabled !== false);
  const maxMonths = (type: string) => cfg[type]?.maxMonths ?? 60;
  return { types, maxMonths };
}

/** If the selected type stops being offered, move to the first one that is. */
export function useEnsureOfferedType(current: string, offered: readonly { value: string }[], set: (v: string) => void) {
  useEffect(() => {
    if (offered.length && !offered.some((t) => t.value === current)) set(offered[0].value);
  }, [current, offered.map((t) => t.value).join(",")]);
}
