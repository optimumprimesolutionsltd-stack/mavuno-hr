import { and, eq, isNull, lte, or, desc, sql } from "drizzle-orm";
import { statutoryConfigs } from "@workspace/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import type { StatutoryConfig } from "./statutory-types.js";
import { HttpError } from "./http-error.js";

type Tx = NodePgDatabase<typeof schema>;

export async function resolveConfig(
  tx: Tx,
  orgId: number,
  countryCode: string,
  period: string,
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
