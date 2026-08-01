const nodemailer = require("nodemailer");

// Works with any standard SMTP provider (Gmail app password, Resend, SendGrid,
// Mailgun, etc. all speak SMTP) — set these in the environment:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
// If they're not set (e.g. local dev), we don't crash — we just log the
// email to the console so the flow is still testable without real SMTP creds.
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — would have sent to ${to}:\nSubject: ${subject}\n${text}`);
    return { devFallback: true };
  }
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  return t.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail };
