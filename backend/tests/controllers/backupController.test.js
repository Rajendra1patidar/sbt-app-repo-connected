jest.mock("../../utils/dbBackup", () => ({ buildEncryptedBackup: jest.fn() }));
jest.mock("../../services/jobRunService", () => ({ lastRuns: jest.fn(), lastSuccess: jest.fn() }));
jest.mock("../../jobs/backupJob", () => ({ describeDestinations: jest.fn() }));

const { buildEncryptedBackup } = require("../../utils/dbBackup");
const { lastRuns, lastSuccess } = require("../../services/jobRunService");
const { describeDestinations } = require("../../jobs/backupJob");
const { download, status } = require("../../controllers/backupController");

const ORIGINAL_ENV = process.env;

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = jest.fn((k, v) => {
    res.headers[k] = v;
  });
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((b) => {
    res.body = b;
    return res;
  });
  res.send = jest.fn((b) => {
    res.body = b;
    return res;
  });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, BACKUP_PASSPHRASE: "test-passphrase-123" };
  describeDestinations.mockReturnValue({ telegram: true, email: false, emailDays: ["Sunday"] });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("download", () => {
  test("hands the encrypted file to the browser as an attachment", async () => {
    const buffer = Buffer.from("encrypted-bytes");
    buildEncryptedBackup.mockResolvedValue({ filename: "sbt-backup-2026-11-08.sbtbackup", buffer, sizeBytes: buffer.length });
    const res = mockRes();
    const next = jest.fn();

    await download({}, res, next);

    expect(buildEncryptedBackup).toHaveBeenCalledWith("test-passphrase-123");
    expect(res.headers["Content-Disposition"]).toBe('attachment; filename="sbt-backup-2026-11-08.sbtbackup"');
    expect(res.headers["Content-Type"]).toBe("application/octet-stream");
    expect(res.headers["Content-Length"]).toBe(String(buffer.length));
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.send).toHaveBeenCalledWith(buffer);
    expect(next).not.toHaveBeenCalled();
  });

  test("explains what to do when BACKUP_PASSPHRASE is not set, and builds nothing", async () => {
    delete process.env.BACKUP_PASSPHRASE;
    const res = mockRes();

    await download({}, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("BACKUP_PASSPHRASE is not set");
    expect(res.body.message).toContain("Render");
    expect(buildEncryptedBackup).not.toHaveBeenCalled();
  });

  test("passes unexpected errors to the error handler", async () => {
    const boom = new Error("no active MongoDB connection");
    buildEncryptedBackup.mockRejectedValue(boom);
    const next = jest.fn();

    await download({}, mockRes(), next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe("status", () => {
  const day = "2026-11-08";
  const at = new Date("2026-11-08T14:31:00Z");

  test("reports whether backups are ready, where they go, the last good backup and the latest run of each job", async () => {
    lastRuns.mockResolvedValue([
      { job: "backup", day, status: "ok", startedAt: at, finishedAt: at, summary: "Sent by telegram", error: "", result: { sizeBytes: 2048 }, secret: "not exposed" },
      { job: "reorder", day, status: "error", startedAt: at, finishedAt: at, summary: "", error: "boom" },
    ]);
    lastSuccess.mockResolvedValue({
      day,
      startedAt: at,
      finishedAt: at,
      summary: "Sent by telegram, 2 KB, 5 records",
      result: { sizeBytes: 2048, totalDocs: 5, delivered: ["telegram"] },
    });
    const res = mockRes();

    await status({}, res, jest.fn());

    expect(res.body.ready).toBe(true);
    expect(res.body.problem).toBeNull();
    expect(res.body.destinations).toEqual({ telegram: true, email: false, emailDays: ["Sunday"] });
    expect(res.body.lastGoodBackup).toEqual({
      at,
      day,
      summary: "Sent by telegram, 2 KB, 5 records",
      sizeBytes: 2048,
      totalDocs: 5,
      delivered: ["telegram"],
    });
    expect(res.body.lastBackupAttempt.status).toBe("ok");
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.jobs[1]).toEqual(expect.objectContaining({ job: "reorder", status: "error", error: "boom" }));
    expect(res.body.jobs[0].secret).toBeUndefined();
    expect(res.body.jobs[0].result).toBeUndefined();
  });

  test("says what is wrong when there is no passphrase, and handles a database with no runs yet", async () => {
    delete process.env.BACKUP_PASSPHRASE;
    lastRuns.mockResolvedValue([]);
    lastSuccess.mockResolvedValue(null);
    const res = mockRes();

    await status({}, res, jest.fn());

    expect(res.body.ready).toBe(false);
    expect(res.body.problem).toContain("BACKUP_PASSPHRASE is not set");
    expect(res.body.lastGoodBackup).toBeNull();
    expect(res.body.lastBackupAttempt).toBeNull();
    expect(res.body.jobs).toEqual([]);
  });

  test("passes database errors to the error handler", async () => {
    const boom = new Error("db down");
    lastRuns.mockRejectedValue(boom);
    lastSuccess.mockResolvedValue(null);
    const next = jest.fn();

    await status({}, mockRes(), next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
