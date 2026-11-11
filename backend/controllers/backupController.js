const { buildEncryptedBackup } = require("../utils/dbBackup");
const { getPassphrase, passphraseProblem } = require("../utils/backupCrypto");
const { lastRuns, lastSuccess } = require("../services/jobRunService");
const { describeDestinations } = require("../jobs/backupJob");

// Owner-only (mounted behind requireOwner in server.js): a backup holds every
// customer, price and payment in the business.

// GET /api/backup/download
// Builds the same encrypted file the nightly job sends to Telegram and hands it
// to the browser. Open it with scripts/restoreBackup.js and BACKUP_PASSPHRASE.
exports.download = async (req, res, next) => {
  try {
    const passphrase = getPassphrase();
    const problem = passphraseProblem(passphrase);
    if (problem) {
      return res.status(400).json({
        message: `Backups are not set up yet: ${problem}. Add it on Render (Environment tab), redeploy, then try again.`,
      });
    }
    const backup = await buildEncryptedBackup(passphrase);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${backup.filename}"`);
    res.setHeader("Content-Length", String(backup.sizeBytes));
    res.setHeader("Cache-Control", "no-store");
    res.send(backup.buffer);
  } catch (err) {
    next(err);
  }
};

function pick(row) {
  if (!row) return null;
  return {
    job: row.job,
    day: row.day,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    summary: row.summary || "",
    error: row.error || "",
  };
}

// GET /api/backup/status
// What the Settings screen shows: whether backups are set up, where they go,
// when the last good one happened, and the latest run of every nightly job.
exports.status = async (req, res, next) => {
  try {
    const problem = passphraseProblem(getPassphrase());
    const [runs, good] = await Promise.all([lastRuns(), lastSuccess("backup")]);
    const lastBackupAttempt = runs.find((r) => r.job === "backup");
    res.json({
      ready: !problem,
      problem: problem || null,
      destinations: describeDestinations(),
      lastGoodBackup: good
        ? {
            at: good.finishedAt || good.startedAt,
            day: good.day,
            summary: good.summary || "",
            sizeBytes: (good.result && good.result.sizeBytes) || null,
            totalDocs: (good.result && good.result.totalDocs) || null,
            delivered: (good.result && good.result.delivered) || [],
          }
        : null,
      lastBackupAttempt: pick(lastBackupAttempt),
      jobs: runs.map(pick),
    });
  } catch (err) {
    next(err);
  }
};
