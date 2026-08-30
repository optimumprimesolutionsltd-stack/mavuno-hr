import { randomBytes, createHash } from "crypto";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessions, users, organizations, type Role } from "@workspace/db/schema";
import type { Request, Response } from "express";

const COOKIE = "mavuno_session";
const MAX_AGE_S = 60 * 60 * 12; // 12h

function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of >= 32 chars");
  }
  return s;
}
requireSecret();

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

export async function createSession(
  res: Response,
  userId: number,
  orgId: number,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: tokenHash(raw),
    userId,
    orgId,
    userAgent: userAgent?.slice(0, 255) ?? null,
    ip,
    expiresAt: new Date(Date.now() + MAX_AGE_S * 1000),
  });
  // Set cookie for same-site environments
  res.cookie(COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S * 1000,
  });
  // Return raw token so callers can also send it as a Bearer header
  // (needed when the app runs inside a cross-site iframe where cookies are blocked)
  return raw;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[COOKIE];
  if (raw) {
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, tokenHash(raw)));
  }
  res.clearCookie(COOKIE, { path: "/" });
}

export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function getPrincipal(req: Request): Promise<Principal | null> {
  // Accept Bearer token from Authorization header (for cross-site iframe environments)
  // OR fall back to httpOnly session cookie
  let raw: string | undefined = req.cookies?.[COOKIE];
  if (!raw) {
    const auth = req.headers["authorization"];
    if (auth?.startsWith("Bearer ")) {
      raw = auth.slice(7).trim();
    }
  }
  if (!raw) return null;

  const rows = await db
    .select({ s: sessions, u: users, o: organizations })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(organizations, eq(sessions.orgId, organizations.id))
    .where(and(
      eq(sessions.id, tokenHash(raw)),
      // A session is only valid when its tenant matches the user's tenant.
      // Do not let a corrupted or forged session row bridge organizations.
      eq(sessions.orgId, users.orgId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ));

  const row = rows[0];
  if (!row) return null;
  if (row.u.disabledAt) return null;
  if (row.o.status === "suspended") return null;

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
