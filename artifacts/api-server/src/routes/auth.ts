import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, organizations } from "@workspace/db/schema";
import { verifyPassword, hashPassword, validatePasswordStrength } from "../lib/password.js";
import { createSession, destroySession, revokeAllUserSessions } from "../lib/session.js";
import { requireAuth, getIp, type AuthRequest } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  orgSlug: z.string().min(1).max(64).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(200),
});

const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const { email, password, orgSlug } = parsed.data;

    // Find org
    let orgId: number | undefined;
    if (orgSlug) {
      const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
      if (!org) { res.status(401).json({ error: "Invalid credentials" }); return; }
      orgId = org.id;
    }

    const query = db.select({ u: users, o: organizations })
      .from(users)
      .innerJoin(organizations, eq(users.orgId, organizations.id))
      .where(orgId
        ? and(eq(users.email, email.toLowerCase()), eq(users.orgId, orgId))
        : eq(users.email, email.toLowerCase())
      );
    const rows = await query;
    const row = rows[0];

    // Constant-time path: always verify to avoid timing oracle
    if (!row) {
      await verifyPassword(password, "$argon2id$v=19$m=19456,t=2,p=1$dummy$dummy");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const { u: user, o: org } = row;

    if (user.disabledAt) { res.status(401).json({ error: "Account disabled" }); return; }
    if (org.status === "suspended") { res.status(403).json({ error: "Organization suspended" }); return; }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(429).json({ error: "Account temporarily locked. Try again later." });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const newCount = user.failedLoginCount + 1;
      const lockUntil = newCount >= MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS) : null;
      await db.update(users).set({ failedLoginCount: newCount, lockedUntil: lockUntil }).where(eq(users.id, user.id));
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Reset failure count on success
    await db.update(users).set({
      failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(),
    }).where(eq(users.id, user.id));

    const ip = getIp(req);
    await createSession(res, user.id, org.id, ip, req.headers["user-agent"] ?? null);

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: org.id, action: "LOGIN", entity: "users", entityId: user.id,
        actorUserId: user.id, actorEmail: user.email, actorIp: ip,
      });
    });

    res.json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      employeeId: user.employeeId, mustChangePassword: user.mustChangePassword,
      orgSlug: org.slug, countryCode: org.countryCode, currencyCode: org.currencyCode,
    });
  } catch (err) { next(err); }
});

router.post("/logout", requireAuth(), async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/me", requireAuth(), (req, res) => {
  const p = (req as AuthRequest).principal;
  res.json({
    id: p.userId, email: p.email, name: p.name, role: p.role,
    employeeId: p.employeeId, mustChangePassword: p.mustChangePassword,
    orgSlug: p.orgSlug, countryCode: p.countryCode, currencyCode: p.currencyCode,
  });
});

router.post("/change-password", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const { currentPassword, newPassword } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.id, p.userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) { res.status(401).json({ error: "Current password is incorrect" }); return; }

    const err = validatePasswordStrength(newPassword);
    if (err) { res.status(422).json({ error: err }); return; }

    const hash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: hash, mustChangePassword: false }).where(eq(users.id, p.userId));
    await revokeAllUserSessions(p.userId);

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "PASSWORD_CHANGED", entity: "users", entityId: p.userId,
        actorUserId: p.userId, actorEmail: p.email,
      });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
