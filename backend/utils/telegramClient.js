/**
 * Minimal Telegram Bot API client — send a text message with any bot
 * token / chat id pair.
 *
 * Deliberately generic and separate from alertWebhook.js: that file owns
 * the error-alert channel specifically (with its own de-dupe + multi-provider
 * fallback logic). This one is the plain building block any feature that
 * wants to post to a Telegram bot can call directly, so the report bot,
 * the future customer-photo bot, and the error bot can each use their own
 * token + chat id without duplicating the fetch/error-handling boilerplate
 * three times.
 *
 * Callers own their own env var names (e.g. TELEGRAM_REPORT_BOT_TOKEN) —
 * this file just wraps the two Bot API calls.
 */

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Sends a text message. Telegram caps messages at 4096 chars; longer text
 * is split into multiple sequential messages rather than silently truncated,
 * since a daily report is exactly the kind of message that could grow past
 * that limit as the business does.
 *
 * Returns true if every chunk sent successfully, false otherwise. Never
 * throws — callers (cron jobs, request handlers) shouldn't have a Telegram
 * outage take down anything else.
 */
async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return false;

  const chunks = splitMessage(text, 4096);
  for (const chunk of chunks) {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("telegramClient: sendMessage failed:", res.status, body);
        return false;
      }
    } catch (err) {
      console.error("telegramClient: sendMessage network error:", err.message);
      return false;
    }
  }
  return true;
}

/**
 * Sends a photo (Buffer) with an optional caption, via multipart/form-data.
 * Not used yet — added now so the customer-photo feature can call straight
 * into this without another round of Telegram-API plumbing later.
 */
async function sendTelegramPhoto(botToken, chatId, photoBuffer, caption, filename = "photo.jpg") {
  if (!botToken || !chatId) return false;

  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption.slice(0, 1024)); // Telegram caption cap
    form.append("photo", new Blob([photoBuffer]), filename);

    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("telegramClient: sendPhoto failed:", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("telegramClient: sendPhoto network error:", err.message);
    return false;
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > maxLen) {
    // break on the last newline before the limit so a line never gets cut mid-word
    let cut = rest.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

module.exports = { sendTelegramMessage, sendTelegramPhoto };