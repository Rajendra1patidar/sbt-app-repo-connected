const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const JobRun = require("../models/JobRun");

// How long things are kept. Everything older is removed by the nightly run, so
// the free database does not slowly fill up with history nobody opens.
const NOTIFICATION_DAYS = 90;
const AUDIT_LOG_YEARS = 3;
const JOB_RUN_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(now, days) {
  return new Date(now.getTime() - days * DAY_MS);
}

function yearsAgo(now, years) {
  const d = new Date(now.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

/**
 * Removes notifications older than 90 days, audit-log entries older than 3 years
 * and job-run log rows older than 120 days. Each cleanup is independent: if one
 * fails the others still run, and the job then reports the failure (so it shows
 * up in the last-run log and can be retried) instead of stopping at the first error.
 *
 * The audit log is otherwise never edited or deleted by the app; this is the one
 * place entries leave it, and only after three full years.
 */
async function runRetentionJob({ now = new Date() } = {}) {
  const steps = [
    ["notificationsRemoved", () => Notification.deleteMany({ createdAt: { $lt: daysAgo(now, NOTIFICATION_DAYS) } })],
    ["auditLogsRemoved", () => AuditLog.deleteMany({ createdAt: { $lt: yearsAgo(now, AUDIT_LOG_YEARS) } })],
    // The watchdog's start marker must outlive the log it guards.
    ["jobRunsRemoved", () => JobRun.deleteMany({ startedAt: { $lt: daysAgo(now, JOB_RUN_DAYS) }, job: { $ne: "watchdog-start" } })],
  ];

  const result = {};
  const errors = [];
  for (const [key, remove] of steps) {
    try {
      const res = await remove();
      result[key] = (res && res.deletedCount) || 0;
    } catch (err) {
      result[key] = 0;
      errors.push(`${key}: ${err.message}`);
      console.error(`retentionJob: ${key} failed:`, err.message);
    }
  }

  if (errors.length) return { ...result, ok: false, error: errors.join("; ") };
  return result;
}

module.exports = { runRetentionJob, NOTIFICATION_DAYS, AUDIT_LOG_YEARS, JOB_RUN_DAYS };
