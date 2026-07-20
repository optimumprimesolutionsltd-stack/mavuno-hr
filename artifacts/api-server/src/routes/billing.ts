import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  billingPayments, organizations, users,
} from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { sendReceiptEmail } from "../lib/mailer.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// ── Super-admin gate (reused from super.ts pattern) ───────────────────────────
function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
function requireSuperAdmin() {
  return [
    requireAuth(),
    (req: Request, res: Response, next: NextFunction) => {
      const p = (req as AuthRequest).principal;
      if (!getSuperAdminEmails().includes(p.email.toLowerCase())) {
        res.status(403).json({ error: "Super-admin access required" });
        return;
      }
      next();
    },
  ];
}

function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

function generateReceiptNo(id: number): string {
  const year = new Date().getFullYear();
  return `RCP-${year}-${String(id).padStart(5, "0")}`;
}

// ── GET /api/billing — super admin: list all payments ─────────────────────────
router.get("/", ...requireSuperAdmin(), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        payment: billingPayments,
        orgName: organizations.name,
        orgPlan: organizations.plan,
        verifierEmail: users.email,
      })
      .from(billingPayments)
      .innerJoin(organizations, eq(billingPayments.orgId, organizations.id))
      .leftJoin(users, eq(billingPayments.verifiedByUserId, users.id))
      .orderBy(desc(billingPayments.createdAt));

    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/billing — super admin: record a new payment ────────────────────
const createSchema = z.object({
  orgId: z.number().int().positive(),
  amount: z.number().int().positive(),  // KES cents
  period: z.string().min(1).max(100),
  method: z.enum(["mpesa", "bank_transfer", "cash", "cheque", "other"]),
  reference: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

router.post("/", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return;
    }
    const d = parsed.data;

    // Generate a temporary receipt no — we'll update after insert to include the real ID
    const [payment] = await db.insert(billingPayments).values({
      orgId: d.orgId,
      receiptNo: `RCP-PENDING`,  // placeholder; updated right after
      amount: d.amount,
      period: d.period,
      method: d.method,
      reference: d.reference ?? null,
      description: d.description ?? null,
      status: "pending",
    }).returning();

    // Assign proper receipt number based on real ID
    const receiptNo = generateReceiptNo(payment.id);
    const [updated] = await db.update(billingPayments)
      .set({ receiptNo })
      .where(eq(billingPayments.id, payment.id))
      .returning();

    res.status(201).json(updated);
  } catch (err) { next(err); }
});

// ── POST /api/billing/:id/verify — verify payment + send receipt ──────────────
router.post("/:id/verify", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    if (isNaN(id)) throw new HttpError(400, "Invalid payment id");

    const [row] = await db
      .select({ payment: billingPayments, org: organizations })
      .from(billingPayments)
      .innerJoin(organizations, eq(billingPayments.orgId, organizations.id))
      .where(eq(billingPayments.id, id))
      .limit(1);

    if (!row) throw new HttpError(404, "Payment not found");
    if (row.payment.status === "verified") throw new HttpError(409, "Payment already verified");

    const now = new Date();

    // Update status
    const [updated] = await db.update(billingPayments)
      .set({
        status: "verified",
        verifiedByUserId: p.userId,
        verifiedAt: now,
      })
      .where(eq(billingPayments.id, id))
      .returning();

    // Find company admin email(s) to send receipt
    const adminUsers = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, row.org.id), eq(users.role, "admin")));

    const recipients = adminUsers.map((u) => u.email).filter(Boolean);

    if (recipients.length > 0) {
      try {
        for (const email of recipients) {
          await sendReceiptEmail({
            to: email,
            orgName: row.org.name,
            receiptNo: updated.receiptNo,
            period: updated.period,
            amountKes: formatKes(updated.amount),
            method: updated.method,
            reference: updated.reference,
            verifiedAt: formatDate(now),
            plan: row.org.plan.charAt(0).toUpperCase() + row.org.plan.slice(1),
          });
        }
        // Mark receipt as sent
        await db.update(billingPayments)
          .set({ receiptSentAt: now })
          .where(eq(billingPayments.id, id));

        updated.receiptSentAt = now;
      } catch (mailErr) {
        // Non-fatal — payment is still verified; receipt can be resent
        console.error("[billing] receipt email failed:", mailErr);
      }
    }

    res.json({ ...updated, receiptSentTo: recipients });
  } catch (err) { next(err); }
});

// ── POST /api/billing/:id/resend — resend receipt email ──────────────────────
router.post("/:id/resend", ...requireSuperAdmin(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new HttpError(400, "Invalid payment id");

    const [row] = await db
      .select({ payment: billingPayments, org: organizations })
      .from(billingPayments)
      .innerJoin(organizations, eq(billingPayments.orgId, organizations.id))
      .where(eq(billingPayments.id, id))
      .limit(1);

    if (!row) throw new HttpError(404, "Payment not found");
    if (row.payment.status !== "verified") throw new HttpError(409, "Can only resend receipt for verified payments");

    const adminUsers = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.orgId, row.org.id), eq(users.role, "admin")));

    const recipients = adminUsers.map((u) => u.email).filter(Boolean);

    for (const email of recipients) {
      await sendReceiptEmail({
        to: email,
        orgName: row.org.name,
        receiptNo: row.payment.receiptNo,
        period: row.payment.period,
        amountKes: formatKes(row.payment.amount),
        method: row.payment.method,
        reference: row.payment.reference,
        verifiedAt: formatDate(row.payment.verifiedAt),
        plan: row.org.plan.charAt(0).toUpperCase() + row.org.plan.slice(1),
      });
    }

    const now = new Date();
    await db.update(billingPayments)
      .set({ receiptSentAt: now })
      .where(eq(billingPayments.id, id));

    res.json({ ok: true, sentTo: recipients });
  } catch (err) { next(err); }
});

// ── GET /api/billing/my — company admin: their own payment history ────────────
router.get("/my", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;

    const [org] = await db.select({
      name: organizations.name,
      plan: organizations.plan,
      monthlyCharge: organizations.monthlyCharge,
    }).from(organizations).where(eq(organizations.id, p.orgId)).limit(1);

    const payments = await db
      .select({
        payment: billingPayments,
        verifierEmail: users.email,
      })
      .from(billingPayments)
      .leftJoin(users, eq(billingPayments.verifiedByUserId, users.id))
      .where(eq(billingPayments.orgId, p.orgId))
      .orderBy(desc(billingPayments.createdAt));

    res.json({ org, payments });
  } catch (err) { next(err); }
});

export default router;
