jest.mock("../../jobs/runAllJobs", () => ({
  runAllJobs: jest.fn(),
  JOB_NAMES: ["reconciliation", "reorder", "deadStock", "credit", "dailyReport", "backup", "retention"],
}));

const { runAllJobs } = require("../../jobs/runAllJobs");
const { run } = require("../../controllers/cronController");

function mockRes() {
  const res = { statusCode: 200, body: undefined, contentType: undefined };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((b) => {
    res.body = b;
    return res;
  });
  res.type = jest.fn((t) => {
    res.contentType = t;
    return res;
  });
  res.send = jest.fn((b) => {
    res.body = b;
    return res;
  });
  return res;
}

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
  runAllJobs.mockResolvedValue({ skipped: false, results: { backup: { delivered: ["telegram"] } } });
});

describe("POST /api/cron/run", () => {
  test("runs everything and answers with the results once it has finished", async () => {
    const res = mockRes();

    await run({ query: {} }, res);

    expect(runAllJobs).toHaveBeenCalledWith({ force: false, only: null });
    expect(res.contentType).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ status: "ok", skipped: false, results: { backup: { delivered: ["telegram"] } } });
  });

  test("?force=1 and ?only=backup are passed through", async () => {
    await run({ query: { force: "1", only: "backup, retention" } }, mockRes());
    expect(runAllJobs).toHaveBeenCalledWith({ force: true, only: ["backup", "retention"] });
  });

  test("an unknown job name is rejected with the list of real ones, and nothing runs", async () => {
    const res = mockRes();

    await run({ query: { only: "backup,backups" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("backups");
    expect(res.body.message).toContain("reconciliation");
    expect(runAllJobs).not.toHaveBeenCalled();
  });

  test("?async=1 answers straight away with 202 and keeps running in the background", async () => {
    const res = mockRes();

    await run({ query: { async: "true" } }, res);

    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe("accepted");
    expect(runAllJobs).toHaveBeenCalledTimes(1);
  });

  test("a background run that crashes is logged, not left as an unhandled rejection", async () => {
    runAllJobs.mockRejectedValue(new Error("exploded"));

    await run({ query: { async: "1" } }, mockRes());
    await new Promise((resolve) => setImmediate(resolve));

    expect(console.error).toHaveBeenCalled();
  });

  test("an unexpected crash while waiting for the run becomes a 500", async () => {
    runAllJobs.mockRejectedValue(new Error("exploded"));
    const res = mockRes();

    await run({ query: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ status: "error", message: "exploded" });
  });
});
