const { buildBackupArchive, MAX_GZIP_BYTES } = require("../utils/dbBackup");
const { sendMail } = require("../utils/mailer");
const { sendErrorAlert } = require("../utils/alertWebhook");

// Which days (in the business's own timezone, not the server's/UTC's) this
// actually sends on. Twice a week rather than nightly: often enough that
// worst-case data loss is capped at a few days, rare enough that it isn't
// inbox noise. Mon+Fri specifically brackets the work week — a Monday
// morning problem is caught by Friday's copy, and a Friday-through-weekend
// problem is caught by Monday's.
//
// Configurable (comma-separated day numbers, 0=Sunday..6=Saturday) rather
// than hardcoded, in case that spacing ever needs to change without a
// redeploy being the only way to do it.
const DEFAULT_BACKUP_DAYS = "1,5"; // Monday, Friday

function isScheduledDay() {
  const days = (process.env.BACKUP_DAYS_OF_WEEK || DEFAULT_BACKUP_DAYS)
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => !Number.isNaN(d));
  // en-CA + Asia/Kolkata gives a weekday reliably in the business's own
  // timezone regardless of what timezone the server/host is actually in
  // (Render's containers run in UTC) — matters here because "Monday" must
  // mean Monday in India, not Monday UTC, which can already be Tuesday
  // IST by the time this runs at 8pm.
  const todayIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
  const weekdayNum = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(todayIST);
  return days.includes(weekdayNum);
}

/**
 * Emails a full database backup twice a week (Monday and Friday by
 * default — see isScheduledDay) as a zipped JSON attachment.
 *
 * Atlas's free tier doesn't include automated backups, so this is the
 * offsite half of the safety net for the business's data: a separate,
 * independent copy from whatever local backup already runs on the
 * owner's own machine (e.g. a scheduled mongodump), on infrastructure
 * (Render + GitHub Actions) that doesn't depend on that machine being on
 * or online — different failure modes than a local-only backup, so the
 * same bad day can't take out both. See utils/dbBackup.js for what's in
 * the dump.
 *
 * Uses its own recipient env var (BACKUP_EMAIL_TO) but reuses the SMTP_*
 * transport already configured in utils/mailer.js — same convention as
 * dailyReportJob's separate Telegram bot: "here's tonight's numbers" and
 * "here's a copy of the whole database" are different enough concerns to
 * be able to point at different addresses/inboxes if needed, but shouldn't
 * need a second SMTP account set up just for this.
 *
 * If BACKUP_EMAIL_TO isn't set, this is a silent no-op (same as
 * dailyReportJob when its Telegram vars are missing) so a dev/staging
 * deployment doesn't start emailing anyone by default.
 */
async function runBackupJob() {
  const to = process.env.BACKUP_EMAIL_TO;
  if (!to) {
    console.log("backupJob: BACKUP_EMAIL_TO not set — skipping.");
    return { skipped: true, reason: "BACKUP_EMAIL_TO not set" };
  }

  if (!isScheduledDay()) {
    console.log("backupJob: not a scheduled backup day — skipping.");
    return { skipped: true, reason: "not a scheduled backup day" };
  }

  const archive = await buildBackupArchive();
  const totalDocs = archive.summary.reduce((sum, c) => sum + c.count, 0);
  const dateLabel = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const sizeKb = Math.round(archive.sizeBytes / 1024);

  if (archive.tooLarge) {
    const message = `backupJob: backup is ${sizeKb}KB, over the ${Math.round(
      MAX_GZIP_BYTES / 1024 / 1024
    )}MB email-attachment guardrail — not sending. Move to a non-email backup transport.`;
    console.error(message);
    await sendErrorAlert({ message, path: "jobs/backupJob", status: 500 });
    return { skipped: true, reason: "backup too large for email", sizeBytes: archive.sizeBytes };
  }

  const collectionLines = archive.summary
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((c) => `  ${c.name}: ${c.count}`)
    .join("\n");

  const text = [
    `SBT database backup — ${dateLabel}`,
    "",
    `${totalDocs} document(s) across ${archive.summary.length} collection(s), ${sizeKb}KB gzipped.`,
    "",
    "Documents per collection:",
    collectionLines,
    "",
    "This is a raw export, not a restorable script — to restore, unzip and",
    "load each collection's array back into MongoDB (e.g. mongoimport per",
    "collection, or a small one-off script).",
  ].join("\n");

  try {
    await sendMail({
      to,
      subject: `SBT Backup — ${dateLabel}`,
      text,
      attachments: [
        {
          filename: archive.filename,
          content: archive.buffer,
          contentType: "application/zip",
        },
      ],
    });
    console.log(`backupJob: backup emailed to ${to} (${sizeKb}KB, ${totalDocs} docs).`);
    return { skipped: false, sent: true, sizeBytes: archive.sizeBytes, totalDocs };
  } catch (err) {
    console.error("backupJob: failed to send backup email:", err.message);
    await sendErrorAlert({ message: `backupJob: failed to send backup email: ${err.message}`, path: "jobs/backupJob", status: 500 });
    return { skipped: false, sent: false, error: err.message };
  }
}

module.exports = { runBackupJob, isScheduledDay };
