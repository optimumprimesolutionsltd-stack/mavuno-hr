import type { Role } from "@/db/schema";

/**
 * Permission matrix. Explicit, greppable, and testable — the alternative
 * (scattered `if (role === 'admin')` checks) is how authorisation bugs ship.
 */
export const PERMISSIONS = {
  employee:        ["self:read", "self:request"],
  manager:         ["self:read", "self:request", "team:read", "leave:approve"],
  hr:              ["self:read", "self:request", "team:read", "leave:approve",
                    "employee:read", "employee:write", "leave:admin", "loan:review"],
  payroll_officer: ["self:read", "self:request", "team:read", "employee:read",
                    "payroll:read", "payroll:calculate", "payroll:submit",
                    "report:read", "loan:review"],
  approver:        ["self:read", "self:request", "team:read", "employee:read",
                    "payroll:read", "payroll:approve", "payroll:disburse",
                    "report:read", "audit:read"],
  admin:           ["*"],
} as const satisfies Record<Role, readonly string[]>;

export type Permission =
  | "self:read" | "self:request" | "team:read"
  | "employee:read" | "employee:write"
  | "leave:approve" | "leave:admin" | "loan:review"
  | "payroll:read" | "payroll:calculate" | "payroll:submit"
  | "payroll:approve" | "payroll:disburse"
  | "report:read" | "audit:read"
  | "org:admin" | "user:admin";

export function can(role: Role, perm: Permission): boolean {
  const grants = PERMISSIONS[role] as readonly string[];
  return grants.includes("*") || grants.includes(perm);
}

/**
 * MAKER-CHECKER (segregation of duties).
 *
 * The person who calculates a payroll run must not be the person who approves
 * it, and neither may disburse without the other. This is not a nice-to-have:
 * it is the single control that most commonly stops payroll fraud, and it is
 * the first thing an enterprise procurement questionnaire asks about.
 *
 * Note: `admin` is deliberately NOT exempt. An admin who ran the payroll still
 * cannot approve their own run — they must ask someone else. Allowing admins
 * to self-approve would reduce the control to decoration.
 */
export function canApproveRun(
  role: Role,
  userId: number,
  run: { createdByUserId: number | null; submittedByUserId: number | null },
): { ok: true } | { ok: false; reason: string } {
  if (!can(role, "payroll:approve")) {
    return { ok: false, reason: "Your role cannot approve payroll runs" };
  }
  if (run.createdByUserId === userId || run.submittedByUserId === userId) {
    return {
      ok: false,
      reason:
        "Segregation of duties: you calculated or submitted this run and therefore " +
        "cannot approve it. A second authorised approver must review it.",
    };
  }
  return { ok: true };
}
