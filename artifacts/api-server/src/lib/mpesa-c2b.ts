/**
 * Crediting a Paybill (C2B) payment.
 *
 * Lives here rather than in routes/billing.ts because two callers need it: the
 * confirmation handler, when the account reference resolves, and the
 * super-admin allocating a payment whose reference didn't. Both produce the
 * same thing — an allocated payment must be indistinguishable from one that
 * found its own org.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { billingPayments, users } from "@workspace/db/schema";
import { accountReferenceFor, type ParsedC2B } from "./mpesa.js";
import { sendReceiptEmail } from "./mailer.js";
import { applyVerifiedPayment } from "./payment-settlement.js";
import { logger } from "./logger.js";

function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

function receiptNoFor(id: number): string {
  return `RCP-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
}

export async function creditC2BPayment(args: {
  orgId: number;
  orgName: string;
  orgPlan: string;
  parsed: ParsedC2B;
  actorEmail: string;
  actorUserId: number | null;
  ip: string | null;
}): Promise<{ paymentId: number; receiptNo: string }> {
  const { orgId, parsed } = args;
  const now = new Date();

  // The customer never told us which month they meant — they typed a shortcode
  // and an account number — so the period is the month the money arrived.
  const period = now.toLocaleDateString("en-KE", { month: "long", year: "numeric" });

  // Inserted as already-verified: with C2B the money has moved before we hear
  // about it, so there is no pending state to sit in. The unique index on
  // mpesa_receipt_number is the last line of defence against a replayed
  // confirmation crediting the same M-Pesa transaction twice.
  const [payment] = await db.insert(billingPayments).values({
    orgId,
    receiptNo: `RCP-PENDING-${parsed.transId}`,
    amount: parsed.amountCents,
    period,
    method: "mpesa",
    reference: parsed.transId,
    description: parsed.payerName
      ? `Paybill payment from ${parsed.payerName}${parsed.billRefNumber ? ` (ref ${parsed.billRefNumber})` : ""}`
      : "Paybill payment",
    status: "verified",
    mpesaReceiptNumber: parsed.transId,
    phoneNumber: parsed.msisdn,
    verifiedAt: now,
    verifiedByUserId: args.actorUserId,
  }).returning();

  const receiptNo = receiptNoFor(payment.id);
  await db.update(billingPayments).set({ receiptNo }).where(eq(billingPayments.id, payment.id));

  await applyVerifiedPayment({
    orgId,
    paymentId: payment.id,
    amountCents: parsed.amountCents,
    actor: { userId: args.actorUserId, email: args.actorEmail, ip: args.ip },
    detail: `M-Pesa Paybill payment ${parsed.transId}`,
  });

  logger.info({ orgId, transId: parsed.transId, amountCents: parsed.amountCents }, "mpesa-c2b: payment credited");

  // Best-effort receipt — a mail failure must not undo a real payment.
  try {
    const adminUsers = await db.select({ email: users.email })
      .from(users).where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
    for (const u of adminUsers) {
      if (!u.email) continue;
      await sendReceiptEmail({
        to: u.email,
        orgName: args.orgName,
        billingRef: accountReferenceFor(orgId),
        receiptNo,
        period,
        amountKes: formatKes(parsed.amountCents),
        method: "mpesa",
        reference: parsed.transId,
        verifiedAt: formatDate(now),
        plan: args.orgPlan.charAt(0).toUpperCase() + args.orgPlan.slice(1),
      });
    }
    await db.update(billingPayments).set({ receiptSentAt: now }).where(eq(billingPayments.id, payment.id));
  } catch (mailErr) {
    logger.error({ err: mailErr, paymentId: payment.id }, "mpesa-c2b: receipt email failed after crediting");
  }

  return { paymentId: payment.id, receiptNo };
}
