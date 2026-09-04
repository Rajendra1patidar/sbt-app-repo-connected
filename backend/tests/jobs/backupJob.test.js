/**
 * Unit tests for backupJob. Mocks dbBackup, mailer, and alertWebhook
 * directly (same reasoning as tests/jobs/reconciliationJob.test.js — no
 * real MongoDB/SMTP available in this sandbox), so what's under test here
 * is the job's own decision-making: skip when unconfigured, skip on a
 * non-scheduled day, skip (and alert) when the archive is too large, and
 * email it otherwise.
 */

jest.mock("../../utils/dbBackup");
jest.mock("../../utils/mailer");
jest.mock("../../utils/alertWebhook");

const { buildBackupArchive, MAX_GZIP_BYTES } = require("../../utils/dbBackup");
const { sendMail } = require("../../utils/mailer");
const { sendErrorAlert } = require("../../utils/alertWebhook");
const { runBackupJob } = require("../../jobs/backupJob");

function mockArchive(overrides = {}) {
  return {
    filename: "sbt-backup-2026-08-17.zip",
    buffer: Buffer.from("fake-zip-bytes"),
    sizeBytes: 1024,
    tooLarge: false,
    summary: [{ name: "customers", count: 5 }, { name: "items", count: 0 }],
    ...overrides,
  };
}

// 2026-08-17 09:00 UTC = 2026-08-17 14:30 IST, a Monday — one of the two
// default scheduled days, so tests aren't flaky depending on which real
// weekday they happen to run on.
const A_SCHEDULED_MONDAY = new Date("2026-08-17T09:00:00Z");
// 2026-08-18 is a Tuesday IST — not in the default Mon/Fri schedule.
const AN_UNSCHEDULED_TUESDAY = new Date("2026-08-18T09:00:00Z");

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(A_SCHEDULED_MONDAY);
  process.env = { ...ORIGINAL_ENV, BACKUP_EMAIL_TO: "owner@example.com" };
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("runBackupJob", () => {
  test("skips without sending or building an archive when BACKUP_EMAIL_TO is not set", async () => {
    delete process.env.BACKUP_EMAIL_TO;

    const result = await runBackupJob();

    expect(result).toEqual({ skipped: true, reason: "BACKUP_EMAIL_TO not set" });
    expect(buildBackupArchive).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("skips without building an archive on a non-scheduled day", async () => {
    jest.setSystemTime(AN_UNSCHEDULED_TUESDAY);

    const result = await runBackupJob();

    expect(result).toEqual({ skipped: true, reason: "not a scheduled backup day" });
    expect(buildBackupArchive).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("runs on both default scheduled days (Monday and Friday)", async () => {
    buildBackupArchive.mockResolvedValue(mockArchive());

    // Monday (already set as the fake system time)
    let result = await runBackupJob();
    expect(result.skipped).toBe(false);

    // Friday
    jest.setSystemTime(new Date("2026-08-21T09:00:00Z")); // Friday IST
    result = await runBackupJob();
    expect(result.skipped).toBe(false);

    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  test("honors a custom BACKUP_DAYS_OF_WEEK override", async () => {
    process.env.BACKUP_DAYS_OF_WEEK = "2"; // Tuesday only
    buildBackupArchive.mockResolvedValue(mockArchive());

    // Monday — no longer scheduled under the override
    let result = await runBackupJob();
    expect(result.skipped).toBe(true);

    // Tuesday — now scheduled
    jest.setSystemTime(AN_UNSCHEDULED_TUESDAY);
    result = await runBackupJob();
    expect(result.skipped).toBe(false);
  });

  test("emails the zipped archive as an attachment when everything is configured", async () => {
    buildBackupArchive.mockResolvedValue(mockArchive());

    const result = await runBackupJob();

    expect(result).toEqual({ skipped: false, sent: true, sizeBytes: 1024, totalDocs: 5 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe("owner@example.com");
    expect(call.attachments).toEqual([
      expect.objectContaining({ filename: "sbt-backup-2026-08-17.zip", contentType: "application/zip" }),
    ]);
    expect(call.text).toContain("customers: 5");
    expect(call.text).not.toContain("items: 0"); // zero-count collections are filtered out of the summary
    expect(sendErrorAlert).not.toHaveBeenCalled();
  });

  test("skips sending and alerts instead when the archive is over the size guardrail", async () => {
    buildBackupArchive.mockResolvedValue(mockArchive({ tooLarge: true, sizeBytes: MAX_GZIP_BYTES + 1 }));

    const result = await runBackupJob();

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("too large");
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
  });

  test("reports failure and alerts if sendMail rejects, without throwing", async () => {
    buildBackupArchive.mockResolvedValue(mockArchive());
    sendMail.mockRejectedValue(new Error("SMTP timeout"));

    const result = await runBackupJob();

    expect(result).toEqual({ skipped: false, sent: false, error: "SMTP timeout" });
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
    expect(sendErrorAlert.mock.calls[0][0].message).toContain("SMTP timeout");
  });
});
