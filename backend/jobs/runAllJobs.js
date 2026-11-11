const { runReconciliationCheck } = require("./reconciliationJob");
const { runReorderCheck } = require("./reorderCheckJob");
const { runDeadStockCheck } = require("./deadStockJob");
const { runCreditCheck } = require("./creditCheckJob");
const { runDailyReport } = require("./dailyReportJob");
const { runBackupJob } = require("./backupJob");
const { runRetentionJob } = require("./retentionJob");
const { runGuarded } = require("../services/jobRunService");

/**
 * The nightly jobs, in order. The order matters in one place: the backup runs
 * before the retention clean-up, so a backup always holds everything that
 * existed that night. Names here must match NIGHTLY_JOBS in
 * services/jobRunService.js (the watchdog checks each of them).
 *
 * `describe` is only for the log line.
 */
const JOBS = [
  {
    name: "reconciliation",
    run: () => runReconciliationCheck(),
    describe: (r) => `${r.checked} owner(s) checked, ${r.failed} with drift`,
  },
  {
    name: "reorder",
    run: () => runReorderCheck(),
    describe: (r) => `${r.checked} owner(s) checked, ${r.notified} new notification(s)`,
  },
  {
    name: "deadStock",
    run: () => runDeadStockCheck(),
    describe: (r) => `${r.checked} owner(s) checked, ${r.notified} new notification(s)`,
  },
  {
    name: "credit",
    run: () => runCreditCheck(),
    describe: (r) => `${r.checked} owner(s) checked, ${r.notified} new notification(s)`,
  },
  {
    name: "dailyReport",
    run: () => runDailyReport(),
    describe: (r) => `${r.checked} owner(s) checked, ${r.sent} sent`,
  },
  {
    name: "backup",
    run: (opts) => runBackupJob(opts),
    describe: (r) => (r.skipped ? `skipped (${r.reason})` : r.ok === false ? `FAILED (${r.error})` : r.summary || "done"),
  },
  {
    name: "retention",
    run: () => runRetentionJob(),
    describe: (r) =>
      r.ok === false
        ? `FAILED (${r.error})`
        : `removed ${r.notificationsRemoved} notification(s), ${r.auditLogsRemoved} audit entr(ies), ${r.jobRunsRemoved} old log row(s)`,
  },
];

const JOB_NAMES = JOBS.map((j) => j.name);

/**
 * Single place that runs the nightly jobs in sequence. Shared by:
 *   - jobs/scheduler.js  (in-process node-cron, for local dev)
 *   - routes/cronRoutes.js -> POST /api/cron/run  (external trigger, for prod)
 * so there is exactly one implementation of "what a run consists of".
 *
 * Two guards keep a job from running twice:
 *   - `running` (in memory): a second trigger that lands while a run is still
 *     going (a retry, or cron-job.org and GitHub in the same minute) does nothing.
 *   - the once-a-day guard (in the database, see services/jobRunService.js):
 *     a job that already finished fine today is skipped, even if a later trigger
 *     arrives hours afterwards or after the server restarted. A job that failed
 *     is NOT skipped, so a later trigger the same night can finish the work.
 *
 * Every job is isolated: one crashing never stops the ones after it.
 *
 * Options (all for manual use through /api/cron/run):
 *   force: run even the jobs that already ran today
 *   only:  array of job names to run (the others are left alone)
 */
let running = false;

async function runAllJobs({ force = false, only = null } = {}) {
  if (running) {
    console.log("runAllJobs: a run is already in progress - skipping this trigger.");
    return { skipped: true, reason: "already running" };
  }

  running = true;
  const results = {};

  try {
    console.log(`runAllJobs: consolidated run starting${force ? " (forced)" : ""}...`);

    for (const job of JOBS) {
      if (only && !only.includes(job.name)) continue;

      const outcome = await runGuarded(job.name, () => job.run({ force }), { force, describe: job.describe });
      if (!outcome.ran) {
        results[job.name] = { skipped: true, reason: "already ran today" };
        console.log(`runAllJobs: ${job.name} - already ran today, skipped.`);
        continue;
      }

      results[job.name] = outcome.result;
      const threw = outcome.status === "error" && !(outcome.result && outcome.result.ok === false);
      if (threw) {
        console.error(`runAllJobs: ${job.name} crashed: ${outcome.error}`);
      } else {
        let text = "done";
        try {
          text = job.describe(outcome.result || {});
        } catch (_) {
          /* a log line must never break the run */
        }
        console.log(`runAllJobs: ${job.name} done - ${text}.`);
      }
    }

    console.log("runAllJobs: consolidated run finished.");
    return { skipped: false, results };
  } finally {
    running = false;
  }
}

module.exports = { runAllJobs, JOB_NAMES };
