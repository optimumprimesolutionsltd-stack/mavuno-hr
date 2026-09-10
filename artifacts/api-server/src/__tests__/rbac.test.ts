/**
 * Unit tests for canApproveRun — segregation of duties vs the
 * `requires_payroll_approval` org toggle.
 */

import { describe, it, expect } from "vitest";
import { canApproveRun } from "../lib/rbac.js";

const run = (createdBy: number | null, submittedBy: number | null) => ({
  createdByUserId: createdBy,
  submittedByUserId: submittedBy,
});

describe("canApproveRun — approval required (maker-checker on)", () => {
  it("lets a fresh approver approve a run they did not touch", () => {
    expect(canApproveRun("approver", 7, run(3, 4), true)).toEqual({ ok: true });
  });

  it("blocks a non-admin who created the run", () => {
    const res = canApproveRun("approver", 3, run(3, 4), true);
    expect(res.ok).toBe(false);
  });

  it("blocks a non-admin who submitted the run", () => {
    const res = canApproveRun("approver", 4, run(3, 4), true);
    expect(res.ok).toBe(false);
  });

  it("lets an admin approve their own run (holds all roles)", () => {
    expect(canApproveRun("admin", 3, run(3, 3), true)).toEqual({ ok: true });
  });

  it("rejects a role without payroll:approve", () => {
    const res = canApproveRun("payroll_officer", 9, run(1, 2), true);
    expect(res.ok).toBe(false);
  });
});

describe("canApproveRun — approval disabled (maker-checker off)", () => {
  it("lets the same non-admin who prepared the run also approve it", () => {
    expect(canApproveRun("approver", 3, run(3, 3), false)).toEqual({ ok: true });
  });

  it("still requires the payroll:approve permission", () => {
    const res = canApproveRun("payroll_officer", 3, run(3, 3), false);
    expect(res.ok).toBe(false);
  });
});
