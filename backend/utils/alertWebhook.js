/**
 * Fire-and-forget error alerting via a Discord/Slack-style webhook or a
 * Telegram bot — whichever the deployment has configured. Zero new
 * third-party accounts beyond whichever chat app you already use; no
 * dashboard, no stack-trace grouping, just an instant ping when something
 * breaks in production.
 *
 * Configure ONE of:
 *   DISCORD_WEBHOOK_URL   — a Discord channel webhook URL
 *   SLACK_WEBHOOK_URL     — a Slack incoming-webhook URL
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — a Telegram bot + the chat to post to
 * If none are set, this is a silent no-op — errors still get logged to
 * console/stdout as before, they just don't get pushed anywhere.
 */

const MIN_MS_BETWEEN_IDENTICAL_ALERTS = 5 * 60 * 1000; // 5 minutes
const lastSentAt = new Map(); // message -> timestamp, de-dupes repeat floods of the same error

function shouldSend(message) {
  const now = Date.now();
  const last = lastSentAt.get(message);
  if (last && now - last < MIN_MS_BETWEEN_IDENTICAL_ALERTS) return false;
  lastSentAt.set(message, now);
  return true;
}

function formatAlert({ message, method, path, status, userId }) {
  const lines = [
    `🚨 SBT backend error (${status || 500})`,
    `${method || "?"} ${path || "?"}${userId ? ` — user ${userId}` : ""}`,
    message,
  ];
  return lines.join("\n");
}

async function postJson(url, body) {
  // Node 18+ (this app's minimum engine) ships a global fetch — no extra
  // HTTP client dependency needed just for this.
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Call from the global error handler. Never throws — a broken alert path must not break the response. */
async function sendErrorAlert(details) {
  try {
    const text = formatAlert(details);
    if (!shouldSend(text)) return;

    const { DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

    if (DISCORD_WEBHOOK_URL) {
      await postJson(DISCORD_WEBHOOK_URL, { content: text.slice(0, 1900) }); // Discord's 2000-char message cap
    } else if (SLACK_WEBHOOK_URL) {
      await postJson(SLACK_WEBHOOK_URL, { text });
    } else if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await postJson(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text,
      });
    }
    // else: no alert channel configured — no-op.
  } catch (alertErr) {
    // Deliberately swallow: the alert mechanism failing must never mask or
    // replace the original error response to the client.
    console.error("alertWebhook: failed to send error alert:", alertErr.message);
  }
}

module.exports = { sendErrorAlert };
