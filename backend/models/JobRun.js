const mongoose = require("mongoose");

// One row per scheduled job per calendar day (in India). It does two jobs:
//   1. the once-a-day guard: a second trigger the same day (cron-job.org AND the
//      GitHub backup, or a retry) finds the row and skips instead of running
//      everything again. The unique (job, day) index is what makes that safe.
//   2. the "last run" log shown in Settings, and the evidence the missed-run
//      watchdog checks (see services/jobRunService.js).
// Rows older than 120 days are removed by jobs/retentionJob.js.
const jobRunSchema = new mongoose.Schema(
  {
    job: { type: String, required: true },
    day: { type: String, required: true }, // "YYYY-MM-DD" in India
    status: { type: String, enum: ["running", "ok", "error", "skipped"], required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    attempts: { type: Number, default: 1 },
    summary: { type: String, default: "" }, // one line a person can read
    error: { type: String, default: "" },
    // What the job returned (counts, sizes), kept for the Settings screen.
    result: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

jobRunSchema.index({ job: 1, day: 1 }, { unique: true });
jobRunSchema.index({ startedAt: -1 });

module.exports = mongoose.model("JobRun", jobRunSchema);
