import { timingSafeEqual } from "node:crypto";
import { logger } from "./logger.js";
import { HttpError } from "./http-error.js";

/**
 * M-Pesa Daraja API client — STK Push (Lipa Na M-Pesa Online) for collecting
 * subscription payments, plus the Transaction Status API used to
 * independently confirm a payment before crediting it.
 *
 * Required env vars:
 *   MPESA_ENV                — "sandbox" | "production"
 *   MPESA_CONSUMER_KEY
 *   MPESA_CONSUMER_SECRET
 *   MPESA_SHORTCODE          — paybill/till number (PartyB)
 *   MPESA_PASSKEY             — Lipa Na M-Pesa Online passkey for the shortcode
 *   MPESA_CALLBACK_URL        — public HTTPS URL Safaricom posts results to
 *   MPESA_INITIATOR_NAME      — for Transaction Status API
 *   MPESA_SECURITY_CREDENTIAL — encrypted initiator password, for Transaction Status API
 *
 * Optional, for Paybill (C2B) payments made by hand rather than via STK Push:
 *   MPESA_CALLBACK_IP_ALLOWLIST — comma-separated Safaricom source IPs
 *   MPESA_C2B_CALLBACK_SECRET   — unguessable path segment on the registered
 *                                 C2B URLs. Either of these authenticates a
 *                                 confirmation; with neither, C2B payments are
 *                                 recorded but held for manual allocation.
 */

const BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `M-Pesa is not configured: missing ${name}`);
  return value;
}

/**
 * Optional callback-source IP allowlist. Safaricom's published callback IP
 * ranges change over time and are not hardcoded here — hardcoding a list we
 * can't keep current risks silently rejecting real Safaricom traffic, which
 * is worse than not filtering at all (a payment would look unpaid with no
 * visible cause). If you want this layer, set MPESA_CALLBACK_IP_ALLOWLIST to
 * a comma-separated list of the current IPs from your Daraja portal /
 * Safaricom's current integration guide, and it will be enforced; otherwise
 * this check is skipped and the Transaction Status API call in the callback
 * handler is the actual trust boundary — the callback body is never credited
 * on its own, only used to look up which payment to independently re-verify.
 */
export function isAllowedCallbackIp(ip: string): boolean {
  const raw = process.env.MPESA_CALLBACK_IP_ALLOWLIST;
  if (!raw) return true; // no allowlist configured — rely on Transaction Status verification instead
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(ip);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000) {
    return cachedToken.value;
  }
  const key = requiredEnv("MPESA_CONSUMER_KEY");
  const secret = requiredEnv("MPESA_CONSUMER_SECRET");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    logger.error({ status: res.status }, "mpesa: failed to obtain access token");
    throw new HttpError(502, "Could not authenticate with M-Pesa");
  }
  const body = (await res.json()) as { access_token: string; expires_in: string };
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in) * 1000,
  };
  return cachedToken.value;
}

function darajaTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/**
 * The customer's billing account number, e.g. "MHR-000042K". This is what they
 * quote as the reference for a bank transfer or M-Pesa Paybill, and it is sent
 * as the STK Push AccountReference so it shows on their M-Pesa statement.
 *
 * MHR- + the 6-digit org id + one check character (base-36). The check char
 * makes a mistyped reference fail validation instead of silently pointing at
 * another org. 11 chars — within Safaricom's 12-char AccountReference limit.
 */
const REF_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function refCheckChar(digits: string): string {
  // Weighted sum (weights 2,3,4,...) so a single-digit typo or an adjacent
  // transposition changes the result.
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (i + 2);
  return REF_ALPHABET[sum % 36];
}

export function accountReferenceFor(orgId: number): string {
  const digits = String(orgId).padStart(6, "0");
  return `MHR-${digits}${refCheckChar(digits)}`;
}

/**
 * Parse a billing account number back to an org id. Case-insensitive; tolerates
 * spaces and dashes ("mhr 000042 k" works). Returns null when the format is
 * wrong or the check character doesn't match — i.e. a typo.
 */
export function parseAccountReference(raw: string): number | null {
  const s = String(raw ?? "").toUpperCase().replace(/[\s-]+/g, "");
  const m = /^MHR(\d{6})([0-9A-Z])$/.exec(s);
  if (!m) return null;
  const [, digits, chk] = m;
  if (refCheckChar(digits) !== chk) return null;
  const id = Number(digits);
  return id > 0 ? id : null;
}

/** Normalizes a Kenyan phone number to the 2547XXXXXXXX format Daraja requires. */
export function normalizeKenyanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `254${digits}`;
  throw new HttpError(422, "Enter a valid Safaricom number, e.g. 07XXXXXXXX");
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

/** Initiates an STK Push prompt on the customer's phone for a paybill payment. */
export async function initiateStkPush(params: {
  orgId: number;
  amount: number;
  phoneNumber: string;
  transactionDesc: string;
}): Promise<StkPushResult> {
  const shortcode = requiredEnv("MPESA_SHORTCODE");
  const passkey = requiredEnv("MPESA_PASSKEY");
  const callbackUrl = requiredEnv("MPESA_CALLBACK_URL");
  const token = await getAccessToken();
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
  const phone = normalizeKenyanPhone(params.phoneNumber);
  const amount = Math.round(params.amount);
  if (amount < 1) throw new HttpError(422, "Amount must be at least KES 1");

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReferenceFor(params.orgId),
      TransactionDesc: params.transactionDesc.slice(0, 13),
    }),
  });

  const body = (await res.json()) as any;
  if (!res.ok || body.ResponseCode !== "0") {
    logger.error({ status: res.status, body }, "mpesa: STK push request failed");
    throw new HttpError(502, body.errorMessage ?? body.ResponseDescription ?? "Could not start the M-Pesa payment");
  }

  return {
    merchantRequestId: body.MerchantRequestID,
    checkoutRequestId: body.CheckoutRequestID,
    responseCode: body.ResponseCode,
    responseDescription: body.ResponseDescription,
    customerMessage: body.CustomerMessage,
  };
}

// ── C2B (Paybill paid by hand) ───────────────────────────────────────────────

/**
 * The shape Safaricom posts to a C2B confirmation URL. Everything is a string
 * or missing — the field names are Safaricom's, verbatim, so the mapping to
 * ours stays visible at the one place it happens.
 */
export interface C2BConfirmation {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string | number;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string | number;
  ThirdPartyTransID?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface ParsedC2B {
  transId: string;
  amountCents: number;
  billRefNumber: string;
  msisdn: string | null;
  payerName: string | null;
  transTime: string | null;
  /** Org the reference resolves to, or null when it doesn't parse. */
  orgId: number | null;
}

/**
 * Pull the fields we store out of a confirmation body. Returns null only when
 * the body has no TransID or no amount — i.e. it isn't a payment notification
 * at all. A bad *account reference* is not a parse failure: the money is real
 * and has to be recorded either way, with orgId left null for a human.
 */
export function parseC2BConfirmation(body: C2BConfirmation): ParsedC2B | null {
  const transId = String(body?.TransID ?? "").trim();
  const amount = Number(body?.TransAmount ?? 0);
  if (!transId || !Number.isFinite(amount) || amount <= 0) return null;

  const billRefNumber = String(body?.BillRefNumber ?? "").trim();
  const name = [body?.FirstName, body?.MiddleName, body?.LastName]
    .map((n) => String(n ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return {
    transId,
    amountCents: Math.round(amount * 100),
    billRefNumber,
    msisdn: String(body?.MSISDN ?? "").trim() || null,
    payerName: name || null,
    transTime: String(body?.TransTime ?? "").trim() || null,
    orgId: billRefNumber ? parseAccountReference(billRefNumber) : null,
  };
}

/**
 * Can this confirmation be trusted enough to credit an account automatically?
 *
 * C2B has no equivalent of the STK flow's Transaction Status re-query: there is
 * no CheckoutRequestID to ask Safaricom about, and the real Transaction Status
 * API answers asynchronously to a separate result URL. So the confirmation body
 * *is* the evidence, and an unauthenticated POST to a public URL must not be
 * able to hand somebody a paid subscription.
 *
 * Two independent ways to authenticate it, either of which is enough:
 *   - MPESA_CALLBACK_IP_ALLOWLIST — the source IP is one of Safaricom's.
 *   - MPESA_C2B_CALLBACK_SECRET — an unguessable segment in the registered
 *     confirmation URL, which only Safaricom and we know.
 *
 * With neither configured, the payment is still recorded — it is real money —
 * but parked as unallocated for a super-admin instead of auto-credited.
 */
export function c2bTrustState(args: { ip: string; secretInUrl: string | null }): {
  trusted: boolean;
  how: "ip_allowlist" | "url_secret" | "none";
} {
  const secret = process.env.MPESA_C2B_CALLBACK_SECRET?.trim();
  if (secret && args.secretInUrl && timingSafeEqualStr(args.secretInUrl, secret)) {
    return { trusted: true, how: "url_secret" };
  }
  if (process.env.MPESA_CALLBACK_IP_ALLOWLIST?.trim() && isAllowedCallbackIp(args.ip)) {
    return { trusted: true, how: "ip_allowlist" };
  }
  return { trusted: false, how: "none" };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Register the validation and confirmation URLs with Safaricom. A one-off per
 * shortcode (and again whenever the URLs change) — until this is done, a
 * Paybill payment never reaches us at all.
 *
 * ResponseType "Completed" means: if our validation URL is unreachable,
 * Safaricom completes the transaction anyway. The alternative ("Cancelled")
 * rejects the customer's payment when we are down, which is a much worse
 * failure — an unmatched payment we can allocate by hand, a rejected one at the
 * till is a support call and a lost sale.
 */
export async function registerC2BUrls(baseUrl: string): Promise<{ responseDescription: string }> {
  const shortcode = requiredEnv("MPESA_SHORTCODE");
  const token = await getAccessToken();
  const secret = process.env.MPESA_C2B_CALLBACK_SECRET?.trim();
  const suffix = secret ? `/${encodeURIComponent(secret)}` : "";
  const root = baseUrl.replace(/\/+$/, "");

  const res = await fetch(`${BASE_URL}/mpesa/c2b/v1/registerurl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ShortCode: shortcode,
      ResponseType: "Completed",
      ConfirmationURL: `${root}/api/billing/mpesa/c2b/confirmation${suffix}`,
      ValidationURL: `${root}/api/billing/mpesa/c2b/validation${suffix}`,
    }),
  });

  const body = (await res.json()) as any;
  if (!res.ok || (body.ResponseCode !== undefined && String(body.ResponseCode) !== "0")) {
    logger.error({ status: res.status, body }, "mpesa: C2B URL registration failed");
    throw new HttpError(502, body.errorMessage ?? body.ResponseDescription ?? "Could not register the C2B URLs");
  }
  return { responseDescription: body.ResponseDescription ?? "Registered" };
}

export interface TransactionStatusResult {
  resultCode: string;
  resultDesc: string;
  amount?: number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?: string;
}

/**
 * Independently verifies a payment via Safaricom's Transaction Status API,
 * rather than trusting the callback payload alone. This is the second of the
 * two safeguards carried over from the TallyBill lessons — never credit an
 * account on the strength of an unauthenticated POST body by itself.
 */
export async function queryTransactionStatus(checkoutRequestId: string): Promise<{
  resultCode: string;
  resultDesc: string;
}> {
  const shortcode = requiredEnv("MPESA_SHORTCODE");
  const passkey = requiredEnv("MPESA_PASSKEY");
  const token = await getAccessToken();
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const body = (await res.json()) as any;
  if (!res.ok) {
    logger.error({ status: res.status, body }, "mpesa: transaction status query failed");
    throw new HttpError(502, "Could not verify the M-Pesa payment status");
  }
  return {
    resultCode: String(body.ResultCode ?? body.errorCode ?? "unknown"),
    resultDesc: body.ResultDesc ?? body.errorMessage ?? "Unknown result",
  };
}
