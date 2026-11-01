// PIN rules + lockout timing in one place so the owner login, staff logins and
// the PIN-change/reset flows can't drift apart.
//
// New or changed PINs must be 4 to 6 digits. Logging in does NOT apply this
// check - anyone whose existing PIN predates the rule keeps working until they
// choose to change it.

const PIN_RE = /^\d{4,6}$/;

/** Returns a user-facing problem string, or null when the PIN is acceptable. */
function pinProblem(pin, label = "PIN") {
  if (pin === undefined || pin === null || pin === "") return `${label} is required`;
  if (typeof pin !== "string" && typeof pin !== "number") return `${label} must be 4 to 6 digits (numbers only)`;
  return PIN_RE.test(String(pin)) ? null : `${label} must be 4 to 6 digits (numbers only)`;
}

/** Text-ish input check - rejects objects/arrays so they never reach a DB query. */
function isText(v) {
  return typeof v === "string";
}

// Each repeat lockout inside 24h waits longer: 15 min, 1 h, 6 h, then 24 h.
const LOCK_STEPS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
const LOCKOUT_MEMORY_MS = 24 * 60 * 60 * 1000;

function lockDurationMs(lockoutCount) {
  const n = Math.max(1, Math.floor(Number(lockoutCount) || 1));
  return LOCK_STEPS_MS[Math.min(n, LOCK_STEPS_MS.length) - 1];
}

/** "15 minutes", "1 hour", "6 hours" - for the "try again in ..." message. */
function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Pure bookkeeping for one wrong PIN. `state` is { failedAttempts, lockoutCount,
 * lastLockoutAt }. Returns the new failedAttempts and, when this attempt trips
 * the lock, the new lockoutCount / lastLockoutAt / lockUntil. A repeat lockout
 * within 24h counts as the next step up the ladder; after a quiet day it starts
 * again at step one.
 */
function applyFailedAttempt(state, maxAttempts = 5, now = Date.now()) {
  const failedAttempts = ((state && state.failedAttempts) || 0) + 1;
  const previousCount = (state && state.lockoutCount) || 0;
  if (failedAttempts < maxAttempts) {
    return { failedAttempts, lockedNow: false, lockoutCount: previousCount };
  }
  const last = state && state.lastLockoutAt ? new Date(state.lastLockoutAt).getTime() : null;
  const recent = last !== null && now - last < LOCKOUT_MEMORY_MS;
  const lockoutCount = recent ? previousCount + 1 : 1;
  return {
    failedAttempts: 0,
    lockedNow: true,
    lockoutCount,
    lastLockoutAt: new Date(now),
    lockUntil: new Date(now + lockDurationMs(lockoutCount)),
  };
}

module.exports = { pinProblem, isText, lockDurationMs, formatWait, applyFailedAttempt, LOCKOUT_MEMORY_MS, LOCK_STEPS_MS };
