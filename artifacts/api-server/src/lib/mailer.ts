import nodemailer from "nodemailer";
import { logger } from "./logger.js";

// Gmail app passwords are often copied with spaces between groups of
// characters. Gmail ignores those spaces, but nodemailer does not.
const gmailUser = process.env.GMAIL_USER?.trim() ?? "";
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "") ?? "";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailUser,
    pass: gmailAppPassword,
  },
});

const FROM = () => `"Mavuno HR" <${gmailUser}>`;

/**
 * SMTP providers return detailed authentication and connection errors. Those
 * details are useful in server logs but should not be shown in the browser.
 */
export function getSafeMailError(error: unknown): string {
  const err = error as {
    code?: string;
    responseCode?: number;
    message?: string;
  } | null;
  const message = err?.message ?? "";

  if (!gmailUser || !gmailAppPassword) {
    return "Email delivery is not configured. Set the sender Gmail address and App Password, then try again.";
  }

  if (
    err?.code === "EAUTH" ||
    err?.responseCode === 535 ||
    /invalid login|badcredentials|username and password not accepted/i.test(message)
  ) {
    return "Gmail rejected the sender credentials. Update the sender Gmail address and create a fresh Gmail App Password, then try again.";
  }

  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET") {
    return "The email service could not be reached. Check the sender account settings and try again.";
  }

  return "The email service could not deliver this message. Check the sender account settings and try again.";
}

// ── Payment receipt ───────────────────────────────────────────────────────────

export async function sendReceiptEmail(opts: {
  to: string;
  orgName: string;
  receiptNo: string;
  period: string;
  amountKes: string;        // formatted, e.g. "KES 3,000"
  method: string;
  reference: string | null;
  verifiedAt: string;       // formatted date string
  plan: string;
}): Promise<void> {
  const { to, orgName, receiptNo, period, amountKes, method, reference, verifiedAt, plan } = opts;
  const methodLabel: Record<string, string> = {
    mpesa: "M-Pesa",
    bank_transfer: "Bank Transfer",
    cash: "Cash",
    cheque: "Cheque",
    other: "Other",
  };
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body { margin: 0; padding: 0; background: #0d1117; font-family: 'Segoe UI', Arial, sans-serif; color: #e6edf3; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #161b22; border: 1px solid #30363d; border-radius: 12px; overflow: hidden; }
  .header { background: #0d4429; padding: 32px 40px; text-align: center; }
  .header-logo { font-size: 22px; font-weight: 700; font-family: monospace; color: #fff; letter-spacing: 2px; }
  .header-logo span { color: #3fb950; }
  .receipt-badge { display: inline-block; margin-top: 12px; background: #3fb950; color: #0d1117; font-size: 11px; font-weight: 700; font-family: monospace; padding: 4px 16px; border-radius: 20px; letter-spacing: 1px; }
  .body { padding: 36px 40px; }
  .greeting { font-size: 16px; margin-bottom: 24px; color: #8b949e; }
  .amount-box { background: #0d4429; border: 1px solid #3fb950; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 28px; }
  .amount-label { font-size: 11px; font-family: monospace; color: #3fb950; text-transform: uppercase; letter-spacing: 1px; }
  .amount-value { font-size: 36px; font-weight: 700; font-family: monospace; color: #3fb950; margin: 6px 0 0; }
  .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  .detail-table tr { border-bottom: 1px solid #21262d; }
  .detail-table tr:last-child { border-bottom: none; }
  .detail-table td { padding: 12px 4px; font-size: 14px; }
  .detail-table td:first-child { color: #8b949e; width: 40%; font-family: monospace; font-size: 12px; text-transform: uppercase; }
  .detail-table td:last-child { color: #e6edf3; font-weight: 500; text-align: right; }
  .verified-box { background: #161b22; border: 1px solid #3fb950; border-radius: 8px; padding: 14px 20px; display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .check-icon { color: #3fb950; font-size: 20px; }
  .verified-text { font-size: 13px; color: #8b949e; }
  .verified-text strong { color: #3fb950; }
  .footer { background: #0d1117; padding: 20px 40px; border-top: 1px solid #21262d; text-align: center; }
  .footer p { font-size: 12px; color: #6e7681; margin: 4px 0; font-family: monospace; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-logo">MAVUNO<span>.HR</span></div>
    <div class="receipt-badge">✓ PAYMENT RECEIPT</div>
  </div>
  <div class="body">
    <p class="greeting">Dear ${orgName},<br>Your payment has been verified and a receipt has been generated.</p>
    <div class="amount-box">
      <div class="amount-label">Amount Paid</div>
      <div class="amount-value">${amountKes}</div>
    </div>
    <table class="detail-table">
      <tr><td>Receipt No.</td><td>${receiptNo}</td></tr>
      <tr><td>Company</td><td>${orgName}</td></tr>
      <tr><td>Plan</td><td>${plan}</td></tr>
      <tr><td>Billing Period</td><td>${period}</td></tr>
      <tr><td>Payment Method</td><td>${methodLabel[method] ?? method}</td></tr>
      ${reference ? `<tr><td>Reference</td><td style="font-family:monospace">${reference}</td></tr>` : ""}
      <tr><td>Verified On</td><td>${verifiedAt}</td></tr>
    </table>
    <div class="verified-box">
      <span class="check-icon">✓</span>
      <span class="verified-text">This is an official payment receipt from <strong>Mavuno HR</strong>. Please keep this for your records.</span>
    </div>
  </div>
  <div class="footer">
    <p>MAVUNO HR — Cloud Payroll & HR for Africa</p>
    <p>This email was sent automatically. Do not reply.</p>
  </div>
</div>
</body>
</html>`;

  const text = `MAVUNO HR — PAYMENT RECEIPT\n\nReceipt No: ${receiptNo}\nCompany: ${orgName}\nPlan: ${plan}\nPeriod: ${period}\nAmount: ${amountKes}\nMethod: ${methodLabel[method] ?? method}\n${reference ? `Reference: ${reference}\n` : ""}Verified: ${verifiedAt}\n\nThank you for your payment.`;

  await transporter.sendMail({
    from: FROM(),
    to,
    subject: `[Mavuno HR] Payment Receipt ${receiptNo} — ${period}`,
    html,
    text,
  });
  logger.info({ to, receiptNo }, "receipt email sent");
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  await transporter.sendMail({
    from: FROM(),
    to,
    subject: "Reset your Mavuno HR password",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Courier New',monospace;color:#e5e5e5">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#141414;border:1px solid #262626;border-radius:8px;overflow:hidden">
        <tr><td style="background:#0a0a0a;padding:28px 36px;border-bottom:1px solid #262626">
          <span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#e5e5e5">
            MAVUNO<span style="color:#22c55e">.HR</span>
          </span>
        </td></tr>
        <tr><td style="padding:36px">
          <p style="margin:0 0 16px;font-size:14px;color:#a3a3a3;text-transform:uppercase;letter-spacing:1px">PASSWORD RESET REQUEST</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#e5e5e5">
            Hi ${name},<br><br>
            We received a request to reset the password for your Mavuno HR account.
            Click the button below to choose a new password.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
            <tr><td style="background:#22c55e;border-radius:6px">
              <a href="${resetUrl}"
                 style="display:inline-block;padding:14px 32px;color:#0a0a0a;font-weight:bold;font-size:13px;letter-spacing:1px;text-decoration:none;font-family:'Courier New',monospace">
                RESET PASSWORD
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#737373">
            This link expires in <strong style="color:#e5e5e5">1 hour</strong>.
            If you did not request a password reset, you can safely ignore this email.
          </p>
          <p style="margin:0;font-size:12px;color:#525252;word-break:break-all">Or copy this URL: ${resetUrl}</p>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #262626">
          <p style="margin:0;font-size:11px;color:#525252">Mavuno HR — Kenya Payroll &amp; HR Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Hi ${name},\n\nReset your Mavuno HR password: ${resetUrl}\n\n— Mavuno HR`,
  });
  logger.info({ to }, "mailer: password reset email sent");
}

// ── Payslip email ─────────────────────────────────────────────────────────────

export async function sendPayslipEmail(opts: {
  to: string;
  empName: string;
  period: string;
  orgName: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const { to, empName, period, orgName, pdfBuffer } = opts;
  const firstName = empName.split(" ")[0];

  await transporter.sendMail({
    from: FROM(),
    to,
    subject: `Your Payslip — ${period} | ${orgName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">

        <!-- Header -->
        <tr><td style="background:#0f172a;padding:28px 36px">
          <span style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#fff;font-family:'Courier New',monospace">
            MAVUNO<span style="color:#22c55e">.HR</span>
          </span>
          <div style="margin-top:6px;font-size:11px;color:#94a3b8;letter-spacing:1px;font-family:'Courier New',monospace">
            ${orgName.toUpperCase()}
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
            <div style="font-size:12px;color:#16a34a;font-weight:bold;letter-spacing:1px;margin-bottom:4px">PAYSLIP READY</div>
            <div style="font-size:18px;font-weight:bold;color:#0f172a;font-family:'Courier New',monospace">${period}</div>
          </div>

          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">
            Hi ${firstName},<br><br>
            Your payslip for <strong>${period}</strong> is attached to this email as a PDF.
            Please find your earnings and deductions breakdown in the attached document.
          </p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin:20px 0;font-size:12px;color:#64748b">
            📎 Attachment: <strong style="color:#0f172a">${empName.replace(/ /g, "_")}_Payslip_${period}.pdf</strong>
          </div>

          <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;line-height:1.6">
            If you have any questions about your payslip, please contact your HR or payroll administrator.<br><br>
            — ${orgName} HR Team
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 36px;border-top:1px solid #f1f5f9;background:#f8fafc">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Mavuno HR — Kenya Payroll &amp; HR Platform &nbsp;|&nbsp;
            This is an automated email, please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Hi ${firstName},\n\nYour payslip for ${period} is attached.\n\n— ${orgName} HR Team`,
    attachments: [{
      filename: `${empName.replace(/ /g, "_")}_Payslip_${period}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  });
  logger.info({ to, period }, "mailer: payslip email sent");
}

// ── Statutory remittance confirmation ────────────────────────────────────────

export async function sendStatutoryRemittanceEmail(opts: {
  to: string;
  orgName: string;
  kind: "NSSF" | "SHIF" | "AHL";
  period: string;
  employeeCount: number;
  totalAmountKes: number; // cents
  filedAt: Date;
}): Promise<void> {
  const { to, orgName, kind, period, employeeCount, totalAmountKes, filedAt } = opts;

  const kindMeta: Record<"NSSF" | "SHIF" | "AHL", {
    label: string; actionUrl: string; actionLabel: string;
    accentColor: string; accentBg: string; accentBorder: string; portal: string;
  }> = {
    NSSF: {
      label: "NSSF (eCitizen)", actionUrl: "https://ecitizen.go.ke",
      actionLabel: "File on eCitizen →",
      accentColor: "#f59e0b", accentBg: "#fffbeb", accentBorder: "#fde68a",
      portal: "NSSF eCitizen portal",
    },
    SHIF: {
      label: "SHIF (SHA Portal)", actionUrl: "https://sha.go.ke",
      actionLabel: "File on SHA Portal →",
      accentColor: "#3b82f6", accentBg: "#eff6ff", accentBorder: "#bfdbfe",
      portal: "SHA portal",
    },
    AHL: {
      label: "AHL (KRA iTax)", actionUrl: "https://itax.kra.go.ke",
      actionLabel: "File on KRA iTax →",
      accentColor: "#8b5cf6", accentBg: "#f5f3ff", accentBorder: "#ddd6fe",
      portal: "KRA iTax portal",
    },
  };
  const { label, actionUrl, actionLabel, accentColor, accentBg, accentBorder, portal } = kindMeta[kind];

  const fmt = (cents: number) =>
    "KES " + (cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: Date) =>
    d.toLocaleString("en-KE", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Nairobi" });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">

        <!-- Header -->
        <tr><td style="background:#0f172a;padding:28px 36px">
          <span style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#fff;font-family:'Courier New',monospace">
            MAVUNO<span style="color:#22c55e">.HR</span>
          </span>
          <div style="margin-top:6px;font-size:11px;color:#94a3b8;letter-spacing:1px;font-family:'Courier New',monospace">
            ${orgName.toUpperCase()}
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px">

          <!-- Badge -->
          <div style="background:${accentBg};border:1px solid ${accentBorder};border-radius:8px;padding:16px 20px;margin-bottom:24px">
            <div style="font-size:11px;color:${accentColor};font-weight:bold;letter-spacing:1px;margin-bottom:4px;font-family:'Courier New',monospace">
              ${kind} REMITTANCE FILE DOWNLOADED
            </div>
            <div style="font-size:18px;font-weight:bold;color:#0f172a;font-family:'Courier New',monospace">${period}</div>
          </div>

          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">
            The <strong>${label}</strong> remittance file for <strong>${period}</strong> has been downloaded
            from Mavuno HR. Please upload this file to the ${portal} to complete the statutory filing.
          </p>

          <!-- Summary table -->
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
            <tr style="background:#f8fafc">
              <td style="padding:12px 16px;font-size:11px;color:#64748b;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0">Filing</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0">${label}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:11px;color:#64748b;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0">Period</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0">${period}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:12px 16px;font-size:11px;color:#64748b;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0">Employees</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0">${employeeCount}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:11px;color:#64748b;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0">Total Amount</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:700;color:${accentColor};border-bottom:1px solid #e2e8f0">${fmt(totalAmountKes)}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:12px 16px;font-size:11px;color:#64748b;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1px">Downloaded At</td>
              <td style="padding:12px 16px;font-size:13px;color:#475569">${fmtDate(filedAt)}</td>
            </tr>
          </table>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="background:${accentColor};border-radius:6px">
              <a href="${actionUrl}"
                 style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:bold;font-size:13px;letter-spacing:1px;text-decoration:none;font-family:'Courier New',monospace">
                ${actionLabel}
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">
            This email serves as an audit record that the ${kind} remittance file was generated.
            Please retain it until you have confirmed the upload on the government portal.<br><br>
            — ${orgName} Payroll System
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 36px;border-top:1px solid #f1f5f9;background:#f8fafc">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Mavuno HR — Kenya Payroll &amp; HR Platform &nbsp;|&nbsp;
            This is an automated email, please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `MAVUNO HR — ${kind} REMITTANCE CONFIRMATION`,
    ``,
    `Organisation: ${orgName}`,
    `Filing:       ${label}`,
    `Period:       ${period}`,
    `Employees:    ${employeeCount}`,
    `Total Amount: ${fmt(totalAmountKes)}`,
    `Downloaded:   ${fmtDate(filedAt)}`,
    ``,
    `Next step: upload the CSV file to ${actionUrl}`,
    ``,
    `This email is an audit record that the remittance file was generated.`,
    `— Mavuno HR`,
  ].join("\n");

  await transporter.sendMail({
    from: FROM(),
    to,
    subject: `[Mavuno HR] ${kind} Remittance File — ${period} | ${orgName}`,
    html,
    text,
  });
  logger.info({ to, kind, period }, "mailer: statutory remittance email sent");
}
