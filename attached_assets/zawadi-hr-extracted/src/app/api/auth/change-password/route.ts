import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { route } from "@/lib/auth/guard";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/auth/password";
import { revokeAllUserSessions, createSession } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { withTenant } from "@/db/tenant";
import { writeAudit } from "@/lib/audit";

export const POST = route(
  { permission: null, schema: changePasswordSchema, allowPasswordChangePending: true },
  async ({ principal, body, ip }) => {
    const [u] = await db.select().from(users).where(eq(users.id, principal.userId));
    if (!u || !(await verifyPassword(body.currentPassword, u.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    const weak = validatePasswordStrength(body.newPassword);
    if (weak) return NextResponse.json({ error: weak }, { status: 422 });

    await db.update(users).set({
      passwordHash: await hashPassword(body.newPassword),
      mustChangePassword: false,
    }).where(eq(users.id, principal.userId));

    /* Rotating a password kills every other session — the standard response to
     * "I think someone else has my password". */
    await revokeAllUserSessions(principal.userId);
    await createSession(principal.userId, principal.orgId);

    await withTenant(principal.orgId, (tx) => writeAudit(tx, {
      orgId: principal.orgId, action: "PASSWORD_CHANGED", entity: "users",
      entityId: principal.userId, detail: "Password rotated; all other sessions revoked",
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    }));

    return NextResponse.json({ ok: true });
  },
);
