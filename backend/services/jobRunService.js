const JobRun = require("../models/JobRun");
const { sendAlert } = require("../utils/alertWebhook");
const { istDay, istMinutesOfDay, addDays } = require("../utils/istDate");

/**
 * The nightly jobs, in the order they run. The watchdog expects every one of
 * them to have a row for each day.
 */
const NIGHTLY_JOBS = ["reconciliation", "reorder", "deadStock", "credit", "dailyReport", "backup", "retention"];

// A run that says "running" for longer than this crashed (the server restarted
// mid-run), so the next trigger may take it over instead of waiting forever.
const STALE_RUNNING_MS = 15 * 60 * 1000;

// The nightly run starts at 8 PM IST. If a day's jobs are still not all done by
// 9 PM, the run counts as missed and the owner is told once.
const NIGHTLY_DEADLINE_MINUTES = 21 * 60;

// Bookkeeping rows that are not jobs themselves.
const ALERT_MARKER = "missed-run-alert";
const WATCHDOG_START = "watchdog-start";

const MAX_RESULT_CHARS = 2000;

function isDuplicateKey(err) {
  return !!err && err.code === 11000;
}

function summarize(result) {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result.slice(0, 300);
  if (typeof result.summary === "string") return result.summary.slice(0, 300);
  if (result.reason) return String(result.reason).slice(0, 300);
  const flat = {};
  for (const [k, v] of Object.entries(result)) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) flat[k] = v;
  }
  return JSON.stringify(flat).slice(0, 300);
}

/** A copy of the result that is safe to store (plain JSON, bounded size). */
function storable(result) {
  try {
    const text = JSON.stringify(result === undefined ? null : result);
    return text.length > MAX_RESULT_CHARS ? { truncated: true } : JSON.parse(text);
  } catch (_) {
    return null;
  }
}

/**
 * Tries to become the one run of this job for this day. True means "go ahead".
 * False means it already ran today (status ok) or another run is going right now.
 * A failed, skipped or crashed earlier attempt can be taken over, so a retry later
 * the same night finishes the work instead of being blocked by the failed attempt.
 */
async function claimRun(job, day, now) {
  const existing = await JobRun.findOne({ job, day }).lean();
  if (!existing) {
    try {
      await JobRun.create({ job, day, status: "running", startedAt: now, attempts: 1 });
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false; // somebody else created today's row a moment ago
      throw err;
    }
  }
  if (existing.status === "ok") return false;
  if (existing.status === "running" && now.getTime() - new Date(existing.startedAt).getTime() < STALE_RUNNING_MS) {
    return false;
  }
  // Take over the failed / skipped / crashed attempt. The filter repeats what we
  // just read, so if two triggers race, only one of them changes the row.
  const res = await JobRun.updateOne(
    { _id: existing._id, status: existing.status, startedAt: existing.startedAt },
    { $set: { status: "running", startedAt: now, finishedAt: null, durationMs: null, error: "", summary: "" }, $inc: { attempts: 1 } }
  );
  return res.modifiedCount === 1;
}

async function forceClaim(job, day, now) {
  if (await claimRun(job, day, now)) return true;
  const res = await JobRun.updateOne(
    { job, day },
    { $set: { status: "running", startedAt: now, finishedAt: null, durationMs: null, error: "", summary: "" }, $inc: { attempts: 1 } }
  );
  return res.modifiedCount === 1;
}

async function finishRun(job, day, startedAt, status, result, error, summaryText) {
  const finishedAt = new Date();
  await JobRun.updateOne(
    { job, day },
    {
      $set: {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summary: status === "error" ? "" : summaryText || summarize(result),
        error: error || "",
        result: storable(result),
      },
    }
  );
}

/**
 * Runs `fn` for today's slot of `job`, recording what happened.
 *
 *   - Already ran fine today (or running right now)  ->  { ran: false }, fn is not called.
 *   - `force` runs it anyway (used for manual tests).
 *   - fn throws, or returns { ok: false }            ->  recorded as "error", so a later
 *     trigger the same day may try again and the watchdog can report it.
 *   - fn returns { skipped: true }                   ->  recorded as "skipped".
 *
 * `describe(result)` may turn a finished job's result into the one readable line
 * kept in the log ("3 owner(s) checked, 0 with drift"); without it a short JSON
 * summary of the result is kept.
 *
 * The log is best-effort: if the database can't record the run, fn still runs
 * (a missed backup is worse than a missing log line).
 */
async function runGuarded(job, fn, { force = false, now = new Date(), describe = null } = {}) {
  const day = istDay(now);
  const startedAt = new Date(now);

  let tracked = true;
  try {
    const go = force ? await forceClaim(job, day, startedAt) : await claimRun(job, day, startedAt);
    if (!go) return { ran: false, job, day };
  } catch (err) {
    tracked = false;
    console.error(`jobRunService: could not record the start of ${job}: ${err.message} - running it anyway.`);
  }

  let status = "ok";
  let result;
  let error = "";
  try {
    result = await fn();
    if (result && result.ok === false) {
      status = "error";
      error = String(result.error || "the job reported a failure").slice(0, 500);
    } else if (result && result.skipped) {
      status = "skipped";
    }
  } catch (err) {
    status = "error";
    error = String((err && err.message) || err).slice(0, 500);
    result = { error };
  }

  if (tracked) {
    let summaryText = "";
    if (status === "ok" && typeof describe === "function") {
      try {
        summaryText = String(describe(result || {}) || "").slice(0, 300);
      } catch (_) {
        /* a log line must never break the run */
      }
    }
    try {
      await finishRun(job, day, startedAt, status, result, error, summaryText);
    } catch (err) {
      console.error(`jobRunService: could not record the result of ${job}: ${err.message}`);
    }
  }
  return { ran: true, job, day, status, result, error };
}

/** The latest row for each job, newest first, for the Settings screen. */
async function lastRuns() {
  const rows = await JobRun.find({ job: { $in: NIGHTLY_JOBS } })
    .sort({ startedAt: -1 })
    .limit(200)
    .lean();
  const seen = new Set();
  const latest = [];
  for (const row of rows) {
    if (seen.has(row.job)) continue;
    seen.add(row.job);
    latest.push(row);
  }
  return latest;
}

/** The most recent run of a job that finished fine (status ok), or null. */
async function lastSuccess(job) {
  return JobRun.findOne({ job, status: "ok" }).sort({ startedAt: -1 }).lean();
}

function problemFor(row, now) {
  if (!row) return "did not run";
  if (row.status === "error") return row.error ? `failed (${String(row.error).slice(0, 100)})` : "failed";
  if (row.status === "running" && now.getTime() - new Date(row.startedAt).getTime() > STALE_RUNNING_MS) return "got stuck";
  return null;
}

/**
 * The missed-run watchdog. Looks at yesterday (always) and today (once it is
 * past 9 PM IST) and, if any nightly job has no row, failed, or got stuck,
 * sends ONE alert for that day. Skipped jobs are fine (those are deliberate
 * no-ops such as "Telegram not set up").
 *
 * It starts counting from the day it first ran, so deploying this update does
 * not raise a false alarm about days before it existed.
 */
async function checkMissedRuns({ now = new Date() } = {}) {
  const today = istDay(now);

  let start = await JobRun.findOne({ job: WATCHDOG_START }).lean();
  if (!start) {
    try {
      await JobRun.create({ job: WATCHDOG_START, day: today, status: "ok", startedAt: now, finishedAt: now });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    start = { day: today };
  }

  const days = [addDays(today, -1)];
  if (istMinutesOfDay(now) >= NIGHTLY_DEADLINE_MINUTES) days.push(today);

  const reported = [];
  for (const day of days) {
    if (day < start.day) continue;
    if (await JobRun.findOne({ job: ALERT_MARKER, day }).lean()) continue;

    const rows = await JobRun.find({ day, job: { $in: NIGHTLY_JOBS } }).lean();
    const byJob = new Map(rows.map((r) => [r.job, r]));
    const problems = [];
    for (const job of NIGHTLY_JOBS) {
      const why = problemFor(byJob.get(job), now);
      if (why) problems.push(`${job} ${why}`);
    }
    if (!problems.length) continue;

    // Mark the day first, so a crash between the two steps can never cause a repeat alert.
    try {
      await JobRun.create({ job: ALERT_MARKER, day, status: "ok", startedAt: now, finishedAt: now, summary: problems.join("; ").slice(0, 300) });
    } catch (err) {
      if (isDuplicateKey(err)) continue;
      throw err;
    }
    await sendAlert(
      `⚠️ SBT: the nightly jobs for ${day} did not all finish.\n${problems.join("\n")}\n` +
        `Check cron-job.org and the GitHub Actions tab, or run them again with POST /api/cron/run.`
    );
    reported.push({ day, problems });
  }
  return reported;
}

// Called from the health endpoint on every keep-alive ping. Throttled, never throws,
// and never makes the ping wait.
let lastCheckAt = 0;
const CHECK_EVERY_MS = 10 * 60 * 1000;

function maybeCheckMissedRuns({ now = new Date(), ready = true } = {}) {
  if (!ready) return;
  if (now.getTime() - lastCheckAt < CHECK_EVERY_MS) return;
  lastCheckAt = now.getTime();
  checkMissedRuns({ now }).catch((err) => console.error("jobRunService: missed-run check failed:", err.message));
}

function resetCheckThrottle() {
  lastCheckAt = 0;
}

module.exports = {
  NIGHTLY_JOBS,
  STALE_RUNNING_MS,
  NIGHTLY_DEADLINE_MINUTES,
  runGuarded,
  lastRuns,
  lastSuccess,
  checkMissedRuns,
  maybeCheckMissedRuns,
  resetCheckThrottle,
};
