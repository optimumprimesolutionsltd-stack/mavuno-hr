import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { payrollRuns } from "@/db/schema";
import { route } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { calculateRun } from "@/lib/payroll-run";
import { calculateRunSchema } from "@/lib/validation/schemas";

export const GET = route({ permission: "payroll:read" }, async ({ principal }) =>
  withTenant(principal.orgId, async (tx) => {
    const runs = await tx.select().from(payrollRuns)
      .where(eq(payrollRuns.orgId, principal.orgId))
      .orderBy(desc(payrollRuns.period), desc(payrollRuns.id));
    return NextResponse.json(runs);
  }),
);

/**
 * Calculate a payroll run.
 *
 * The whole computation is ONE transaction (see calculateRun). Either the run,
 * all its payslips and its totals all exist and reconcile — or none of them do.
 * The previous version issued three separate statements and could leave an
 * orphaned draft run with zeroed totals if the process died mid-way.
 */
export const POST = route(
  { permission: "payroll:calculate", schema: calculateRunSchema },
  async ({ principal, body, ip }) => {
    const started = Date.now();
    const { run, warnings } = await withTenant(principal.orgId, (tx) =>
      calculateRun(tx, principal, body, ip),
    );
    return NextResponse.json(
      { run, warnings, durationMs: Date.now() - started },
      { status: 201 },
    );
  },
);
