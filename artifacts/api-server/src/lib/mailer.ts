import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  const from = `"Zawadi HR" <${process.env.GMAIL_USER}>`;

  await transporter.sendMail({
    from,
    to,
    subject: "Reset your Zawadi HR password",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Courier New',monospace;color:#e5e5e5">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#141414;border:1px solid #262626;border-radius:8px;overflow:hidden">

          <!-- Header -->
          <tr>
            <td style="background:#0a0a0a;padding:28px 36px;border-bottom:1px solid #262626">
              <span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#e5e5e5">
                ZAWADI<span style="color:#22c55e">.HR</span>
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px">
              <p style="margin:0 0 16px;font-size:14px;color:#a3a3a3;text-transform:uppercase;letter-spacing:1px">
                PASSWORD RESET REQUEST
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#e5e5e5">
                Hi ${name},<br><br>
                We received a request to reset the password for your Zawadi HR account.
                Click the button below to choose a new password.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
                <tr>
                  <td style="background:#22c55e;border-radius:6px">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 32px;color:#0a0a0a;font-weight:bold;
                              font-size:13px;letter-spacing:1px;text-decoration:none;font-family:'Courier New',monospace">
                      RESET PASSWORD
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#737373">
                This link expires in <strong style="color:#e5e5e5">1 hour</strong>.
                If you did not request a password reset, you can safely ignore this email.
              </p>
              <p style="margin:0;font-size:12px;color:#525252;word-break:break-all">
                Or copy this URL: ${resetUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #262626">
              <p style="margin:0;font-size:11px;color:#525252">
                Zawadi HR &mdash; Kenya Payroll &amp; HR Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Hi ${name},\n\nReset your Zawadi HR password using this link (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\n— Zawadi HR`,
  });

  logger.info({ to }, "mailer: password reset email sent");
}
