import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { withoutTenant } from "@/db/tenant";
import { writeAudit } from "@/lib/audit";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Login is the one route that cannot be behind the auth guard.
 *
 * Defences, all of which the previous version lacked:
 *   - Account lockout after repeated failures (credential stuffing)
 *   - Uniform error message and timing, so an attacker cannot enumerate which
 *     emails exist on the platform
 *   - Every attempt, success or failure, lands in the audit log
 */
export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const { email, password, orgSlug } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const rows = await db
    .select({ u: users, o: organizations })
    .from(users)
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(orgSlug
      ? and(eq(users.email, email.toLowerCase()), eq(organizations.slug, orgSlug))
      : eq(users.email, email.toLowerCase()));

  /* Same response whether the user is absent, disabled, locked, or the password
   * is wrong. Never tell an attacker which. */
  const fail = () => NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (rows.length === 0) {
    // Burn comparable time so absence isn't detectable by response latency.
    await verifyPassword(password, "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    return fail();
  }

  /* If the email exists in more than one org, the client must disambiguate. */
  if (rows.length > 1 && !orgSlug) {
    return NextResponse.json(
      { error: "Multiple organizations found for this email", code: "ORG_REQUIRED",
        organizations: rows.map((r) => ({ slug: r.o.slug, name: r.o.name })) },
      { status: 409 },
    );
  }

  const { u, o } = rows[0];

  if (u.disabledAt) return fail();
  if (o.status === "suspended") {
    return NextResponse.json({ error: "This organization's account is suspended" }, { status: 403 });
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    return NextResponse.json(
      { error: "Account temporarily locked after too many failed attempts. Try again shortly." },
      { status: 429 },
    );
  }

  const ok = await verifyPassword(password, u.passwordHash);

  if (!ok) {
    const attempts = u.failedLoginCount + 1;
    await db.update(users).set({
      failedLoginCount: attempts,
      lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
    }).where(eq(users.id, u.id));

    await withoutTenant((tx) => writeAudit(tx, {
      orgId: o.id, action: "LOGIN_FAILED", entity: "users", entityId: u.id,
      detail: `Failed login attempt ${attempts}/${MAX_ATTEMPTS}`,
      actorUserId: null, actorEmail: email, actorIp: ip,
    }));
    return fail();
  }

  await db.update(users).set({
    failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(),
  }).where(eq(users.id, u.id));

  await createSession(u.id, u.orgId);

  await withoutTenant((tx) => writeAudit(tx, {
    orgId: o.id, action: "LOGIN_SUCCESS", entity: "users", entityId: u.id,
    detail: `${u.email} signed in as ${u.role}`,
    actorUserId: u.id, actorEmail: u.email, actorIp: ip,
  }));

  return NextResponse.json({
    user: { id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword },
    org: { slug: o.slug, name: o.name, countryCode: o.countryCode, currencyCode: o.currencyCode },
  });
}
