jest.mock("../../models/Notification", () => ({ deleteMany: jest.fn() }));
jest.mock("../../models/AuditLog", () => ({ deleteMany: jest.fn() }));
jest.mock("../../models/JobRun", () => ({ deleteMany: jest.fn() }));

const Notification = require("../../models/Notification");
const AuditLog = require("../../models/AuditLog");
const JobRun = require("../../models/JobRun");
const { runRetentionJob, NOTIFICATION_DAYS, AUDIT_LOG_YEARS, JOB_RUN_DAYS } = require("../../jobs/retentionJob");

beforeAll(() => {
  // the code under test logs what it does; keep the test output readable
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

const NOW = new Date("2026-11-05T14:30:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  Notification.deleteMany.mockResolvedValue({ deletedCount: 4 });
  AuditLog.deleteMany.mockResolvedValue({ deletedCount: 2 });
  JobRun.deleteMany.mockResolvedValue({ deletedCount: 9 });
});

describe("runRetentionJob", () => {
  test("keeps the agreed times: notifications 90 days, audit log 3 years, job log 120 days", () => {
    expect(NOTIFICATION_DAYS).toBe(90);
    expect(AUDIT_LOG_YEARS).toBe(3);
    expect(JOB_RUN_DAYS).toBe(120);
  });

  test("removes only what is older than the cut-off dates and reports the counts", async () => {
    const result = await runRetentionJob({ now: NOW });

    expect(result).toEqual({ notificationsRemoved: 4, auditLogsRemoved: 2, jobRunsRemoved: 9 });

    const notificationCutoff = Notification.deleteMany.mock.calls[0][0].createdAt.$lt;
    expect(notificationCutoff.toISOString()).toBe("2026-08-07T14:30:00.000Z"); // 90 days before

    const auditCutoff = AuditLog.deleteMany.mock.calls[0][0].createdAt.$lt;
    expect(auditCutoff.toISOString()).toBe("2023-11-05T14:30:00.000Z"); // exactly 3 years before

    const jobRunFilter = JobRun.deleteMany.mock.calls[0][0];
    expect(jobRunFilter.startedAt.$lt.toISOString()).toBe("2026-07-08T14:30:00.000Z"); // 120 days before
  });

  test("never deletes the watchdog's start marker", async () => {
    await runRetentionJob({ now: NOW });
    expect(JobRun.deleteMany.mock.calls[0][0].job).toEqual({ $ne: "watchdog-start" });
  });

  test("one clean-up failing does not stop the others, and the job reports the failure", async () => {
    Notification.deleteMany.mockRejectedValue(new Error("write conflict"));

    const result = await runRetentionJob({ now: NOW });

    expect(AuditLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(JobRun.deleteMany).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("notificationsRemoved: write conflict");
    expect(result.auditLogsRemoved).toBe(2);
  });

  test("treats a missing deletedCount as zero", async () => {
    Notification.deleteMany.mockResolvedValue({});
    const result = await runRetentionJob({ now: NOW });
    expect(result.notificationsRemoved).toBe(0);
  });
});
