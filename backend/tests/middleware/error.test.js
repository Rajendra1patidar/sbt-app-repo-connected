jest.mock("../../utils/alertWebhook");

const { sendErrorAlert } = require("../../utils/alertWebhook");
const { errorHandler } = require("../../middleware/error");

function res0(statusCode = 200) {
  return { statusCode, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const req = { method: "POST", originalUrl: "/api/estimates", userId: "o1" };
const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => { process.env.NODE_ENV = ORIGINAL_ENV; });

describe("errorHandler", () => {
  test("honours a status the error carries and does not page the alert channel for a 4xx", () => {
    const res = res0();
    errorHandler(Object.assign(new Error("Bad JSON"), { status: 400 }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendErrorAlert).not.toHaveBeenCalled();
  });

  test("falls back to the response's own status, then to 500", () => {
    const a = res0(404);
    errorHandler(new Error("nope"), req, a, jest.fn());
    expect(a.status).toHaveBeenCalledWith(404);
    const b = res0(200);
    errorHandler(new Error("boom"), req, b, jest.fn());
    expect(b.status).toHaveBeenCalledWith(500);
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
  });

  test("in production a 500 never shows the internal message or a stack", () => {
    process.env.NODE_ENV = "production";
    const res = res0();
    errorHandler(new Error("E11000 duplicate key collection: sbt.documents"), req, res, jest.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Something went wrong on the server. Please try again.");
    expect(body.stack).toBeUndefined();
  });

  test("in production a 4xx keeps its message so people can act on it", () => {
    process.env.NODE_ENV = "production";
    const res = res0();
    errorHandler(Object.assign(new Error("Not allowed by CORS"), { status: 403 }), req, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe("Not allowed by CORS");
  });

  test("outside production the real message and stack are included for debugging", () => {
    process.env.NODE_ENV = "development";
    const res = res0();
    errorHandler(new Error("db exploded"), req, res, jest.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("db exploded");
    expect(body.stack).toBeDefined();
  });
});
