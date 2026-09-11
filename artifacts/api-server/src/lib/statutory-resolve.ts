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

/**
 * The country's own statutory configuration, ignoring every per-organisation
 * override. resolveConfig() above deliberately lets an org's own row win; this
 * one deliberately cannot see them, because it answers the PUBLIC calculator on
 * the marketing site, where there is no tenant and one customer's negotiated
 * override must never leak into a number shown to a stranger.
 *
 * Cached briefly: the row changes a few times a year, the endpoint is
 * unauthenticated, and every keystroke on the calculator would otherwise be a
 * database round trip.
 */
const COUNTRY_CONFIG_TTL_MS = 10 * 60 * 1000;
const countryConfigCache = new Map<string, { at: number; value: { id: number; config: StatutoryConfig } }>();

export async function resolveCountryConfig(
  tx: Tx,
  countryCode: string,
  period: string,
): Promise<{ id: number; config: StatutoryConfig }> {
  const key = `${countryCode}:${period}`;
  const hit = countryConfigCache.get(key);
  if (hit && Date.now() - hit.at < COUNTRY_CONFIG_TTL_MS) return hit.value;

  const asOf = `${period}-01`;
  const rows = await tx
    .select()
    .from(statutoryConfigs)
    .where(and(
      eq(statutoryConfigs.countryCode, countryCode),
      isNull(statutoryConfigs.orgId),
      lte(statutoryConfigs.effectiveFrom, asOf),
      or(isNull(statutoryConfigs.effectiveTo), sql`${statutoryConfigs.effectiveTo} >= ${asOf}`),
    ))
    .orderBy(desc(statutoryConfigs.effectiveFrom));

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      422,
      `No statutory configuration is on file for ${countryCode} covering ${period}.`,
      "NO_STATUTORY_CONFIG",
    );
  }

  const value = { id: row.id, config: row.config as StatutoryConfig };
  countryConfigCache.set(key, { at: Date.now(), value });
  return value;
}
