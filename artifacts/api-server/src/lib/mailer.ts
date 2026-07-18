import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const FROM = () => `"Zawadi HR" <${process.env.GMAIL_USER}>`;

// ── Password reset ────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  await transporter.sendMail({
    from: FROM(),
    to,
    subject: "Reset your Zawadi HR password",
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
            ZAWADI<span style="color:#22c55e">.HR</span>
          </span>
        </td></tr>
        <tr><td style="padding:36px">
          <p style="margin:0 0 16px;font-size:14px;color:#a3a3a3;text-transform:uppercase;letter-spacing:1px">PASSWORD RESET REQUEST</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#e5e5e5">
            Hi ${name},<br><br>
            We received a request to reset the password for your Zawadi HR account.
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
          <p style="margin:0;font-size:11px;color:#525252">Zawadi HR — Kenya Payroll &amp; HR Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Hi ${name},\n\nReset your Zawadi HR password: ${resetUrl}\n\n— Zawadi HR`,
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
            ZAWADI<span style="color:#22c55e">.HR</span>
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
            Zawadi HR — Kenya Payroll &amp; HR Platform &nbsp;|&nbsp;
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
