import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { departments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";

const router = Router();
const departmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),
  costCenter: z.string().trim().max(80).optional(),
});

router.get("/", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthRequest).principal;
    const rows = await db.select().from(departments)
      .where(eq(departments.orgId, orgId))
      .orderBy(asc(departments.name));
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthRequest).principal;
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
      return;
    }
    const [existing] = await db.select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.orgId, orgId), eq(departments.code, parsed.data.code)))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "A department with this code already exists" });
      return;
    }
    const [department] = await db.insert(departments).values({
      orgId, name: parsed.data.name, code: parsed.data.code,
      costCenter: parsed.data.costCenter || null,
    }).returning();
    res.status(201).json(department);
  } catch (err) { next(err); }
});

// PATCH /api/departments/:id -- set how many people may be off at once (null clears)
router.patch("/:id", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthRequest).principal;
    const parsed = z.object({ maxOffAtOnce: z.number().int().min(1).max(500).nullable() }).safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return; }
    const [row] = await db.update(departments).set({ maxOffAtOnce: parsed.data.maxOffAtOnce })
      .where(and(eq(departments.id, Number(req.params.id)), eq(departments.orgId, orgId))).returning();
    if (!row) { res.status(404).json({ error: "Department not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

export default router;