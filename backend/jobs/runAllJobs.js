const { runReconciliationCheck } = require("./reconciliationJob");
const { runReorderCheck } = require("./reorderCheckJob");
const { runCreditCheck } = require("./creditCheckJob");
const { runDailyReport } = require("./dailyReportJob");
const { runBackupJob } = require("./backupJob");

/**
 * Single place that actually runs all five jobs in sequence. Shared by:
 *   - jobs/scheduler.js  (in-process node-cron, for local dev)
 *   - routes/cronRoutes.js -> POST /api/cron/run  (external trigger, for prod)
 * so there's exactly one implementation of "what a run consists of" no
 * matter which mechanism kicks it off.
 *
 * `running` is a simple in-memory overlap guard: if cron-job.org retries a
 * slow request (its default timeout is 30s) or the internal scheduler and
 * an external trigger land in the same minute, the second call is turned
 * into a no-op instead of running everything twice.
 */
let running = false;

async function runAllJobs() {
  if (running) {
    console.log("runAllJobs: a run is already in progress — skipping this trigger.");
    return { skipped: true, reason: "already running" };
  }

  running = true;
  const results = {};

  try {
    console.log("runAllJobs: consolidated run starting...");

    try {
      results.reconciliation = await runReconciliationCheck();
      console.log(
        `runAllJobs: reconciliation check done — ${results.reconciliation.checked} owner(s) checked, ${results.reconciliation.failed} with drift.`
      );
    } catch (err) {
      console.error("runAllJobs: reconciliation check crashed:", err.message);
      results.reconciliation = { error: err.message };
    }

    try {
      results.reorder = await runReorderCheck();
      console.log(
        `runAllJobs: reorder check done — ${results.reorder.checked} owner(s) checked, ${results.reorder.notified} new notification(s).`
      );
    } catch (err) {
      console.error("runAllJobs: reorder check crashed:", err.message);
      results.reorder = { error: err.message };
    }

    try {
      results.credit = await runCreditCheck();
      console.log(
        `runAllJobs: credit-risk check done — ${results.credit.checked} owner(s) checked, ${results.credit.notified} new notification(s).`
      );
    } catch (err) {
      console.error("runAllJobs: credit-risk check crashed:", err.message);
      results.credit = { error: err.message };
    }

    try {
      results.dailyReport = await runDailyReport();
      console.log(
        `runAllJobs: daily report done — ${results.dailyReport.checked} owner(s) checked, ${results.dailyReport.sent} sent.`
      );
    } catch (err) {
      console.error("runAllJobs: daily report crashed:", err.message);
      results.dailyReport = { error: err.message };
    }

    try {
      results.backup = await runBackupJob();
      console.log(
        `runAllJobs: backup job done — ${results.backup.skipped ? `skipped (${results.backup.reason})` : `sent (${results.backup.sizeBytes} bytes)`}.`
      );
    } catch (err) {
      console.error("runAllJobs: backup job crashed:", err.message);
      results.backup = { error: err.message };
    }

    console.log("runAllJobs: consolidated run finished.");
    return { skipped: false, results };
  } finally {
    running = false;
  }
}

module.exports = { runAllJobs };