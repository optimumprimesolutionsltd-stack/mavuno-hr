import type { Role } from "@workspace/db/schema";

export const PERMISSIONS = {
  employee:        ["self:read", "self:request"],
  manager:         ["self:read", "self:request", "team:read", "leave:approve"],
  hr:              ["self:read", "self:request", "team:read", "leave:approve",
                    "employee:read", "employee:write", "leave:admin", "loan:review"],
  payroll_officer: ["self:read", "self:request", "team:read", "employee:read",
                    "payroll:read", "payroll:calculate", "payroll:submit",
                    "loan:review"],
  approver:        ["self:read", "self:request", "team:read", "employee:read",
                    "payroll:read", "payroll:approve", "payroll:disburse",
                    "audit:read"],
  admin:           ["*"],
} as const satisfies Record<Role, readonly string[]>;

export type Permission =
  | "self:read" | "self:request" | "team:read"
  | "employee:read" | "employee:write"
  | "leave:approve" | "leave:admin" | "loan:review"
  | "payroll:read" | "payroll:calculate" | "payroll:submit"
  | "payroll:approve" | "payroll:disburse"
  | "audit:read"
  | "org:admin" | "user:admin";

export function can(role: Role, perm: Permission): boolean {
  const grants = PERMISSIONS[role] as readonly string[];
  return grants.includes("*") || grants.includes(perm);
}

export function canApproveRun(
  role: Role,
  userId: number,
  run: { createdByUserId: number | null; submittedByUserId: number | null },
): { ok: true } | { ok: false; reason: string } {
  if (!can(role, "payroll:approve")) {
    return { ok: false, reason: "Your role cannot approve payroll runs" };
  }
  // Admin (superuser) bypasses segregation — they hold all roles simultaneously.
  // For non-admin roles, enforce segregation of duties.
  if (role !== "admin" && (run.createdByUserId === userId || run.submittedByUserId === userId)) {
    return {
      ok: false,
      reason: "Segregation of duties: you calculated or submitted this run and therefore " +
        "cannot approve it. A second authorised approver must review it.",
    };
  }
  return { ok: true };
}
