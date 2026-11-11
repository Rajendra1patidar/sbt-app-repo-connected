/**
 * Tests for the once-a-day guard, the last-run log and the missed-run watchdog.
 * JobRun is replaced by a small in-memory table that behaves like the real
 * collection for the few operations the service uses (including the unique
 * job+day rule that the guard relies on).
 */

jest.mock("../../models/JobRun", () => {
  const rows = [];
  let nextId = 1;
  const state = { failFindOne: false };

  const isDate = (v) => v instanceof Date;
  const matchValue = (actual, expected) => {
    if (expected && typeof expected === "object" && !isDate(expected)) {
      if ("$in" in expected) return expected.$in.includes(actual);
      if ("$ne" in expected) return actual !== expected.$ne;
    }
    if (isDate(expected)) return isDate(actual) && actual.getTime() === expected.getTime();
    return actual === expected;
  };
  const matches = (row, filter) => Object.entries(filter).every(([k, v]) => matchValue(row[k], v));

  // a result that can be awaited directly or refined with .sort().limit().lean()
  const query = (list, single) => {
    let current = list;
    const q = {
      sort(spec) {
        const [[key, dir]] = Object.entries(spec);
        current = [...current].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
        return q;
      },
      limit(n) {
        current = current.slice(0, n);
        return q;
      },
      lean() {
        return q;
      },
      then(resolve, reject) {
        const out = current.map((r) => ({ ...r }));
        return Promise.resolve(single ? out[0] || null : out).then(resolve, reject);
      },
    };
    return q;
  };

  return {
    __rows: rows,
    __state: state,
    __reset() {
      rows.length = 0;
      nextId = 1;
      state.failFindOne = false;
    },
    findOne: (filter) => {
      if (state.failFindOne) throw new Error("database is down");
      return query(rows.filter((r) => matches(r, filter)), true);
    },
    find: (filter) => query(rows.filter((r) => matches(r, filter)), false),
    create: async (doc) => {
      if (rows.some((r) => r.job === doc.job && r.day === doc.day)) {
        const err = new Error("E11000 duplicate key");
        err.code = 11000;
        throw err;
      }
      const row = { _id: nextId++, attempts: 1, summary: "", error: "", result: null, finishedAt: null, durationMs: null, ...doc };
      rows.push(row);
      return row;
    },
    updateOne: async (filter, update) => {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set || {});
      for (const [k, v] of Object.entries(update.$inc || {})) row[k] = (row[k] || 0) + v;
      return { modifiedCount: 1 };
    },
  };
});
jest.mock("../../utils/alertWebhook", () => ({
  sendAlert: jest.fn(async () => {}),
  sendErrorAlert: jest.fn(async () => {}),
}));

const fs = require("fs");
const path = require("path");
const JobRun = require("../../models/JobRun");
const { sendAlert } = require("../../utils/alertWebhook");
const {
  NIGHTLY_JOBS,
  STALE_RUNNING_MS,
  runGuarded,
  lastRuns,
  lastSuccess,
  checkMissedRuns,
  maybeCheckMissedRuns,
  resetCheckThrottle,
} = require("../../services/jobRunService");

// 14:30 UTC = 20:00 IST, the nightly run time
const EIGHT_PM_THURSDAY = new Date("2026-11-05T14:30:00Z");
const EIGHT_PM_FRIDAY = new Date("2026-11-06T14:30:00Z");
// 15:45 UTC = 21:15 IST, after the 9 PM deadline
const NINE_QUARTER_PM_THURSDAY = new Date("2026-11-05T15:45:00Z");
const NINE_QUARTER_PM_FRIDAY = new Date("2026-11-06T15:45:00Z");

beforeAll(() => {
  // the code under test logs what it does; keep the test output readable
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};

function seedAllOk(day, now) {
  for (const job of NIGHTLY_JOBS) {
    JobRun.__rows.push({ _id: `seed-${job}-${day}`, job, day, status: "ok", startedAt: now, finishedAt: now, attempts: 1 });
  }
}

beforeEach(() => {
  JobRun.__reset();
  jest.clearAllMocks();
  resetCheckThrottle();
});

describe("runGuarded: once-a-day guard", () => {
  test("runs the job the first time and records what happened", async () => {
    const fn = jest.fn().mockResolvedValue({ checked: 2, failed: 0 });

    const outcome = await runGuarded("reconciliation", fn, { now: EIGHT_PM_THURSDAY });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual(expect.objectContaining({ ran: true, status: "ok", day: "2026-11-05" }));
    expect(JobRun.__rows).toHaveLength(1);
    expect(JobRun.__rows[0]).toEqual(
      expect.objectContaining({ job: "reconciliation", day: "2026-11-05", status: "ok", attempts: 1, result: { checked: 2, failed: 0 } })
    );
    expect(JobRun.__rows[0].summary).toContain('"checked":2');
    expect(JobRun.__rows[0].finishedAt).toBeTruthy();
  });

  test("a second trigger the same day does not run it again", async () => {
    const fn = jest.fn().mockResolvedValue({ checked: 1 });
    await runGuarded("reorder", fn, { now: EIGHT_PM_THURSDAY });

    const again = await runGuarded("reorder", fn, { now: new Date("2026-11-05T16:00:00Z") });

    expect(again.ran).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JobRun.__rows).toHaveLength(1);
  });

  test("the next day it runs again", async () => {
    const fn = jest.fn().mockResolvedValue({});
    await runGuarded("reorder", fn, { now: EIGHT_PM_THURSDAY });
    await runGuarded("reorder", fn, { now: EIGHT_PM_FRIDAY });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(JobRun.__rows.map((r) => r.day)).toEqual(["2026-11-05", "2026-11-06"]);
  });

  test("two triggers at the same moment run the job only once", async () => {
    const fn = jest.fn().mockResolvedValue({ checked: 1 });

    const [a, b] = await Promise.all([
      runGuarded("backup", fn, { now: EIGHT_PM_THURSDAY }),
      runGuarded("backup", fn, { now: EIGHT_PM_THURSDAY }),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect([a.ran, b.ran].sort()).toEqual([false, true]);
  });

  test("the day is the day in India: a run just after 5:30 AM UTC belongs to the Indian date", async () => {
    const fn = jest.fn().mockResolvedValue({});
    await runGuarded("credit", fn, { now: new Date("2026-11-05T19:00:00Z") }); // 00:30 IST on the 6th
    expect(JobRun.__rows[0].day).toBe("2026-11-06");
  });
});

describe("runGuarded: failures", () => {
  test("a job that throws is recorded as an error, and a later trigger the same day tries again", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("Telegram exploded"));
    const first = await runGuarded("dailyReport", failing, { now: EIGHT_PM_THURSDAY });

    expect(first.status).toBe("error");
    expect(JobRun.__rows[0].status).toBe("error");
    expect(JobRun.__rows[0].error).toContain("Telegram exploded");

    const working = jest.fn().mockResolvedValue({ checked: 1, sent: 1 });
    const second = await runGuarded("dailyReport", working, { now: new Date("2026-11-05T15:00:00Z") });

    expect(second.ran).toBe(true);
    expect(working).toHaveBeenCalledTimes(1);
    expect(JobRun.__rows).toHaveLength(1);
    expect(JobRun.__rows[0]).toEqual(expect.objectContaining({ status: "ok", attempts: 2, error: "" }));
  });

  test("a job that reports { ok: false } counts as failed, not done", async () => {
    const fn = jest.fn().mockResolvedValue({ ok: false, error: "no backup destination" });
    const outcome = await runGuarded("backup", fn, { now: EIGHT_PM_THURSDAY });

    expect(outcome.status).toBe("error");
    expect(JobRun.__rows[0].error).toBe("no backup destination");
    expect(JobRun.__rows[0].status).toBe("error");
  });

  test("a job that skips itself is recorded as skipped and may run again later", async () => {
    const skipping = jest.fn().mockResolvedValue({ skipped: true, reason: "Telegram is not set up" });
    await runGuarded("dailyReport", skipping, { now: EIGHT_PM_THURSDAY });

    expect(JobRun.__rows[0].status).toBe("skipped");
    expect(JobRun.__rows[0].summary).toBe("Telegram is not set up");

    const later = jest.fn().mockResolvedValue({ checked: 1 });
    await runGuarded("dailyReport", later, { now: new Date("2026-11-05T16:00:00Z") });
    expect(later).toHaveBeenCalledTimes(1);
  });

  test("a job's own one-line summary is used when it gives one", async () => {
    const fn = jest.fn().mockResolvedValue({ sizeBytes: 5, summary: "Sent by telegram, 412 KB" });
    await runGuarded("backup", fn, { now: EIGHT_PM_THURSDAY });
    expect(JobRun.__rows[0].summary).toBe("Sent by telegram, 412 KB");
  });

  test("describe() turns the result into the readable line kept in the log", async () => {
    const fn = jest.fn().mockResolvedValue({ checked: 3, failed: 0 });
    await runGuarded("reconciliation", fn, {
      now: EIGHT_PM_THURSDAY,
      describe: (r) => `${r.checked} owner(s) checked, ${r.failed} with drift`,
    });
    expect(JobRun.__rows[0].summary).toBe("3 owner(s) checked, 0 with drift");
  });

  test("a describe() that throws never breaks the run or its record", async () => {
    const fn = jest.fn().mockResolvedValue({ checked: 3 });
    const outcome = await runGuarded("reorder", fn, {
      now: EIGHT_PM_THURSDAY,
      describe: () => {
        throw new Error("bad formatter");
      },
    });
    expect(outcome.status).toBe("ok");
    expect(JobRun.__rows[0].status).toBe("ok");
    expect(JobRun.__rows[0].summary).toContain('"checked":3');
  });

  test("if the log cannot be written, the job still runs", async () => {
    JobRun.__state.failFindOne = true;
    const fn = jest.fn().mockResolvedValue({ checked: 1 });

    const outcome = await runGuarded("backup", fn, { now: EIGHT_PM_THURSDAY });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(outcome.ran).toBe(true);
    expect(outcome.status).toBe("ok");
  });
});

describe("runGuarded: force and crashed runs", () => {
  test("force runs a job that already finished today", async () => {
    const fn = jest.fn().mockResolvedValue({ n: 1 });
    await runGuarded("backup", fn, { now: EIGHT_PM_THURSDAY });

    const forced = await runGuarded("backup", fn, { now: new Date("2026-11-05T16:00:00Z"), force: true });

    expect(forced.ran).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JobRun.__rows[0].attempts).toBe(2);
  });

  test("a run that is still going (started moments ago) is left alone", async () => {
    JobRun.__rows.push({ _id: 1, job: "backup", day: "2026-11-05", status: "running", startedAt: EIGHT_PM_THURSDAY, attempts: 1 });
    const fn = jest.fn();

    const outcome = await runGuarded("backup", fn, { now: new Date(EIGHT_PM_THURSDAY.getTime() + 60 * 1000) });

    expect(outcome.ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  test("a run stuck as 'running' for over 15 minutes (the server restarted) is taken over", async () => {
    JobRun.__rows.push({ _id: 1, job: "backup", day: "2026-11-05", status: "running", startedAt: EIGHT_PM_THURSDAY, attempts: 1 });
    const fn = jest.fn().mockResolvedValue({ n: 1 });

    const outcome = await runGuarded("backup", fn, { now: new Date(EIGHT_PM_THURSDAY.getTime() + STALE_RUNNING_MS + 1000) });

    expect(outcome.ran).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JobRun.__rows[0]).toEqual(expect.objectContaining({ status: "ok", attempts: 2 }));
  });
});

describe("lastRuns / lastSuccess", () => {
  test("lastRuns gives the newest row of each job; lastSuccess the newest good one", async () => {
    await runGuarded("backup", jest.fn().mockResolvedValue({ sizeBytes: 100 }), { now: EIGHT_PM_THURSDAY });
    await runGuarded("backup", jest.fn().mockResolvedValue({ ok: false, error: "nope" }), { now: EIGHT_PM_FRIDAY });
    await runGuarded("reorder", jest.fn().mockResolvedValue({ checked: 1 }), { now: EIGHT_PM_FRIDAY });

    const runs = await lastRuns();
    const backup = runs.find((r) => r.job === "backup");
    expect(runs).toHaveLength(2);
    expect(backup.day).toBe("2026-11-06");
    expect(backup.status).toBe("error");

    const good = await lastSuccess("backup");
    expect(good.day).toBe("2026-11-05");
    expect(await lastSuccess("credit")).toBeNull();
  });
});

describe("NIGHTLY_JOBS", () => {
  test("lists exactly the jobs runAllJobs runs, in the same order", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../jobs/runAllJobs.js"), "utf8");
    const names = [...source.matchAll(/^\s+name: "([A-Za-z]+)",$/gm)].map((m) => m[1]);
    expect(names).toEqual(NIGHTLY_JOBS);
  });
});

describe("checkMissedRuns (the watchdog)", () => {
  test("the very first check only starts the clock: no alert about days before it existed", async () => {
    const reported = await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") }); // 10:30 IST

    expect(reported).toEqual([]);
    expect(sendAlert).not.toHaveBeenCalled();
    expect(JobRun.__rows.some((r) => r.job === "watchdog-start" && r.day === "2026-11-05")).toBe(true);
  });

  test("before 9 PM today's jobs are not expected yet", async () => {
    await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") });
    const reported = await checkMissedRuns({ now: new Date("2026-11-05T14:45:00Z") }); // 20:15 IST
    expect(reported).toEqual([]);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  test("after 9 PM with nothing run, it alerts once, naming every job that is missing", async () => {
    await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") });

    const reported = await checkMissedRuns({ now: NINE_QUARTER_PM_THURSDAY });

    expect(reported).toHaveLength(1);
    expect(reported[0].day).toBe("2026-11-05");
    expect(sendAlert).toHaveBeenCalledTimes(1);
    const text = sendAlert.mock.calls[0][0];
    expect(text).toContain("2026-11-05");
    expect(text).toContain("backup did not run");
    expect(text).toContain("reconciliation did not run");

    // asking again (the next keep-alive ping) does not repeat the alert
    resetCheckThrottle();
    await checkMissedRuns({ now: new Date("2026-11-05T16:30:00Z") });
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("no alert when every job finished (skipped jobs are fine)", async () => {
    await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") });
    seedAllOk("2026-11-05", EIGHT_PM_THURSDAY);
    JobRun.__rows.find((r) => r.job === "dailyReport" && r.day === "2026-11-05").status = "skipped";

    const reported = await checkMissedRuns({ now: NINE_QUARTER_PM_THURSDAY });

    expect(reported).toEqual([]);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  test("a job that failed is reported as failed, with the reason", async () => {
    await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") });
    seedAllOk("2026-11-05", EIGHT_PM_THURSDAY);
    const backup = JobRun.__rows.find((r) => r.job === "backup" && r.day === "2026-11-05");
    backup.status = "error";
    backup.error = "Telegram: chat not found";

    await checkMissedRuns({ now: NINE_QUARTER_PM_THURSDAY });

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("backup failed (Telegram: chat not found)");
  });

  test("a job stuck in 'running' is reported as stuck", async () => {
    await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") });
    seedAllOk("2026-11-05", EIGHT_PM_THURSDAY);
    JobRun.__rows.find((r) => r.job === "credit" && r.day === "2026-11-05").status = "running";

    await checkMissedRuns({ now: NINE_QUARTER_PM_THURSDAY });

    expect(sendAlert.mock.calls[0][0]).toContain("credit got stuck");
  });

  test("the next morning it still reports yesterday's missed run", async () => {
    await checkMissedRuns({ now: new Date("2026-11-05T05:00:00Z") });

    const reported = await checkMissedRuns({ now: new Date("2026-11-06T02:30:00Z") }); // 08:00 IST on the 6th

    expect(reported.map((r) => r.day)).toEqual(["2026-11-05"]);
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("days before the watchdog started are never reported", async () => {
    await checkMissedRuns({ now: NINE_QUARTER_PM_FRIDAY }); // first ever check, on the 6th, after 9 PM
    // Thursday the 5th is before the start day: ignored. Friday itself is expected, and has nothing.
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("2026-11-06");
    expect(sendAlert.mock.calls[0][0]).not.toContain("2026-11-05");
  });
});

describe("maybeCheckMissedRuns (called from the health ping)", () => {
  test("does nothing until the database is ready", async () => {
    maybeCheckMissedRuns({ now: NINE_QUARTER_PM_THURSDAY, ready: false });
    await flush();
    expect(JobRun.__rows).toHaveLength(0);
  });

  test("checks at most once every 10 minutes", async () => {
    maybeCheckMissedRuns({ now: new Date("2026-11-05T05:00:00Z"), ready: true });
    await flush();
    expect(JobRun.__rows.filter((r) => r.job === "watchdog-start")).toHaveLength(1);

    // a second ping 5 minutes later is ignored: even after 9 PM nothing is evaluated
    maybeCheckMissedRuns({ now: new Date("2026-11-05T05:05:00Z"), ready: true });
    await flush();

    // 20 minutes later it looks again (and, past 9 PM with nothing run, alerts)
    maybeCheckMissedRuns({ now: NINE_QUARTER_PM_THURSDAY, ready: true });
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("never throws or rejects, even if the database fails", async () => {
    JobRun.__state.failFindOne = true;
    maybeCheckMissedRuns({ now: NINE_QUARTER_PM_THURSDAY, ready: true });
    await flush();
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
