const cron = require("node-cron");
const { runAllJobs } = require("./runAllJobs");

/**
 * In production this is superseded by POST /api/cron/run (see
 * routes/cronRoutes.js) — cron-job.org calls that endpoint directly, and
 * the HTTP request both wakes the Render free-tier instance and triggers
 * the run in one step, with no dependency on this in-process timer ever
 * actually being alive at the right moment.
 *
 * Kept here purely as an opt-in convenience for local development, where
 * there's no sleep/wake problem and it's still useful to have jobs fire on
 * a schedule while the server happens to be running. OFF by default in
 * every environment — set ENABLE_INTERNAL_SCHEDULER=true to turn it on.
 *
 * Both this and the external trigger call the exact same runAllJobs(), so
 * there's only one implementation of "what a run does" — see
 * jobs/runAllJobs.js for the actual job logic and the overlap guard that
 * keeps the two mechanisms from double-running if they ever coincide.
 */
function start() {
  if (process.env.ENABLE_INTERNAL_SCHEDULER !== "true") {
    console.log("scheduler: internal cron disabled (ENABLE_INTERNAL_SCHEDULER not set) — using external trigger only.");
    return;
  }

  const allJobsSchedule = process.env.ALL_JOBS_CRON || "0 20 * * *"; // 8 PM IST

  cron.schedule(
    allJobsSchedule,
    async () => {
      await runAllJobs();
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log(`scheduler: internal cron enabled (${allJobsSchedule}, Asia/Kolkata) — dev/local use only.`);
}

module.exports = { start };