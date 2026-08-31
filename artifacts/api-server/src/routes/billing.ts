import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  billingPayments, organizations, users,
} from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { sendReceiptEmail } from "../lib/mailer.js";
import {
  initiateStkPush, queryTransactionStatus, isAllowedCallbackIp, accountReferenceFor,
} from "../lib/mpesa.js";
import { logger } from "../lib/logger.js";
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
      .leftJoin(users, and(
        eq(billingPayments.verifiedByUserId, users.id),
        eq(billingPayments.orgId, users.orgId),
      ))
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

    // Update status, and reactivate the org in the same transaction — a
    // verified payment should never leave the org sitting suspended.
    const [updated] = await db.transaction(async (tx) => {
      const [payment] = await tx.update(billingPayments)
        .set({
          status: "verified",
          verifiedByUserId: p.userId,
          verifiedAt: now,
        })
        .where(eq(billingPayments.id, id))
        .returning();
      if (row.org.status !== "active") {
        await tx.update(organizations)
          .set({ status: "active" })
          .where(eq(organizations.id, row.org.id));
      }
      return [payment];
    });

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
      .leftJoin(users, and(
        eq(billingPayments.verifiedByUserId, users.id),
        eq(billingPayments.orgId, users.orgId),
      ))
      .where(eq(billingPayments.orgId, p.orgId))
      .orderBy(desc(billingPayments.createdAt));

    res.json({ org, payments });
  } catch (err) { next(err); }
});

// ── POST /api/billing/mpesa/initiate — company admin: pay via M-Pesa STK Push ─
const initiateSchema = z.object({
  amount: z.number().int().positive(),  // KES cents
  phoneNumber: z.string().min(9).max(15),
  period: z.string().min(1).max(100),
});

router.post("/mpesa/initiate", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() }); return;
    }
    const d = parsed.data;

    const stk = await initiateStkPush({
      orgId: p.orgId,
      amount: d.amount / 100, // Safaricom's Amount is whole KES, not cents
      phoneNumber: d.phoneNumber,
      transactionDesc: "Mavuno HR",
    });

    // Placeholder receipt no, same pattern as the manual-entry endpoint —
    // the real number is assigned once the payment is confirmed.
    const [payment] = await db.insert(billingPayments).values({
      orgId: p.orgId,
      receiptNo: "RCP-PENDING",
      amount: d.amount,
      period: d.period,
      method: "mpesa",
      status: "pending",
      checkoutRequestId: stk.checkoutRequestId,
      merchantRequestId: stk.merchantRequestId,
      phoneNumber: d.phoneNumber,
    }).returning();

    res.status(202).json({
      paymentId: payment.id,
      checkoutRequestId: stk.checkoutRequestId,
      message: stk.customerMessage || "Check your phone to complete the M-Pesa payment.",
    });
  } catch (err) { next(err); }
});

// ── GET /api/billing/mpesa/:id/status — company admin: poll a pending payment ─
router.get("/mpesa/:id/status", requireAuth("org:admin"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    if (isNaN(id)) throw new HttpError(400, "Invalid payment id");

    const [payment] = await db.select().from(billingPayments)
      .where(and(eq(billingPayments.id, id), eq(billingPayments.orgId, p.orgId)))
      .limit(1);
    if (!payment) throw new HttpError(404, "Payment not found");

    res.json({ status: payment.status, mpesaReceiptNumber: payment.mpesaReceiptNumber });
  } catch (err) { next(err); }
});

// ── POST /api/billing/mpesa/callback — Safaricom posts the STK Push result ────
// Public endpoint (Safaricom cannot authenticate as a user). Never credits a
// payment on the strength of this POST body alone — it only uses the body to
// find which payment to look up, then independently re-verifies via the
// Transaction Status API before crediting anything. This closes both gaps
// flagged from the earlier TallyBill build: idempotency (unique index on
// mpesaReceiptNumber + an explicit already-verified check) and blind trust
// of an unauthenticated callback payload.
router.post("/mpesa/callback", async (req, res) => {
  // Always acknowledge quickly — Safaricom retries on non-200/slow responses,
  // and retried callbacks are exactly what the idempotency checks below guard
  // against, so acknowledging early is safe.
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const ip = getIp(req);
    if (!isAllowedCallbackIp(ip ?? "")) {
      logger.warn({ ip }, "mpesa: callback rejected — IP not in configured allowlist");
      return;
    }

    const body = req.body as any;
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback?.CheckoutRequestID) {
      logger.warn({ body }, "mpesa: callback missing CheckoutRequestID, ignoring");
      return;
    }
    const checkoutRequestId: string = stkCallback.CheckoutRequestID;

    const [payment] = await db.select().from(billingPayments)
      .where(eq(billingPayments.checkoutRequestId, checkoutRequestId))
      .limit(1);
    if (!payment) {
      logger.warn({ checkoutRequestId }, "mpesa: callback for unknown checkoutRequestId");
      return;
    }
    if (payment.status === "verified") {
      logger.info({ checkoutRequestId }, "mpesa: callback for already-verified payment, ignoring (idempotent)");
      return;
    }

    if (Number(stkCallback.ResultCode) !== 0) {
      await db.update(billingPayments)
        .set({ status: "failed" })
        .where(eq(billingPayments.id, payment.id));
      logger.info({ checkoutRequestId, resultDesc: stkCallback.ResultDesc }, "mpesa: payment not completed by customer");
      return;
    }

    // Independently re-verify with Safaricom rather than trusting the
    // callback body's own metadata items for the credited amount/receipt.
    const verification = await queryTransactionStatus(checkoutRequestId);
    if (verification.resultCode !== "0") {
      logger.warn({ checkoutRequestId, verification }, "mpesa: callback claimed success but status query disagrees, not crediting");
      return;
    }

    const items: { Name: string; Value?: string | number }[] =
      stkCallback.CallbackMetadata?.Item ?? [];
    const findItem = (name: string) => items.find((i) => i.Name === name)?.Value;
    const mpesaReceiptNumber = String(findItem("MpesaReceiptNumber") ?? "");
    const amountPaid = Number(findItem("Amount") ?? 0) * 100; // back to cents

    if (!mpesaReceiptNumber) {
      logger.warn({ checkoutRequestId }, "mpesa: verified callback missing receipt number, not crediting");
      return;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      const receiptNo = `RCP-${now.getFullYear()}-${String(payment.id).padStart(5, "0")}`;
      await tx.update(billingPayments)
        .set({
          status: "verified",
          reference: mpesaReceiptNumber,
          mpesaReceiptNumber,
          receiptNo,
          amount: amountPaid || payment.amount,
          verifiedAt: now,
        })
        .where(eq(billingPayments.id, payment.id));

      await tx.update(organizations)
        .set({ status: "active" })
        .where(eq(organizations.id, payment.orgId));
    });

    logger.info({ checkoutRequestId, mpesaReceiptNumber, orgId: payment.orgId }, "mpesa: payment verified, org activated");

    // Best-effort receipt email — failure here must not undo the activation above.
    try {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, payment.orgId)).limit(1);
      const adminUsers = await db.select({ email: users.email })
        .from(users).where(and(eq(users.orgId, payment.orgId), eq(users.role, "admin")));
      for (const u of adminUsers) {
        if (!u.email) continue;
        await sendReceiptEmail({
          to: u.email,
          orgName: org?.name ?? "",
          receiptNo: `RCP-${now.getFullYear()}-${String(payment.id).padStart(5, "0")}`,
          period: payment.period,
          amountKes: `KES ${((amountPaid || payment.amount) / 100).toLocaleString("en-KE")}`,
          method: "mpesa",
          reference: mpesaReceiptNumber,
          verifiedAt: now.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }),
          plan: (org?.plan ?? "").charAt(0).toUpperCase() + (org?.plan ?? "").slice(1),
        });
      }
      await db.update(billingPayments).set({ receiptSentAt: now }).where(eq(billingPayments.id, payment.id));
    } catch (mailErr) {
      logger.error({ err: mailErr }, "mpesa: receipt email failed after successful activation");
    }
  } catch (err) {
    logger.error({ err }, "mpesa: callback processing failed");
  }
});

export default router;
