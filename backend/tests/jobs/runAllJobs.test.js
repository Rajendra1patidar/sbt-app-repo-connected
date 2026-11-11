/**
 * Tests for the nightly run orchestration. Every job and the once-a-day guard
 * are replaced by mocks, so this checks only what runAllJobs itself decides:
 * order, passing `force`, `only`, skipping jobs the guard says already ran, and
 * not letting one job's crash stop the rest.
 */

jest.mock("../../jobs/reconciliationJob", () => ({ runReconciliationCheck: jest.fn() }));
jest.mock("../../jobs/reorderCheckJob", () => ({ runReorderCheck: jest.fn() }));
jest.mock("../../jobs/deadStockJob", () => ({ runDeadStockCheck: jest.fn() }));
jest.mock("../../jobs/creditCheckJob", () => ({ runCreditCheck: jest.fn() }));
jest.mock("../../jobs/dailyReportJob", () => ({ runDailyReport: jest.fn() }));
jest.mock("../../jobs/backupJob", () => ({ runBackupJob: jest.fn() }));
jest.mock("../../jobs/retentionJob", () => ({ runRetentionJob: jest.fn() }));
jest.mock("../../services/jobRunService", () => ({ runGuarded: jest.fn() }));

const { runReconciliationCheck } = require("../../jobs/reconciliationJob");
const { runReorderCheck } = require("../../jobs/reorderCheckJob");
const { runDeadStockCheck } = require("../../jobs/deadStockJob");
const { runCreditCheck } = require("../../jobs/creditCheckJob");
const { runDailyReport } = require("../../jobs/dailyReportJob");
const { runBackupJob } = require("../../jobs/backupJob");
const { runRetentionJob } = require("../../jobs/retentionJob");
const { runGuarded } = require("../../services/jobRunService");
const { runAllJobs, JOB_NAMES } = require("../../jobs/runAllJobs");

beforeAll(() => {
  // the code under test logs what it does; keep the test output readable
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

const EXPECTED_ORDER = ["reconciliation", "reorder", "deadStock", "credit", "dailyReport", "backup", "retention"];

beforeEach(() => {
  jest.clearAllMocks();
  runReconciliationCheck.mockResolvedValue({ checked: 1, failed: 0 });
  runReorderCheck.mockResolvedValue({ checked: 1, notified: 0 });
  runDeadStockCheck.mockResolvedValue({ checked: 1, notified: 0 });
  runCreditCheck.mockResolvedValue({ checked: 1, notified: 0 });
  runDailyReport.mockResolvedValue({ checked: 1, sent: 1 });
  runBackupJob.mockResolvedValue({ delivered: ["telegram"], summary: "Sent by telegram" });
  runRetentionJob.mockResolvedValue({ notificationsRemoved: 0, auditLogsRemoved: 0, jobRunsRemoved: 0 });
  // a guard that lets everything through and hands back what the job returned
  runGuarded.mockImplementation(async (name, fn) => {
    try {
      const result = await fn();
      return { ran: true, job: name, status: result && result.ok === false ? "error" : "ok", result };
    } catch (err) {
      return { ran: true, job: name, status: "error", error: err.message, result: { error: err.message } };
    }
  });
});

describe("runAllJobs", () => {
  test("runs every nightly job, in order, each through the once-a-day guard", async () => {
    const outcome = await runAllJobs();

    expect(JOB_NAMES).toEqual(EXPECTED_ORDER);
    expect(runGuarded.mock.calls.map((c) => c[0])).toEqual(EXPECTED_ORDER);
    expect(outcome.skipped).toBe(false);
    expect(Object.keys(outcome.results)).toEqual(EXPECTED_ORDER);
    expect(outcome.results.reconciliation).toEqual({ checked: 1, failed: 0 });
  });

  test("the backup runs before the retention clean-up", () => {
    expect(JOB_NAMES.indexOf("backup")).toBeLessThan(JOB_NAMES.indexOf("retention"));
  });

  test("passes force through to the guard and to the backup job", async () => {
    await runAllJobs({ force: true });

    expect(runGuarded.mock.calls.every((c) => c[2].force === true)).toBe(true);
    expect(runBackupJob).toHaveBeenCalledWith({ force: true });
  });

  test("only runs the jobs asked for", async () => {
    const outcome = await runAllJobs({ only: ["backup", "retention"] });

    expect(Object.keys(outcome.results)).toEqual(["backup", "retention"]);
    expect(runReconciliationCheck).not.toHaveBeenCalled();
    expect(runBackupJob).toHaveBeenCalledTimes(1);
  });

  test("a job the guard says already ran today is reported as skipped, not run", async () => {
    runGuarded.mockImplementation(async (name, fn) => {
      if (name === "backup") return { ran: false, job: name };
      return { ran: true, job: name, status: "ok", result: await fn() };
    });

    const outcome = await runAllJobs();

    expect(outcome.results.backup).toEqual({ skipped: true, reason: "already ran today" });
    expect(outcome.results.retention).toEqual({ notificationsRemoved: 0, auditLogsRemoved: 0, jobRunsRemoved: 0 });
    expect(runBackupJob).not.toHaveBeenCalled();
  });

  test("one job crashing does not stop the ones after it", async () => {
    runCreditCheck.mockRejectedValue(new Error("aggregation exploded"));

    const outcome = await runAllJobs();

    expect(outcome.results.credit).toEqual({ error: "aggregation exploded" });
    expect(runDailyReport).toHaveBeenCalledTimes(1);
    expect(runBackupJob).toHaveBeenCalledTimes(1);
    expect(runRetentionJob).toHaveBeenCalledTimes(1);
  });

  test("a trigger that arrives while a run is still going does nothing", async () => {
    let release;
    runReconciliationCheck.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ checked: 0, failed: 0 }); }));

    const first = runAllJobs();
    await new Promise((resolve) => setImmediate(resolve));
    const second = await runAllJobs();

    expect(second).toEqual({ skipped: true, reason: "already running" });

    release();
    const firstOutcome = await first;
    expect(firstOutcome.skipped).toBe(false);

    // and once it has finished, a new run is allowed again
    runReconciliationCheck.mockResolvedValue({ checked: 1, failed: 0 });
    const third = await runAllJobs();
    expect(third.skipped).toBe(false);
  });
});
