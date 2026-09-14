/**
 * Paybill (C2B) confirmations — parsing what Safaricom sends, and deciding
 * whether it can be believed.
 *
 * The stakes are different from STK Push: the money has already moved when the
 * confirmation arrives, there is no CheckoutRequestID to re-query, and the URL
 * is public. So the two questions these tests pin down are "what did they
 * actually pay, and against what reference" and "is this really Safaricom".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseC2BConfirmation, c2bTrustState, accountReferenceFor, type C2BConfirmation,
} from "../lib/mpesa.js";

const REF_42 = accountReferenceFor(42); // "MHR-000042K"

function confirmation(over: Partial<C2BConfirmation> = {}): C2BConfirmation {
  return {
    TransactionType: "Pay Bill",
    TransID: "SFC1A2B3C4",
    TransTime: "20260914183000",
    TransAmount: "2500.00",
    BusinessShortCode: "4123456",
    BillRefNumber: REF_42,
    MSISDN: "254708374149",
    FirstName: "JOHN",
    MiddleName: "",
    LastName: "KAMAU",
    ...over,
  };
}

describe("parseC2BConfirmation", () => {
  it("pulls out the transaction, the amount in cents, and the org", () => {
    const p = parseC2BConfirmation(confirmation())!;
    expect(p.transId).toBe("SFC1A2B3C4");
    expect(p.amountCents).toBe(250_000);
    expect(p.orgId).toBe(42);
    expect(p.payerName).toBe("JOHN KAMAU");
    expect(p.msisdn).toBe("254708374149");
  });

  it("handles a whole-shilling amount sent as a number", () => {
    expect(parseC2BConfirmation(confirmation({ TransAmount: 1500 }))!.amountCents).toBe(150_000);
  });

  it("keeps the payment but not the org when the reference is mistyped", () => {
    // The single most important case here. The customer typed the reference
    // themselves and got it wrong; the money is still real, so this must parse
    // successfully with orgId null rather than failing and being dropped.
    const p = parseC2BConfirmation(confirmation({ BillRefNumber: "MHR-000042X" }))!;
    expect(p).not.toBeNull();
    expect(p.amountCents).toBe(250_000);
    expect(p.orgId).toBeNull();
    expect(p.billRefNumber).toBe("MHR-000042X");
  });

  it("keeps the payment when there is no reference at all", () => {
    const p = parseC2BConfirmation(confirmation({ BillRefNumber: "" }))!;
    expect(p.orgId).toBeNull();
    expect(p.billRefNumber).toBe("");
  });

  it("accepts the reference however the customer spaced or cased it", () => {
    const messy = REF_42.toLowerCase().replace("-", " ");
    expect(parseC2BConfirmation(confirmation({ BillRefNumber: messy }))!.orgId).toBe(42);
  });

  it("returns null only when it isn't a payment notification at all", () => {
    expect(parseC2BConfirmation({})).toBeNull();
    expect(parseC2BConfirmation(confirmation({ TransID: "" }))).toBeNull();
    expect(parseC2BConfirmation(confirmation({ TransAmount: "0" }))).toBeNull();
    expect(parseC2BConfirmation(confirmation({ TransAmount: "not a number" }))).toBeNull();
  });
});

describe("c2bTrustState", () => {
  const SAFARICOM_IP = "196.201.214.200";
  let env: NodeJS.ProcessEnv;

  beforeEach(() => { env = { ...process.env }; });
  afterEach(() => { process.env = env; });

  it("trusts a confirmation from an allowlisted IP", () => {
    process.env.MPESA_CALLBACK_IP_ALLOWLIST = `${SAFARICOM_IP},196.201.214.206`;
    delete process.env.MPESA_C2B_CALLBACK_SECRET;
    expect(c2bTrustState({ ip: SAFARICOM_IP, secretInUrl: null })).toEqual({
      trusted: true, how: "ip_allowlist",
    });
  });

  it("does not trust an IP outside a configured allowlist", () => {
    process.env.MPESA_CALLBACK_IP_ALLOWLIST = SAFARICOM_IP;
    delete process.env.MPESA_C2B_CALLBACK_SECRET;
    expect(c2bTrustState({ ip: "203.0.113.9", secretInUrl: null }).trusted).toBe(false);
  });

  it("trusts the secret in the registered URL, whatever the source IP", () => {
    delete process.env.MPESA_CALLBACK_IP_ALLOWLIST;
    process.env.MPESA_C2B_CALLBACK_SECRET = "s3cr3t-path-segment";
    expect(c2bTrustState({ ip: "203.0.113.9", secretInUrl: "s3cr3t-path-segment" })).toEqual({
      trusted: true, how: "url_secret",
    });
  });

  it("rejects a wrong or missing secret", () => {
    delete process.env.MPESA_CALLBACK_IP_ALLOWLIST;
    process.env.MPESA_C2B_CALLBACK_SECRET = "s3cr3t-path-segment";
    expect(c2bTrustState({ ip: "203.0.113.9", secretInUrl: "wrong" }).trusted).toBe(false);
    expect(c2bTrustState({ ip: "203.0.113.9", secretInUrl: null }).trusted).toBe(false);
    // A prefix of the real secret must not pass either.
    expect(c2bTrustState({ ip: "203.0.113.9", secretInUrl: "s3cr3t" }).trusted).toBe(false);
  });

  it("trusts nothing when neither is configured", () => {
    // The deployment default. Payments still get recorded — they are real
    // money — but they are held for a human rather than auto-credited, because
    // anyone who found the URL could otherwise buy themselves a subscription.
    delete process.env.MPESA_CALLBACK_IP_ALLOWLIST;
    delete process.env.MPESA_C2B_CALLBACK_SECRET;
    expect(c2bTrustState({ ip: SAFARICOM_IP, secretInUrl: null })).toEqual({
      trusted: false, how: "none",
    });
  });

  it("ignores a secret in the URL when none is configured", () => {
    delete process.env.MPESA_CALLBACK_IP_ALLOWLIST;
    delete process.env.MPESA_C2B_CALLBACK_SECRET;
    expect(c2bTrustState({ ip: "203.0.113.9", secretInUrl: "anything" }).trusted).toBe(false);
  });
});
