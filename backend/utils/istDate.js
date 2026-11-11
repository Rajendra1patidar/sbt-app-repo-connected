// Calendar helpers in the business's own timezone (India), independent of the
// host's. Render's containers run in UTC, so "today", "Sunday" and "9 PM" must
// be worked out explicitly: at 8 PM IST it is already tomorrow's date in some
// UTC-based calculations only for part of the day, and that mismatch is exactly
// the kind of bug that makes a once-a-day guard fire twice or never.

const IST_TZ = "Asia/Kolkata";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, weekday: "short" });
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The calendar date in India for an instant, as "YYYY-MM-DD". */
function istDay(date = new Date()) {
  return dayFormat.format(date);
}

/** Day of the week in India: 0 = Sunday ... 6 = Saturday. */
function istWeekday(date = new Date()) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayFormat.format(date));
}

/** Minutes since midnight in India (0 to 1439). */
function istMinutesOfDay(date = new Date()) {
  const parts = clockFormat.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour * 60 + minute;
}

/** Moves a "YYYY-MM-DD" string by whole days (negative goes back). */
function addDays(day, delta) {
  const [y, m, d] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d));
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}

module.exports = { IST_TZ, istDay, istWeekday, istMinutesOfDay, addDays };
