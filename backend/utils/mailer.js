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
    // Render's free tier has flaky/no IPv6 egress. Without this, Node's
    // default DNS resolution can hand nodemailer an IPv6 address for the
    // SMTP host, which then fails with ENETUNREACH or hangs until it
    // times out. Forcing IPv4 here avoids both failure modes.
    family: 4,
    connectionTimeout: 15000, // fail fast (15s) instead of hanging on a bad route
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transporter;
}

async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransporter();
  if (!t) {
    const attachNote = attachments?.length
      ? ` (with ${attachments.length} attachment(s): ${attachments.map((a) => a.filename).join(", ")})`
      : "";
    console.log(`[mailer] SMTP not configured — would have sent to ${to}${attachNote}:\nSubject: ${subject}\n${text}`);
    return { devFallback: true };
  }
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  return t.sendMail({ from, to, subject, text, html, attachments });
}

module.exports = { sendMail };
