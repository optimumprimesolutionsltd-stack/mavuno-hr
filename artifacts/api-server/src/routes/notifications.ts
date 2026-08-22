import { Router } from "express";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { notifications } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";

const router = Router();

// ── GET / — return last 30 notifications for the logged-in user ───────────────
router.get("/", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;

    const rows = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, p.userId),
        eq(notifications.orgId, p.orgId),
      ))
      .orderBy(
        // unread first, then by creation date desc
        isNull(notifications.readAt),
        desc(notifications.createdAt)
      )
      .limit(30);

    const unreadCount = rows.filter((n) => n.readAt === null).length;

    res.json({ notifications: rows, unreadCount });
  } catch (err) { next(err); }
});

// ── PATCH /read-all — mark all notifications as read ─────────────────────────
// NOTE: this must be registered before /:id/read to avoid "read-all" being
// matched as an :id param.
router.patch("/read-all", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const now = new Date();

    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, p.userId),
          eq(notifications.orgId, p.orgId),
          isNull(notifications.readAt)
        )
      );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /:id/read — mark a single notification as read ─────────────────────
router.patch("/:id/read", requireAuth(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    if (isNaN(id)) throw new HttpError(400, "Invalid notification id");

    const [existing] = await db
      .select({ id: notifications.id, userId: notifications.userId, orgId: notifications.orgId })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.orgId, p.orgId)))
      .limit(1);

    if (!existing) throw new HttpError(404, "Notification not found");
    if (existing.userId !== p.userId) throw new HttpError(403, "Forbidden");

    const [updated] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, p.userId),
        eq(notifications.orgId, p.orgId),
      ))
      .returning();

    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
