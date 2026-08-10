const express = require("express");
const { requireCronSecret } = require("../middleware/cronAuth");
const { runAllJobs } = require("../jobs/runAllJobs");

const router = express.Router();

/**
 * POST /api/cron/run
 *
 * Meant to be called by an external scheduler (cron-job.org) instead of
 * relying on the in-process node-cron timer + a separate wake-up ping.
 * The HTTP request itself does double duty: it wakes the sleeping Render
 * free-tier instance AND triggers the job run — no timing gap between
 * "hopefully awake by now" and "cron fires" to worry about.
 *
 * Responds only after the run completes, so cron-job.org's execution log
 * shows you exactly what happened each night (see results in the response
 * body / your cron-job.org history), and a non-200 status shows up there
 * as a visible failure instead of silently vanishing into server logs only.
 */
router.post("/run", requireCronSecret, async (req, res) => {
  try {
    const outcome = await runAllJobs();
    res.json({ status: "ok", ...outcome });
  } catch (err) {
    console.error("cronRoutes: /run crashed unexpectedly:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;