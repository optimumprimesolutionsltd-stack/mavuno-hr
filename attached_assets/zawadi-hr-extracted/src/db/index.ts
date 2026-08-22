import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * LAZY connection.
 *
 * The previous version threw at import time if DATABASE_URL was unset — which
 * meant `next build` itself required a live database (build machines and CI
 * don't have one). The pool is now created on first USE: a missing
 * DATABASE_URL still fails loudly, but at request time, not at build time.
 */
const globalForDb = globalThis as typeof globalThis & {
  __zawadiPgPool?: Pool;
};

function getPool(): Pool {
  if (globalForDb.__zawadiPgPool) return globalForDb.__zawadiPgPool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const p = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX ?? 10),
  });
  globalForDb.__zawadiPgPool = p;
  return p;
}

/** Proxies defer pool creation until the first property access / query. */
export const pool: Pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const real = getPool();
    const v = real[prop as keyof Pool];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

let _db: NodePgDatabase | null = null;
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_t, prop) {
    _db ??= drizzle(getPool());
    const v = _db[prop as keyof NodePgDatabase];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(_db) : v;
  },
});
