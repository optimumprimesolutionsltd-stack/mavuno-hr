import { createHash } from "crypto";
import { desc, eq, asc } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import type { Tx } from "@/db/tenant";

/**
 * Tamper-EVIDENT audit log.
 *
 * hash_n = SHA256(seq | orgId | action | entity | entityId | actor | detail |
 *                 before | after | createdAt | hash_{n-1})
 *
 * Editing or deleting any historical row changes its hash, which no longer
 * matches the prev_hash of its successor, and verifyAuditChain() detects the
 * break and reports exactly where. An attacker who compromises the DB can
 * still destroy the log — but cannot silently alter it, which is the property
 * regulators and enterprise buyers actually ask for.
 *
 * Writes MUST happen inside the same transaction as the change they record,
 * so it is impossible to have a change without its audit entry.
 */
export const GENESIS_HASH = "0".repeat(64);

function computeHash(row: {
  seq: number; orgId: number; action: string; entity: string;
  entityId: string | null; actorEmail: string; detail: string | null;
  before: unknown; after: unknown; createdAt: Date; prevHash: string;
}): string {
  const canonical = JSON.stringify([
    row.seq, row.orgId, row.action, row.entity, row.entityId,
    row.actorEmail, row.detail,
    row.before ?? null, row.after ?? null,
    row.createdAt.toISOString(), row.prevHash,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export async function writeAudit(tx: Tx, entry: {
  orgId: number;
  action: string;
  entity: string;
  entityId?: string | number | null;
  detail?: string | null;
  actorUserId: number | null;
  actorEmail: string;
  actorIp?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  /* SELECT ... FOR UPDATE on the org's last row serialises concurrent writers,
   * so two simultaneous actions cannot claim the same seq or fork the chain. */
  const [last] = await tx
    .select({ seq: auditLogs.seq, hash: auditLogs.hash })
    .from(auditLogs)
    .where(eq(auditLogs.orgId, entry.orgId))
    .orderBy(desc(auditLogs.seq))
    .limit(1)
    .for("update");

  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();

  const base = {
    seq,
    orgId: entry.orgId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId != null ? String(entry.entityId) : null,
    actorEmail: entry.actorEmail,
    detail: entry.detail ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    createdAt,
    prevHash,
  };

  await tx.insert(auditLogs).values({
    ...base,
    actorUserId: entry.actorUserId,
    actorIp: entry.actorIp ?? null,
    hash: computeHash(base),
  });
}

export async function verifyAuditChain(tx: Tx, orgId: number): Promise<{
  ok: boolean; checked: number; brokenAtSeq?: number;
}> {
  const rows = await tx.select().from(auditLogs)
    .where(eq(auditLogs.orgId, orgId))
    .orderBy(asc(auditLogs.seq));

  let prev = GENESIS_HASH;
  for (const r of rows) {
    if (r.prevHash !== prev) return { ok: false, checked: rows.length, brokenAtSeq: r.seq };
    const expected = computeHash({
      seq: r.seq, orgId: r.orgId, action: r.action, entity: r.entity,
      entityId: r.entityId, actorEmail: r.actorEmail, detail: r.detail,
      before: r.before, after: r.after, createdAt: r.createdAt, prevHash: r.prevHash,
    });
    if (expected !== r.hash) return { ok: false, checked: rows.length, brokenAtSeq: r.seq };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
