import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import { route } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { verifyAuditChain } from "@/lib/audit";

/**
 * The audit log, plus a live integrity check of its hash chain.
 *
 * `integrity.ok === false` means someone has altered or removed history at the
 * database level. That is a security incident, and this endpoint is how you
 * find out — rather than never finding out at all.
 */
export const GET = route({ permission: "audit:read" }, async ({ principal, req }) =>
  withTenant(principal.orgId, async (tx) => {
    const limit = Math.min(500, Number(new URL(req.url).searchParams.get("limit") ?? 100));

    const rows = await tx.select().from(auditLogs)
      .where(eq(auditLogs.orgId, principal.orgId))
      .orderBy(desc(auditLogs.seq))
      .limit(limit);

    const integrity = await verifyAuditChain(tx, principal.orgId);

    return NextResponse.json({ entries: rows, integrity });
  }),
);
