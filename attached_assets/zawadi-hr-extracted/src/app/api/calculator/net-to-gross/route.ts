import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { resolveConfig } from "@/lib/statutory/resolve";
import { solveGrossForNet, emptyPayInput } from "@/lib/payroll";
import { moneyString } from "@/lib/validation/schemas";
import { toCents } from "@/lib/money";

const schema = z.object({
  targetNet: moneyString,
  houseAllowance: moneyString.default("0"),
  transportAllowance: moneyString.default("0"),
  helbMonthly: moneyString.default("0"),
  pensionEmployee: moneyString.default("0"),
  insurancePremium: moneyString.default("0"),
  residentStatus: z.enum(["resident", "non_resident"]).default("resident"),
  disabilityExemption: z.boolean().default(false),
});

/**
 * "The offer letter says KES 100,000 net — what basic salary do I enter?"
 *
 * Standard for negotiated-net contracts and expatriates. The solver runs
 * against the statutory config in force THIS month, so the same request next
 * year (after a Finance Act change) correctly yields a different basic.
 */
export const POST = route({ permission: "employee:read", schema }, async ({ principal, body }) =>
  withTenant(principal.orgId, async (tx) => {
    const period = new Date().toISOString().slice(0, 7);
    const { config } = await resolveConfig(tx, principal.orgId, principal.countryCode, period);

    const { basicSalary, result, iterations } = solveGrossForNet(
      toCents(body.targetNet),
      {
        ...emptyPayInput(),
        houseAllowance: toCents(body.houseAllowance),
        transportAllowance: toCents(body.transportAllowance),
        helbMonthly: toCents(body.helbMonthly),
        pensionEmployee: toCents(body.pensionEmployee),
        insurancePremium: toCents(body.insurancePremium),
        residentStatus: body.residentStatus,
        disabilityExemption: body.disabilityExemption,
      },
      config,
    );

    return NextResponse.json({
      basicSalary,               // cents — enter this as the employee's basic
      achievedNet: result.netPay,
      gross: result.gross,
      paye: result.paye,
      employerCost: result.employerCost,
      configName: config.name,
      iterations,
    });
  }),
);
