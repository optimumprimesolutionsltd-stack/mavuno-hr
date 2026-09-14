/**
 * Fallback poller for M-Pesa STK Push payments whose Safaricom callback
 * never arrived. Closes the exact gap flagged (but never built) in the
 * earlier TallyBill project: if a callback is dropped — the customer's
 * network drops, our callback URL is briefly unreachable, Safaricom's retry
 * window is exhausted — a real completed payment would otherwise sit stuck
 * at "pending" forever, looking unpaid with no visible cause.
 *
 * This does not replace the callback handler's own verification; it uses
 * the same Transaction Status API call, just triggered on a timer instead
 * of an inbound webhook, for payments old enough that a callback was
 * reasonably expected to have arrived by now.
 */
import { db } from "@workspace/db";
import { billingPayments, organizations, users } from "@workspace/db/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { queryTransactionStatus, accountReferenceFor } from "./mpesa.js";
import { sendReceiptEmail } from "./mailer.js";
import { extendAccessUntil } from "./pricing.js";
import { consumeCreditsForPayment } from "./billing-credits.js";
import { settleChargeForPayment } from "./billing-run.js";
import { logger } from "./logger.js";

// Give Safaricom's own callback a fair chance to arrive first — only poll
// payments that have been pending for at least this long.
const MIN_AGE_MS = 3 * 60 * 1000; // 3 minutes
// Stop polling payments this old — the STK push prompt itself expires on
// the customer's phone well before this, so a payment still pending after
// this long is treated as abandoned rather than polled indefinitely.
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function pollPendingMpesaPayments(): Promise<void> {
  const now = Date.now();
  const oldEnoughCutoff = new Date(now - MIN_AGE_MS);

  const pending = await db.select().from(billingPayments).where(and(
    eq(billingPayments.status, "pending"),
    eq(billingPayments.method, "mpesa"),
    isNotNull(billingPayments.checkoutRequestId),
    lt(billingPayments.createdAt, oldEnoughCutoff),
  ));

  for (const payment of pending) {
    if (!payment.checkoutRequestId) continue;

    if (now - payment.createdAt.getTime() > MAX_AGE_MS) {
      await db.update(billingPayments)
        .set({ status: "failed" })
        .where(eq(billingPayments.id, payment.id));
      logger.info({ paymentId: payment.id }, "mpesa-poller: abandoned payment marked failed");
      continue;
    }

    try {
      const result = await queryTransactionStatus(payment.checkoutRequestId);
      if (result.resultCode !== "0") {
        // Still not completed (or genuinely failed) — leave as pending
        // unless Safaricom's own result code indicates a final failure.
        continue;
      }

      // Re-check status right before writing — the real callback may have
      // landed while this query was in flight. Never double-credit.
      const [fresh] = await db.select().from(billingPayments)
        .where(eq(billingPayments.id, payment.id)).limit(1);
      if (!fresh || fresh.status === "verified") continue;

      const receiptNow = new Date();
      const receiptNo = `RCP-${receiptNow.getFullYear()}-${String(payment.id).padStart(5, "0")}`;

      // A recovered payment has to do everything the callback would have done.
      // Reactivating the org without pushing access_until forward left the
      // customer looking active and still locked out of payroll by
      // requireActiveAccess() — the one difference between this path and the
      // callback's, and invisible until somebody's callback went missing.
      const [orgBefore] = await db.select({
        accessUntil: organizations.accessUntil, billingCycle: organizations.billingCycle,
      }).from(organizations).where(eq(organizations.id, payment.orgId)).limit(1);
      const newAccessUntil = extendAccessUntil(orgBefore?.accessUntil ?? null, orgBefore?.billingCycle ?? "monthly");

      await db.transaction(async (tx) => {
        await tx.update(billingPayments)
          .set({ status: "verified", receiptNo, verifiedAt: receiptNow })
          .where(and(eq(billingPayments.id, payment.id), eq(billingPayments.status, "pending")));
        await tx.update(organizations)
          .set({ status: "active", accessUntil: newAccessUntil })
          .where(eq(organizations.id, payment.orgId));
        await consumeCreditsForPayment(tx, payment.orgId, payment.id, payment.amount, {
          userId: null, email: "mpesa-poller@system", ip: null,
        });
      });

      await settleChargeForPayment(payment.orgId, payment.id, payment.amount);

      logger.info(
        { paymentId: payment.id, orgId: payment.orgId, accessUntil: newAccessUntil },
        "mpesa-poller: recovered a payment whose callback never arrived",
      );

      try {
        const [org] = await db.select().from(organizations).where(eq(organizations.id, payment.orgId)).limit(1);
        const adminUsers = await db.select({ email: users.email })
          .from(users).where(and(eq(users.orgId, payment.orgId), eq(users.role, "admin")));
        for (const u of adminUsers) {
          if (!u.email) continue;
          await sendReceiptEmail({
            to: u.email,
            orgName: org?.name ?? "",
            billingRef: accountReferenceFor(payment.orgId),
            receiptNo,
            period: payment.period,
            amountKes: `KES ${(payment.amount / 100).toLocaleString("en-KE")}`,
            method: "mpesa",
            reference: payment.reference,
            verifiedAt: receiptNow.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }),
            plan: (org?.plan ?? "").charAt(0).toUpperCase() + (org?.plan ?? "").slice(1),
          });
        }
        await db.update(billingPayments).set({ receiptSentAt: receiptNow }).where(eq(billingPayments.id, payment.id));
      } catch (mailErr) {
        logger.error({ err: mailErr, paymentId: payment.id }, "mpesa-poller: receipt email failed after recovery");
      }
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, "mpesa-poller: status query failed (non-fatal, will retry next cycle)");
    }
  }
}

/** Schedule the poller: run once shortly after startup, then every 15 minutes. */
export function scheduleMpesaPaymentPoller(): void {
  setTimeout(() => {
    pollPendingMpesaPayments().catch((err) =>
      logger.error({ err }, "mpesa-poller: initial run failed (non-fatal)"),
    );
  }, 60 * 1000);

  setInterval(() => {
    pollPendingMpesaPayments().catch((err) =>
      logger.error({ err }, "mpesa-poller: scheduled run failed (non-fatal)"),
    );
  }, 15 * 60 * 1000);
}
