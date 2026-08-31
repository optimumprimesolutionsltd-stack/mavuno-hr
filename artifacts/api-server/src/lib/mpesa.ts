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

/** Builds the short, Safaricom-safe (<=12 char) account reference for an org. */
export function accountReferenceFor(orgId: number): string {
  return `MHR-${String(orgId).padStart(6, "0")}`;
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
