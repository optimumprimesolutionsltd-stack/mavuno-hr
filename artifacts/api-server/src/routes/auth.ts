import { Router } from "express";
import { z } from "zod";
import { eq, and, lt } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, organizations, passwordResetTokens } from "@workspace/db/schema";
import { verifyPassword, hashPassword, validatePasswordStrength } from "../lib/password.js";
import { createSession, destroySession, revokeAllUserSessions } from "../lib/session.js";
import { requireAuth, getIp, type AuthRequest } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";

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
    const sessionToken = await createSession(res, user.id, org.id, ip, req.headers["user-agent"] ?? null);

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
      // Also return raw token so clients in cross-site iframe contexts can use Bearer auth
      sessionToken,
    });
  } catch (err) { next(err); }
});

// ── Company self-registration ──────────────────────────────────────────────
const registerSchema = z.object({
  companyName:  z.string().min(2).max(120),
  slug:         z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  countryCode:  z.string().length(2).default("KE"),
  currencyCode: z.string().min(3).max(4).default("KES"),
  adminName:    z.string().min(2).max(120),
  adminEmail:   z.string().email().max(255),
  password:     z.string().min(12).max(200),
});

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const { companyName, slug, countryCode, currencyCode, adminName, adminEmail, password } = parsed.data;

    // Slug uniqueness
    const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
    if (existing) { res.status(409).json({ error: "That company URL is already taken. Please choose another slug." }); return; }

    // Password strength
    const pwErr = validatePasswordStrength(password);
    if (pwErr) { res.status(422).json({ error: pwErr }); return; }

    const passwordHash = await hashPassword(password);

    // Create org + admin user atomically
    const { orgId, userId } = await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({
        name: companyName,
        slug,
        countryCode: countryCode.toUpperCase(),
        currencyCode: currencyCode.toUpperCase(),
        plan: "trial",
        seatLimit: 25,
        status: "active",
      }).returning({ id: organizations.id });

      const [user] = await tx.insert(users).values({
        orgId: org.id,
        email: adminEmail.toLowerCase(),
        name: adminName,
        role: "admin",
        passwordHash,
        mustChangePassword: false,
        failedLoginCount: 0,
      }).returning({ id: users.id });

      return { orgId: org.id, userId: user.id };
    });

    const ip = getIp(req);
    const sessionToken = await createSession(res, userId, orgId, ip, req.headers["user-agent"] ?? null);

    await writeAudit(db as any, {
      orgId, action: "REGISTER", entity: "organizations", entityId: orgId,
      actorUserId: userId, actorEmail: adminEmail.toLowerCase(), actorIp: ip,
    });

    res.status(201).json({
      ok: true,
      sessionToken,
      orgSlug: slug,
      countryCode: countryCode.toUpperCase(),
      currencyCode: currencyCode.toUpperCase(),
    });
  } catch (err) { next(err); }
});

// ── Forgot password ───────────────────────────────────────────────────────
const forgotSchema = z.object({
  email: z.string().email().max(255),
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Invalid email" }); return; }
    const { email } = parsed.data;

    // Always respond 200 — never reveal whether email exists
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, orgId: users.orgId })
      .from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (user && !user) { /* unreachable — keeps flow below */ }

    if (user) {
      // Invalidate any existing unused tokens for this user
      await db.delete(passwordResetTokens)
        .where(and(eq(passwordResetTokens.userId, user.id), lt(passwordResetTokens.expiresAt, new Date(Date.now() + 3601_000))));

      const rawToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({ userId: user.id, token: rawToken, expiresAt });

      // Build reset URL from request origin or host
      const origin = req.headers.origin
        ?? `${req.protocol}://${req.headers.host}`;
      const resetUrl = `${origin}/admin/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail(user.email, user.name, resetUrl).catch((err) => {
        // Log but don't expose to client
        req.log?.error?.({ err }, "forgot-password: email send failed");
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Reset password ────────────────────────────────────────────────────────
const resetSchema = z.object({
  token: z.string().min(1).max(128),
  password: z.string().min(12).max(200),
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed" }); return; }
    const { token, password } = parsed.data;

    const [row] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token)).limit(1);

    if (!row) { res.status(400).json({ error: "Invalid or expired reset link." }); return; }
    if (row.usedAt) { res.status(400).json({ error: "This reset link has already been used." }); return; }
    if (row.expiresAt < new Date()) { res.status(400).json({ error: "This reset link has expired. Please request a new one." }); return; }

    const pwErr = validatePasswordStrength(password);
    if (pwErr) { res.status(422).json({ error: pwErr }); return; }

    const hash = await hashPassword(password);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, row.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));
    });

    await revokeAllUserSessions(row.userId);

    res.json({ ok: true });
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
