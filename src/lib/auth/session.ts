import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, organizations, type Role } from "@/db/schema";

const COOKIE = "zawadi_session";
const MAX_AGE_S = 60 * 60 * 12;   // 12h, not 7 days: this is payroll data

/**
 * SESSION_SECRET has NO fallback.
 *
 * The previous code fell back to a hardcoded dev string. If that ever reaches
 * production, every session cookie in the system is forgeable by anyone who
 * has read the source. Fail closed at boot instead.
 */
function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of >= 32 chars");
  }
  return s;
}
requireSecret();

/** We store only the HASH of the token. A DB leak does not yield live sessions. */
const tokenHash = (raw: string) =>
  createHash("sha256").update(raw + requireSecret()).digest("hex");

export interface Principal {
  userId: number;
  orgId: number;
  email: string;
  name: string;
  role: Role;
  employeeId: number | null;
  mustChangePassword: boolean;
  orgSlug: string;
  countryCode: string;
  currencyCode: string;
}

export async function createSession(userId: number, orgId: number): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const h = await headers();
  await db.insert(sessions).values({
    id: tokenHash(raw),
    userId,
    orgId,
    userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt: new Date(Date.now() + MAX_AGE_S * 1000),
  });
  const store = await cookies();
  store.set(COOKIE, raw, {
    httpOnly: true,
    sameSite: "strict",          // was "lax" — strict blocks cross-site CSRF
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

/** Revocable: this is why sessions live in the DB and not in a signed cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (raw) {
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, tokenHash(raw)));
  }
  store.delete(COOKIE);
}

/** Kill every session for a user — called on termination and on password change. */
export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function getPrincipal(): Promise<Principal | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  const rows = await db
    .select({ s: sessions, u: users, o: organizations })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(organizations, eq(sessions.orgId, organizations.id))
    .where(and(
      eq(sessions.id, tokenHash(raw)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ));

  const row = rows[0];
  if (!row) return null;
  if (row.u.disabledAt) return null;                 // disabled mid-session
  if (row.o.status === "suspended") return null;     // unpaid invoice

  return {
    userId: row.u.id,
    orgId: row.u.orgId,
    email: row.u.email,
    name: row.u.name,
    role: row.u.role as Role,
    employeeId: row.u.employeeId,
    mustChangePassword: row.u.mustChangePassword,
    orgSlug: row.o.slug,
    countryCode: row.o.countryCode,
    currencyCode: row.o.currencyCode,
  };
}

/** Constant-time compare, for CSRF double-submit tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
