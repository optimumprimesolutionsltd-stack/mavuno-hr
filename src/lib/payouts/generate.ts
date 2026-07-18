import { createHash } from "crypto";
import { fromCents, type Cents } from "@/lib/money";

/**
 * PAYOUT FILE GENERATION.
 *
 * The gap that mattered most in the original: payroll computed correctly and
 * then nobody got paid. An HR manager still exported to Excel, retyped 200 rows
 * into the bank portal, and made a typo. This module closes that loop.
 *
 * Three channels, because that is how Kenyan employers actually pay:
 *   - bank_eft   : per-bank bulk CSV (KCB, Equity, Co-op all accept a variant)
 *   - pesalink   : inter-bank instant, ISO 20022 pain.001
 *   - mpesa_b2c  : Safaricom Business-to-Customer bulk disbursement
 *
 * Every file is checksummed and recorded in `payout_batches`, so "what exactly
 * did we send the bank on 28 June" has a definitive answer.
 */

export interface PayoutItem {
  employeeId: number;
  empNo: string;
  name: string;
  netPay: Cents;
  payMethod: "bank" | "mpesa" | "cash";
  bankCode: string | null;
  bankBranchCode: string | null;
  bankAccount: string | null;
  mpesaPhone: string | null;
  nationalId: string | null;
}

export interface PayoutFile {
  channel: "bank_eft" | "pesalink" | "mpesa_b2c";
  format: "csv" | "iso20022_pain001";
  filename: string;
  content: string;
  itemCount: number;
  totalAmount: Cents;
  checksum: string;
  rejected: { empNo: string; reason: string }[];
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Pre-flight validation. A payout file that the bank rejects at 4pm on payday
 * is worse than no file at all, so we reject bad rows here — loudly, with the
 * employee number — instead of shipping them and letting the bank fail silently.
 */
function validate(item: PayoutItem, channel: PayoutFile["channel"]): string | null {
  if (item.netPay <= 0) return "Net pay is zero or negative";
  if (item.netPay > 100_000_000_00) return "Net pay exceeds sane ceiling — check for a data error";

  if (channel === "mpesa_b2c") {
    if (item.payMethod !== "mpesa") return "Not an M-Pesa payee";
    if (!item.mpesaPhone || !/^254[17]\d{8}$/.test(item.mpesaPhone))
      return "Invalid M-Pesa number (expected 2547XXXXXXXX)";
    // Safaricom B2C per-transaction ceiling.
    if (item.netPay > 250_000_00) return "Exceeds M-Pesa B2C limit of KES 250,000 — pay by bank";
  } else {
    if (item.payMethod !== "bank") return "Not a bank payee";
    if (!item.bankAccount) return "Missing bank account number";
    if (!item.bankCode) return "Missing bank code";
    if (!/^\d{4,20}$/.test(item.bankAccount)) return "Bank account is not numeric";
  }
  return null;
}

function split(items: PayoutItem[], channel: PayoutFile["channel"]) {
  const ok: PayoutItem[] = [];
  const rejected: { empNo: string; reason: string }[] = [];
  for (const i of items) {
    const err = validate(i, channel);
    if (err) rejected.push({ empNo: i.empNo, reason: err });
    else ok.push(i);
  }
  return { ok, rejected };
}

const total = (xs: PayoutItem[]): Cents => xs.reduce((a, b) => a + b.netPay, 0);

/** Bank bulk EFT — the widely-accepted Kenyan bulk-credit CSV shape. */
export function generateBankEft(
  items: PayoutItem[],
  ctx: { orgName: string; debitAccount: string; valueDate: string; period: string; reference: string },
): PayoutFile {
  const { ok, rejected } = split(items, "bank_eft");

  const header = [
    "RecordType","BeneficiaryName","BankCode","BranchCode","AccountNumber",
    "Amount","Currency","Narration","Reference","ValueDate",
  ].join(",");

  const rows = ok.map((i) =>
    [
      "D",
      csvEscape(i.name),
      i.bankCode!,
      i.bankBranchCode ?? "000",
      i.bankAccount!,
      fromCents(i.netPay),
      "KES",
      csvEscape(`SALARY ${ctx.period}`),
      csvEscape(`${ctx.reference}-${i.empNo}`),
      ctx.valueDate,
    ].join(","),
  );

  // Trailer with count + total: the bank reconciles against this, and it is
  // what catches a truncated upload.
  const trailer = ["T", String(ok.length), fromCents(total(ok)), "KES"].join(",");

  const content = [
    `H,${csvEscape(ctx.orgName)},${ctx.debitAccount},${ctx.valueDate},${ctx.reference}`,
    header, ...rows, trailer,
  ].join("\r\n") + "\r\n";

  return {
    channel: "bank_eft", format: "csv",
    filename: `EFT_${ctx.period}_${ctx.reference}.csv`,
    content, itemCount: ok.length, totalAmount: total(ok),
    checksum: sha256(content), rejected,
  };
}

/** M-Pesa B2C bulk disbursement upload. */
export function generateMpesaB2c(
  items: PayoutItem[],
  ctx: { shortCode: string; period: string; reference: string },
): PayoutFile {
  const { ok, rejected } = split(items, "mpesa_b2c");

  const header = ["MSISDN","Amount","CommandID","Remarks","Occassion","Reference"].join(",");
  const rows = ok.map((i) =>
    [
      i.mpesaPhone!,
      // Safaricom B2C takes whole shillings only — never cents.
      String(Math.floor(i.netPay / 100)),
      "SalaryPayment",
      csvEscape(`Salary ${ctx.period}`),
      csvEscape(ctx.period),
      csvEscape(`${ctx.reference}-${i.empNo}`),
    ].join(","),
  );

  const content = [`# Shortcode: ${ctx.shortCode}`, header, ...rows].join("\r\n") + "\r\n";

  /* Rounding down to whole shillings loses up to 99c per payee. We surface the
   * residual rather than hiding it, so Finance can post the difference. */
  const paid = ok.reduce((a, b) => a + Math.floor(b.netPay / 100) * 100, 0);
  const residual = total(ok) - paid;
  if (residual > 0) {
    rejected.push({
      empNo: "—",
      reason: `M-Pesa pays whole shillings: KES ${fromCents(residual)} of cents residual across ${ok.length} payees must be posted manually`,
    });
  }

  return {
    channel: "mpesa_b2c", format: "csv",
    filename: `MPESA_B2C_${ctx.period}_${ctx.reference}.csv`,
    content, itemCount: ok.length, totalAmount: paid as Cents,
    checksum: sha256(content), rejected,
  };
}

/** Pesalink / inter-bank — ISO 20022 pain.001.001.03 credit transfer. */
export function generatePain001(
  items: PayoutItem[],
  ctx: {
    orgName: string; orgId: string; debitAccount: string; debitBic: string;
    valueDate: string; period: string; reference: string; createdAt: string;
  },
): PayoutFile {
  const { ok, rejected } = split(items, "pesalink");
  const sum = total(ok);
  const esc = (s: string) => s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

  const txs = ok.map((i, n) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(ctx.reference)}-${esc(i.empNo)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="KES">${fromCents(i.netPay)}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><MmbId>${esc(i.bankCode!)}</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${esc(i.name)}</Nm></Cdtr>
        <CdtrAcct><Id><Othr><Id>${esc(i.bankAccount!)}</Id></Othr></Id></CdtrAcct>
        <RmtInf><Ustrd>SALARY ${esc(ctx.period)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`).join("");

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(ctx.reference)}</MsgId>
      <CreDtTm>${ctx.createdAt}</CreDtTm>
      <NbOfTxs>${ok.length}</NbOfTxs>
      <CtrlSum>${fromCents(sum)}</CtrlSum>
      <InitgPty><Nm>${esc(ctx.orgName)}</Nm><Id><OrgId><Othr><Id>${esc(ctx.orgId)}</Id></Othr></OrgId></Id></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(ctx.reference)}-PMT</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${ok.length}</NbOfTxs>
      <CtrlSum>${fromCents(sum)}</CtrlSum>
      <ReqdExctnDt>${ctx.valueDate}</ReqdExctnDt>
      <Dbtr><Nm>${esc(ctx.orgName)}</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>${esc(ctx.debitAccount)}</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>${esc(ctx.debitBic)}</BICFI></FinInstnId></DbtrAgt>${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;

  return {
    channel: "pesalink", format: "iso20022_pain001",
    filename: `PAIN001_${ctx.period}_${ctx.reference}.xml`,
    content, itemCount: ok.length, totalAmount: sum,
    checksum: sha256(content), rejected,
  };
}
