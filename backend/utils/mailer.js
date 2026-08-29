// Uses Brevo's transactional email HTTP API instead of SMTP.
//
// Why: Render's free web services block outbound traffic on SMTP ports
// (25, 465, 587) as of Sept 2025 — see
// https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
// So a normal nodemailer+SMTP setup just times out on Render's free tier no
// matter how correct the SMTP host/user/pass are (this bit us — see the
// "Connection timeout" errors from both the backup job and the PIN-reset
// flow). Brevo's HTTP API sends over plain HTTPS (port 443), which isn't
// blocked, so this works on Render's free plan without needing to upgrade
// to a paid instance just for email.
//
// Needs one env var: BREVO_API_KEY (from Brevo → Settings → SMTP & API →
// API Keys tab — a different key than the SMTP key used before; generate a
// new one there) and EMAIL_FROM (must be a verified sender in Brevo).
// If BREVO_API_KEY isn't set (e.g. local dev), we don't crash — we just log
// the email to the console so the flow is still testable without real creds.

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendMail({ to, subject, text, html, attachments }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    const attachNote = attachments?.length
      ? ` (with ${attachments.length} attachment(s): ${attachments.map((a) => a.filename).join(", ")})`
      : "";
    console.log(`[mailer] BREVO_API_KEY not set — would have sent to ${to}${attachNote}:\nSubject: ${subject}\n${text}`);
    return { devFallback: true };
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error("[mailer] EMAIL_FROM is not set — cannot send without a verified sender address.");
    throw new Error("EMAIL_FROM is not configured");
  }

  const body = {
    sender: { email: from },
    to: [{ email: to }],
    subject,
    // Brevo requires at least htmlContent OR textContent — send both when
    // we have them, since not every caller in this codebase builds HTML.
    ...(html ? { htmlContent: html } : {}),
    textContent: text || (html ? undefined : " "),
    ...(attachments?.length
      ? {
          attachment: attachments.map((a) => ({
            name: a.filename,
            // nodemailer-style callers pass a Buffer in `content` — Brevo's
            // API wants base64 text instead. Accept either shape so nothing
            // upstream (backupJob.js's gzip buffer) needs to change.
            content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
          })),
        }
      : {}),
  };

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.message || JSON.stringify(errBody);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Brevo API error (${res.status}): ${detail || "unknown error"}`);
  }

  return res.json().catch(() => ({}));
}

module.exports = { sendMail };
