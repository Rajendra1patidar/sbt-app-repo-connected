const { buildEncryptedBackup, wrapForEmail, MAX_TELEGRAM_BYTES, MAX_EMAIL_BYTES } = require("../utils/dbBackup");
const { getPassphrase, passphraseProblem } = require("../utils/backupCrypto");
const { sendTelegramDocument } = require("../utils/telegramClient");
const { sendMail } = require("../utils/mailer");
const { sendAlert } = require("../utils/alertWebhook");
const { istWeekday, IST_TZ } = require("../utils/istDate");

// The weekly email copy goes out on these days (India time; 0 = Sunday ... 6 = Saturday).
// Same variable the old twice-a-week email used, so an existing setting still works.
const DEFAULT_EMAIL_DAYS = "0"; // Sunday
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function emailDays() {
  const days = (process.env.BACKUP_DAYS_OF_WEEK || DEFAULT_EMAIL_DAYS)
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? days : [0];
}

function isEmailDay(now = new Date()) {
  return emailDays().includes(istWeekday(now));
}

/** The bot and chat the backup goes to: the daily-report chat, else the alert chat. */
function telegramTarget() {
  const { TELEGRAM_REPORT_BOT_TOKEN, TELEGRAM_REPORT_CHAT_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (TELEGRAM_REPORT_BOT_TOKEN && TELEGRAM_REPORT_CHAT_ID) {
    return { botToken: TELEGRAM_REPORT_BOT_TOKEN, chatId: TELEGRAM_REPORT_CHAT_ID };
  }
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) return { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
  return null;
}

/** Where backups will go, for the Settings screen. */
function describeDestinations() {
  return {
    telegram: !!telegramTarget(),
    email: !!process.env.BACKUP_EMAIL_TO,
    emailDays: emailDays().map((d) => DAY_NAMES[d]),
  };
}

function fmtCount(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function emailText({ label, backup, sizeKb }) {
  const lines = backup.summary
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((c) => `  ${c.name}: ${fmtCount(c.count)}`)
    .join("\n");
  return [
    `SBT database backup - ${label}`,
    "",
    `${fmtCount(backup.totalDocs)} record(s) across ${backup.summary.length} collection(s), ${fmtCount(sizeKb)} KB, encrypted.`,
    "",
    "Records per collection:",
    lines,
    "",
    "The attachment is encrypted. You need the BACKUP_PASSPHRASE that is set on Render to open it.",
    "Unzip the attachment to get the .sbtbackup file, then follow BACKUPS.md in the repo",
    "(node scripts/restoreBackup.js <file>).",
  ].join("\n");
}

/**
 * Makes one encrypted copy of the whole database and sends it out:
 *   - to the Telegram chat, every night;
 *   - by email, once a week (Sunday by default), and also whenever Telegram
 *     could not take it, so one outage never leaves a night without an offsite copy.
 *
 * Fails closed: with no BACKUP_PASSPHRASE nothing is sent, because an unencrypted
 * copy of customer and money data must never sit in a chat or an inbox. That is
 * reported loudly (alert + a red entry in the last-run log) instead of quietly skipped.
 *
 * `force` is for manual tests: it sends the email copy today even if it is not
 * the weekly day.
 */
async function runBackupJob({ force = false, now = new Date() } = {}) {
  const passphrase = getPassphrase();
  const problem = passphraseProblem(passphrase);
  if (problem) {
    console.error(`backupJob: ${problem} - no backup was made.`);
    await sendAlert(`🔐 SBT backups are OFF: ${problem}. Set BACKUP_PASSPHRASE on Render (Environment tab) and redeploy.`);
    return { ok: false, error: problem };
  }

  const telegram = telegramTarget();
  const emailTo = process.env.BACKUP_EMAIL_TO || "";
  const emailDue = !!emailTo && (force || isEmailDay(now));

  if (!telegram && !emailTo) {
    const error = "no place to send backups: set up Telegram (TELEGRAM_REPORT_BOT_TOKEN and TELEGRAM_REPORT_CHAT_ID) or BACKUP_EMAIL_TO";
    console.error(`backupJob: ${error}`);
    await sendAlert(`🔐 SBT backups are OFF: ${error}.`);
    return { ok: false, error };
  }
  if (!telegram && !emailDue) {
    return { skipped: true, reason: "Telegram is not set up and the weekly email is not due today" };
  }

  let backup;
  try {
    backup = await buildEncryptedBackup(passphrase);
  } catch (err) {
    console.error("backupJob: could not build the backup:", err.message);
    await sendAlert(`🔐 SBT backup FAILED: could not read the database (${err.message}).`);
    return { ok: false, error: `could not build the backup: ${err.message}` };
  }

  const sizeKb = Math.max(1, Math.round(backup.sizeBytes / 1024));
  const label = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST_TZ });
  const delivered = [];
  const problems = [];

  if (telegram) {
    if (backup.sizeBytes > MAX_TELEGRAM_BYTES) {
      problems.push("Telegram: the backup is over Telegram's 50 MB limit");
    } else {
      const caption = [
        `🔐 SBT backup - ${label}`,
        `${fmtCount(backup.totalDocs)} records, ${fmtCount(sizeKb)} KB, encrypted.`,
        "Needs your BACKUP_PASSPHRASE to open (see BACKUPS.md).",
      ].join("\n");
      const sent = await sendTelegramDocument(telegram.botToken, telegram.chatId, backup.buffer, backup.filename, caption);
      if (sent.ok) delivered.push("telegram");
      else problems.push(`Telegram: ${sent.error || "send failed"}`);
    }
  }

  const telegramMissed = !!telegram && !delivered.includes("telegram");
  if (emailTo && (emailDue || telegramMissed)) {
    const wrapped = wrapForEmail(backup);
    if (wrapped.buffer.length > MAX_EMAIL_BYTES) {
      problems.push("Email: the backup is too large to send by email");
    } else {
      try {
        await sendMail({
          to: emailTo,
          subject: `SBT Backup - ${label}`,
          text: emailText({ label, backup, sizeKb }),
          attachments: [{ filename: wrapped.filename, content: wrapped.buffer, contentType: "application/zip" }],
        });
        delivered.push("email");
      } catch (err) {
        problems.push(`Email: ${err.message}`);
      }
    }
  }

  const base = { sizeBytes: backup.sizeBytes, totalDocs: backup.totalDocs, delivered, file: backup.filename };

  if (problems.length) {
    console.error("backupJob:", problems.join("; "));
    await sendAlert(
      `🔐 SBT backup problem (${label}):\n${problems.join("\n")}\n` +
        (delivered.length ? `It was still delivered by ${delivered.join(" and ")}.` : "The backup was NOT delivered anywhere.")
    );
  }
  if (!delivered.length) return { ...base, ok: false, error: problems.join("; ") };

  console.log(`backupJob: backup delivered by ${delivered.join(" + ")} (${sizeKb} KB, ${backup.totalDocs} records).`);
  return {
    ...base,
    summary: `Sent by ${delivered.join(" + ")}, ${fmtCount(sizeKb)} KB, ${fmtCount(backup.totalDocs)} records`,
    ...(problems.length ? { warnings: problems } : {}),
  };
}

module.exports = { runBackupJob, isEmailDay, emailDays, describeDestinations, telegramTarget };
