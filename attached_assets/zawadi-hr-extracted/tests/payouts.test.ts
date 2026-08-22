import { describe, it, expect } from "vitest";
import { generateBankEft, generateMpesaB2c, generatePain001, type PayoutItem } from "@/lib/payouts/generate";
import { generateP10, generateNssf, reconcile, type FilingRow } from "@/lib/statutory/filings";
import { toCents } from "@/lib/money";

const K = toCents;
const bankItem = (o: Partial<PayoutItem> = {}): PayoutItem => ({
  employeeId: 1, empNo: "ZW-1001", name: "Wanjiku Kamau", netPay: K("85000"),
  payMethod: "bank", bankCode: "01", bankBranchCode: "100", bankAccount: "1145678901",
  mpesaPhone: null, nationalId: "12345678", ...o,
});
const ctx = { orgName: "Acme Ltd", debitAccount: "0100200300", valueDate: "2026-01-28", period: "2026-01", reference: "PR202601" };

describe("Bank EFT file", () => {
  it("emits header, detail rows and a control trailer the bank reconciles against", () => {
    const f = generateBankEft([bankItem(), bankItem({ empNo: "ZW-1002", netPay: K("15000") })], ctx);
    expect(f.itemCount).toBe(2);
    expect(f.totalAmount).toBe(K("100000"));
    expect(f.content).toContain("H,Acme Ltd");
    expect(f.content).toContain("T,2,100000.00,KES");   // trailer catches truncated uploads
    expect(f.checksum).toHaveLength(64);
  });

  it("rejects bad rows loudly instead of letting the bank fail at 4pm on payday", () => {
    const f = generateBankEft([
      bankItem({ empNo: "BAD-1", bankAccount: null }),
      bankItem({ empNo: "BAD-2", bankCode: null }),
      bankItem({ empNo: "BAD-3", netPay: 0 }),
      bankItem({ empNo: "GOOD" }),
    ], ctx);
    expect(f.itemCount).toBe(1);
    expect(f.rejected).toHaveLength(3);
    expect(f.rejected.map((r) => r.empNo)).toEqual(["BAD-1", "BAD-2", "BAD-3"]);
  });

  it("escapes commas in names so the CSV does not shift columns", () => {
    const f = generateBankEft([bankItem({ name: "Kamau, Wanjiku" })], ctx);
    expect(f.content).toContain('"Kamau, Wanjiku"');
  });
});

describe("M-Pesa B2C file", () => {
  const m = (o: Partial<PayoutItem> = {}) =>
    bankItem({ payMethod: "mpesa", mpesaPhone: "254712345678", bankAccount: null, bankCode: null, ...o });

  it("pays whole shillings and reports the cents residual rather than losing it", () => {
    const f = generateMpesaB2c([m({ netPay: K("85000.99") })], { shortCode: "600100", period: "2026-01", reference: "PR1" });
    expect(f.content).toContain("254712345678,85000,SalaryPayment");
    expect(f.rejected.some((r) => r.reason.includes("residual"))).toBe(true);
  });

  it("refuses payments above the Safaricom B2C ceiling", () => {
    const f = generateMpesaB2c([m({ empNo: "BIG", netPay: K("300000") })], { shortCode: "600100", period: "2026-01", reference: "PR1" });
    expect(f.itemCount).toBe(0);
    expect(f.rejected[0].reason).toContain("250,000");
  });

  it("rejects malformed phone numbers", () => {
    const f = generateMpesaB2c([m({ empNo: "BAD", mpesaPhone: "0712345678" })], { shortCode: "600100", period: "2026-01", reference: "PR1" });
    expect(f.rejected[0].reason).toContain("Invalid M-Pesa");
  });
});

describe("ISO 20022 pain.001 (Pesalink)", () => {
  it("carries a control sum the receiving bank validates", () => {
    const f = generatePain001([bankItem(), bankItem({ netPay: K("15000") })], {
      ...ctx, orgId: "A012345678Z", debitBic: "KCBLKENX", createdAt: "2026-01-25T10:00:00Z",
    });
    expect(f.content).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(f.content).toContain("<CtrlSum>100000.00</CtrlSum>");
    expect(f.content).toContain('<InstdAmt Ccy="KES">85000.00</InstdAmt>');
  });
  it("XML-escapes names so a stray ampersand cannot corrupt the file", () => {
    const f = generatePain001([bankItem({ name: "Mary & Sons Ltd" })], {
      ...ctx, orgId: "A1", debitBic: "KCBLKENX", createdAt: "2026-01-25T10:00:00Z",
    });
    expect(f.content).toContain("Mary &amp; Sons Ltd");
  });
});

const row = (o: Partial<FilingRow> = {}): FilingRow => ({
  empNo: "ZW-1001", firstName: "Wanjiku", lastName: "Kamau",
  kraPin: "A012345678Z", nationalId: "12345678", nssfNo: "NSSF001", shifNo: "SHIF001",
  employmentType: "permanent", residentStatus: "resident", disabilityExemption: false,
  basic: K("100000"), allowances: K("20000"), nonCashBenefit: 0, gross: K("120000"),
  nssfEmployee: K("4320"), nssfEmployer: K("4320"), shif: K("3300"),
  housingLevyEmployee: K("1800"), housingLevyEmployer: K("1800"),
  pension: 0, mortgageInterest: 0, taxableIncome: K("110580"),
  payeBeforeRelief: K("28000"), personalRelief: K("2400"), insuranceRelief: 0, paye: K("25600"),
  ...o,
});

describe("KRA P10 return", () => {
  it("quarantines rows with a bad KRA PIN, naming the employee", () => {
    const f = generateP10(
      [row(), row({ empNo: "ZW-1002", kraPin: null }), row({ empNo: "ZW-1003", kraPin: "NOTAPIN" })],
      { employerPin: "P051234567X", employerName: "Acme Ltd", period: "2026-01" },
    );
    expect(f.itemCount).toBe(1);
    expect(f.exceptions).toHaveLength(2);
    expect(f.exceptions[0].reason).toContain("iTax will reject");
  });
  it("groups NSSF and registered pension under DCRS as iTax expects", () => {
    const f = generateP10([row({ pension: K("10000") })],
      { employerPin: "P051234567X", employerName: "Acme", period: "2026-01" });
    expect(f.content).toContain("14320.00");   // 4,320 NSSF + 10,000 pension
  });
});

describe("NSSF schedule", () => {
  it("flags members with no NSSF number", () => {
    const f = generateNssf([row(), row({ empNo: "ZW-9", nssfNo: null })],
      { employerNo: "E123", employerName: "Acme", period: "2026-01" });
    expect(f.itemCount).toBe(1);
    expect(f.exceptions[0].empNo).toBe("ZW-9");
  });
});

describe("Reconciliation", () => {
  it("tells Finance exactly what to remit to each regulator", () => {
    const r = reconcile([row(), row()]);
    expect(r.employees).toBe(2);
    expect(r.remitToKra).toBe(K("58400"));    // 2*(25,600 PAYE + 1,800 + 1,800 AHL)
    expect(r.remitToNssf).toBe(K("17280"));   // 2*(4,320 + 4,320)
    expect(r.remitToShif).toBe(K("6600"));    // 2*3,300
  });
});
