/**
 * Stores vendor invoice photos in the daily-report bot's Telegram chat,
 * instead of a paid/card-gated image host. Reuses the existing report bot
 * (TELEGRAM_REPORT_BOT_TOKEN / TELEGRAM_REPORT_CHAT_ID — see
 * jobs/dailyReportJob.js) rather than standing up a third bot: invoice
 * photos just interleave with the daily report messages in that same chat.
 *
 * If you'd rather keep them separate later, set INVOICE_TELEGRAM_BOT_TOKEN /
 * INVOICE_TELEGRAM_CHAT_ID to a different bot+chat and this file will use
 * those instead — see the env lookup below.
 *
 * IMPORTANT: the bot token must never reach the browser. Reads go through
 * getTelegramFileBuffer() (backend-only) and get proxied to the client by
 * our own authenticated API route — the frontend never talks to Telegram.
 */

const { sendTelegramPhoto, getTelegramFileBuffer, deleteTelegramMessage } = require("../utils/telegramClient");

function credentials() {
  const botToken = process.env.INVOICE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.INVOICE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_REPORT_CHAT_ID;
  return { botToken, chatId };
}

function assertConfigured({ botToken, chatId }) {
  if (!botToken || !chatId) {
    const err = new Error("Invoice photo storage isn't configured yet — set TELEGRAM_REPORT_BOT_TOKEN and TELEGRAM_REPORT_CHAT_ID on the server (the same bot the daily report uses).");
    err.status = 500;
    throw err;
  }
}

/** Uploads a photo, returning enough to fetch it again later (fileId) and to clean it up later (messageId). */
async function uploadFile(buffer, filename) {
  const creds = credentials();
  assertConfigured(creds);

  const result = await sendTelegramPhoto(creds.botToken, creds.chatId, buffer, "Invoice photo", filename);
  if (!result.ok) throw new Error("Telegram upload failed");
  return { fileId: result.fileId, messageId: result.messageId };
}

/** Downloads a previously-uploaded file's bytes, for the backend to proxy to the browser. */
async function downloadFile(fileId) {
  const creds = credentials();
  assertConfigured(creds);

  const buffer = await getTelegramFileBuffer(creds.botToken, fileId);
  if (!buffer) throw new Error("Invoice photo is no longer available");
  return buffer;
}

/** Best-effort cleanup when a photo is replaced or removed — see deleteTelegramMessage. */
function deleteFile(messageId) {
  const { botToken, chatId } = credentials();
  return deleteTelegramMessage(botToken, chatId, messageId);
}

module.exports = { uploadFile, downloadFile, deleteFile };
