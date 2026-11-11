const express = require("express");
const { requireCronSecret } = require("../middleware/cronAuth");
const { run } = require("../controllers/cronController");

const router = express.Router();

/**
 * POST /api/cron/run
 *
 * Meant to be called by an external scheduler (cron-job.org, with the GitHub
 * workflow as a backup) instead of relying on an in-process timer.
 * The HTTP request itself does double duty: it wakes the sleeping Render
 * free-tier instance AND triggers the job run — no timing gap between
 * "hopefully awake by now" and "cron fires" to worry about.
 *
 * Responds only after the run completes (unless ?async=1), so the scheduler's
 * execution log shows exactly what happened each night, and a non-200 status
 * shows up there as a visible failure instead of vanishing into server logs
 * only. Each job runs at most once a day (see jobs/runAllJobs.js), so a second
 * trigger the same day, such as the GitHub backup, is harmless.
 */
router.post(
  "/run",
  // Logged before auth on purpose: if a future run goes wrong again, this
  // line alone proves the request reached the app at all, regardless of
  // what happens afterward (auth failure, crash, or an aborted response
  // that never fires morgan's normal "finish"-based log line).
  (req, res, next) => {
    console.log(`cronRoutes: /run hit at ${new Date().toISOString()}`);
    next();
  },
  requireCronSecret,
  run
);

module.exports = router;
