const { pinProblem, isText, lockDurationMs, formatWait, applyFailedAttempt, LOCKOUT_MEMORY_MS } = require("../../utils/pin");

describe("pinProblem (rules for NEW or CHANGED PINs)", () => {
  test("accepts 4, 5 and 6 digits, as text or number", () => {
    expect(pinProblem("1234")).toBeNull();
    expect(pinProblem("12345")).toBeNull();
    expect(pinProblem("123456")).toBeNull();
    expect(pinProblem(4821)).toBeNull();
  });

  test("rejects too short, too long, non-digits, empty and objects", () => {
    expect(pinProblem("123")).toMatch(/4 to 6 digits/);
    expect(pinProblem("1234567")).toMatch(/4 to 6 digits/);
    expect(pinProblem("12ab")).toMatch(/4 to 6 digits/);
    expect(pinProblem("")).toMatch(/required/);
    expect(pinProblem(undefined)).toMatch(/required/);
    expect(pinProblem({ $gt: "" })).toMatch(/4 to 6 digits/);
  });

  test("uses the label in the message", () => {
    expect(pinProblem("1", "New PIN")).toMatch(/^New PIN must be/);
  });
});

describe("isText", () => {
  test("only real strings pass, so objects never reach a database query", () => {
    expect(isText("a@b.com")).toBe(true);
    expect(isText({ $ne: null })).toBe(false);
    expect(isText(["a"])).toBe(false);
    expect(isText(undefined)).toBe(false);
  });
});

describe("lockout ladder", () => {
  test("15 minutes, 1 hour, 6 hours, then 24 hours for every later lockout", () => {
    expect(lockDurationMs(1)).toBe(15 * 60 * 1000);
    expect(lockDurationMs(2)).toBe(60 * 60 * 1000);
    expect(lockDurationMs(3)).toBe(6 * 60 * 60 * 1000);
    expect(lockDurationMs(4)).toBe(24 * 60 * 60 * 1000);
    expect(lockDurationMs(9)).toBe(24 * 60 * 60 * 1000);
    expect(lockDurationMs(0)).toBe(15 * 60 * 1000);
  });

  test("formatWait reads naturally", () => {
    expect(formatWait(60 * 1000)).toBe("1 minute");
    expect(formatWait(14 * 60 * 1000)).toBe("14 minutes");
    expect(formatWait(60 * 60 * 1000)).toBe("1 hour");
    expect(formatWait(5.5 * 60 * 60 * 1000)).toBe("6 hours");
  });
});

describe("applyFailedAttempt", () => {
  const now = Date.parse("2026-10-30T10:00:00Z");

  test("counts wrong PINs below the limit without locking", () => {
    const r = applyFailedAttempt({ failedAttempts: 2 }, 5, now);
    expect(r).toEqual({ failedAttempts: 3, lockedNow: false, lockoutCount: 0 });
  });

  test("the 5th wrong PIN locks for 15 minutes the first time", () => {
    const r = applyFailedAttempt({ failedAttempts: 4 }, 5, now);
    expect(r.lockedNow).toBe(true);
    expect(r.lockoutCount).toBe(1);
    expect(r.failedAttempts).toBe(0);
    expect(r.lockUntil.getTime()).toBe(now + 15 * 60 * 1000);
  });

  test("a second lockout within a day waits an hour", () => {
    const r = applyFailedAttempt({ failedAttempts: 4, lockoutCount: 1, lastLockoutAt: new Date(now - 3600 * 1000) }, 5, now);
    expect(r.lockoutCount).toBe(2);
    expect(r.lockUntil.getTime()).toBe(now + 60 * 60 * 1000);
  });

  test("after a quiet day the ladder starts again", () => {
    const r = applyFailedAttempt({ failedAttempts: 4, lockoutCount: 3, lastLockoutAt: new Date(now - LOCKOUT_MEMORY_MS - 1000) }, 5, now);
    expect(r.lockoutCount).toBe(1);
    expect(r.lockUntil.getTime()).toBe(now + 15 * 60 * 1000);
  });
});
