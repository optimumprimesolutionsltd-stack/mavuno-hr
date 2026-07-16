import { and, eq, isNull, lte, desc, or, sql } from "drizzle-orm";
import { statutoryConfigs } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import type { StatutoryConfig } from "./types";
import { HttpError } from "@/lib/auth/guard";

/**
 * Resolve the law in force for (country, period).
 *
 * A payroll run for 2023-06 must resolve the 2023 config, not today's. This is
 * what keeps recomputes and P9s consistent with what was actually filed.
 * An org-specific override (rare: EPZ, special regimes) beats the global pack.
 */
export async function resolveConfig(
  tx: Tx, orgId: number, countryCode: string, period: string,
): Promise<{ id: number; config: StatutoryConfig }> {
  const asOf = `${period}-01`;

  const rows = await tx
    .select()
    .from(statutoryConfigs)
    .where(and(
      eq(statutoryConfigs.countryCode, countryCode),
      lte(statutoryConfigs.effectiveFrom, asOf),
      or(isNull(statutoryConfigs.effectiveTo), sql`${statutoryConfigs.effectiveTo} >= ${asOf}`),
      or(isNull(statutoryConfigs.orgId), eq(statutoryConfigs.orgId, orgId)),
    ))
    // org override first, then most recent effective_from
    .orderBy(desc(statutoryConfigs.orgId), desc(statutoryConfigs.effectiveFrom));

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      422,
      `No statutory configuration is on file for ${countryCode} covering ${period}. ` +
      `Payroll cannot be computed without knowing which tax law applies.`,
      "NO_STATUTORY_CONFIG",
    );
  }
  return { id: row.id, config: row.config as StatutoryConfig };
}
