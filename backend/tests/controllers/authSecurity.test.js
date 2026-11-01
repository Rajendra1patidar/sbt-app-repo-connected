/**
 * Login, PIN change/reset and registration: input checking, PIN rules,
 * escalating-lockout alerts, and "a PIN change signs out other devices".
 */
jest.mock("jsonwebtoken");
jest.mock("../../models/User");
jest.mock("../../models/Settings");
jest.mock("../../utils/mailer");
jest.mock("../../utils/alertWebhook");
jest.mock("../../utils/ownerAccounts");
jest.mock("../../middleware/auth", () => ({ invalidateAuthCache: jest.fn() }));

const jwt = require("jsonwebtoken");
const User = require("../../models/User");
const { sendMail } = require("../../utils/mailer");
const { sendAlert } = require("../../utils/alertWebhook");
const { findOwnerUsers } = require("../../utils/ownerAccounts");
const { invalidateAuthCache } = require("../../middleware/auth");
const controller = require("../../controllers/authController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const flush = () => new Promise((r) => setImmediate(r));

function fakeUser(o = {}) {
  return {
    _id: "u1",
    email: "owner@sbt.com",
    name: "Owner",
    role: "owner",
    tokenVersion: 3,
    isLocked: () => false,
    comparePin: jest.fn().mockResolvedValue(true),
    registerFailedAttempt: jest.fn().mockResolvedValue({ lockedNow: false, lockoutCount: 0 }),
    registerSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    ...o,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jwt.sign.mockReturnValue("signed-token");
  User.hashPin.mockResolvedValue("hashed");
  sendAlert.mockResolvedValue(undefined);
  sendMail.mockResolvedValue(undefined);
});

describe("login", () => {
  test("refuses an object where an email should be, without touching the database", async () => {
    const res = fakeRes();
    await controller.login({ body: { email: { $ne: null }, pin: "1234" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test("refuses an object where a PIN should be", async () => {
    const res = fakeRes();
    await controller.login({ body: { email: "a@b.com", pin: { $gt: "" } } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test("a good login signs a token that carries the account's token version", async () => {
    User.findOne.mockResolvedValue(fakeUser({ tokenVersion: 3 }));
    const res = fakeRes();
    await controller.login({ body: { email: "Owner@SBT.com", pin: "1234" } }, res, jest.fn());
    expect(jwt.sign).toHaveBeenCalledWith({ id: "u1", tv: 3 }, process.env.JWT_SECRET, { expiresIn: "30d" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: "signed-token" }));
  });

  test("an account that predates token versions signs version 0", async () => {
    User.findOne.mockResolvedValue(fakeUser({ tokenVersion: undefined }));
    await controller.login({ body: { email: "owner@sbt.com", pin: "1234" } }, fakeRes(), jest.fn());
    expect(jwt.sign).toHaveBeenCalledWith({ id: "u1", tv: 0 }, process.env.JWT_SECRET, { expiresIn: "30d" });
  });

  test("a PIN that predates the 4-6 digit rule can still log in", async () => {
    User.findOne.mockResolvedValue(fakeUser());
    const res = fakeRes();
    await controller.login({ body: { email: "owner@sbt.com", pin: "12ab" } }, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: "signed-token" }));
  });

  test("a locked account is told how long to wait, in hours when the wait is long", async () => {
    User.findOne.mockResolvedValue(fakeUser({ isLocked: () => true, lockUntil: new Date(Date.now() + 6 * 3600 * 1000) }));
    const res = fakeRes();
    await controller.login({ body: { email: "owner@sbt.com", pin: "1234" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json.mock.calls[0][0].message).toMatch(/6 hours/);
  });

  test("a wrong PIN is a plain 401, and the first lockout does not raise an alert", async () => {
    User.findOne.mockResolvedValue(
      fakeUser({ comparePin: jest.fn().mockResolvedValue(false), registerFailedAttempt: jest.fn().mockResolvedValue({ lockedNow: true, lockoutCount: 1 }) })
    );
    const res = fakeRes();
    await controller.login({ body: { email: "owner@sbt.com", pin: "0000" } }, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  test("a repeat lockout alerts the owner, and emails an owner login's own address", async () => {
    User.findOne.mockResolvedValue(
      fakeUser({ comparePin: jest.fn().mockResolvedValue(false), registerFailedAttempt: jest.fn().mockResolvedValue({ lockedNow: true, lockoutCount: 2 }) })
    );
    const res = fakeRes();
    await controller.login({ body: { email: "owner@sbt.com", pin: "0000" } }, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sendAlert).toHaveBeenCalledWith(expect.stringContaining("owner login owner@sbt.com"));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@sbt.com" }));
  });

  test("a repeat lockout of a staff login alerts the owner but does not email the staff member", async () => {
    User.findOne.mockResolvedValue(
      fakeUser({ role: "staff", email: "staff@sbt.com", comparePin: jest.fn().mockResolvedValue(false), registerFailedAttempt: jest.fn().mockResolvedValue({ lockedNow: true, lockoutCount: 3 }) })
    );
    await controller.login({ body: { email: "staff@sbt.com", pin: "0000" } }, fakeRes(), jest.fn());
    await flush();
    expect(sendAlert).toHaveBeenCalledWith(expect.stringContaining("staff login staff@sbt.com"));
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("register", () => {
  test("rejects a 3-digit and a non-numeric PIN", async () => {
    findOwnerUsers.mockResolvedValue([]);
    for (const pin of ["123", "12ab", "1234567"]) {
      const res = fakeRes();
      await controller.register({ body: { email: "o@sbt.com", pin } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(User.create).not.toHaveBeenCalled();
  });

  test("accepts a 6-digit PIN", async () => {
    findOwnerUsers.mockResolvedValue([]);
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({ _id: "u1", email: "o@sbt.com", name: "Owner" });
    const res = fakeRes();
    await controller.register({ body: { email: "o@sbt.com", pin: "482913" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("is closed once an owner exists", async () => {
    findOwnerUsers.mockResolvedValue([{ _id: "u1" }]);
    const res = fakeRes();
    await controller.register({ body: { email: "o@sbt.com", pin: "1234" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("changePin", () => {
  test("rejects a new PIN that is not 4 to 6 digits", async () => {
    for (const newPin of ["123", "12ab", ""]) {
      const res = fakeRes();
      await controller.changePin({ actorId: "u1", body: { currentPin: "1234", newPin } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(User.findById).not.toHaveBeenCalled();
  });

  test("signs out other devices and gives this one a fresh token", async () => {
    const user = fakeUser({ tokenVersion: 3 });
    User.findById.mockResolvedValue(user);
    const res = fakeRes();
    await controller.changePin({ actorId: "u1", body: { currentPin: "1234", newPin: "482913" } }, res, jest.fn());
    expect(user.tokenVersion).toBe(4);
    expect(user.pinHash).toBe("hashed");
    expect(invalidateAuthCache).toHaveBeenCalledWith("u1");
    expect(jwt.sign).toHaveBeenCalledWith({ id: "u1", tv: 4 }, process.env.JWT_SECRET, { expiresIn: "30d" });
    expect(res.json).toHaveBeenCalledWith({ message: "PIN updated", token: "signed-token" });
  });

  test("a wrong current PIN counts as a failed attempt and changes nothing", async () => {
    const user = fakeUser({ comparePin: jest.fn().mockResolvedValue(false) });
    User.findById.mockResolvedValue(user);
    const res = fakeRes();
    await controller.changePin({ actorId: "u1", body: { currentPin: "9999", newPin: "482913" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(user.registerFailedAttempt).toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });
});

describe("resetPin", () => {
  const resetUser = (o = {}) =>
    fakeUser({ tokenVersion: 1, failedAttempts: 4, lockUntil: new Date(), lockoutCount: 2, hasValidResetToken: jest.fn().mockReturnValue(true), clearResetToken: jest.fn().mockResolvedValue(undefined), ...o });

  test("sets the new PIN, clears lockouts and signs out every device", async () => {
    const user = resetUser();
    User.findOne.mockResolvedValue(user);
    const res = fakeRes();
    await controller.resetPin({ body: { email: "owner@sbt.com", token: "RAW", newPin: "482913" } }, res, jest.fn());
    expect(user.tokenVersion).toBe(2);
    expect(user.failedAttempts).toBe(0);
    expect(user.lockUntil).toBeNull();
    expect(user.lockoutCount).toBe(0);
    expect(user.clearResetToken).toHaveBeenCalled();
    expect(invalidateAuthCache).toHaveBeenCalledWith("u1");
  });

  test("refuses a bad code and a 3-digit PIN", async () => {
    User.findOne.mockResolvedValue(resetUser({ hasValidResetToken: jest.fn().mockReturnValue(false) }));
    const bad = fakeRes();
    await controller.resetPin({ body: { email: "owner@sbt.com", token: "WRONG", newPin: "482913" } }, bad, jest.fn());
    expect(bad.status).toHaveBeenCalledWith(400);

    const short = fakeRes();
    await controller.resetPin({ body: { email: "owner@sbt.com", token: "RAW", newPin: "123" } }, short, jest.fn());
    expect(short.status).toHaveBeenCalledWith(400);
  });

  test("refuses object inputs", async () => {
    const res = fakeRes();
    await controller.resetPin({ body: { email: { $ne: 1 }, token: "RAW", newPin: "482913" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });
});

describe("forgotPin", () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  test("the email links to the app (first CORS origin) and also carries the raw code", async () => {
    process.env.CORS_ORIGIN = "https://app.example.com,https://portal.example.com";
    delete process.env.FRONTEND_URL;
    User.findOne.mockResolvedValue(fakeUser({ issueResetToken: jest.fn().mockResolvedValue("RAWTOKEN") }));
    const res = fakeRes();
    await controller.forgotPin({ body: { email: "owner@sbt.com" } }, res, jest.fn());
    const text = sendMail.mock.calls[0][0].text;
    expect(text).toContain("https://app.example.com/reset-pin?token=RAWTOKEN&email=owner%40sbt.com");
    expect(text).toContain("RAWTOKEN");
  });

  test("FRONTEND_URL wins over CORS_ORIGIN", async () => {
    process.env.CORS_ORIGIN = "https://portal.example.com";
    process.env.FRONTEND_URL = "https://app.example.com/";
    User.findOne.mockResolvedValue(fakeUser({ issueResetToken: jest.fn().mockResolvedValue("RAWTOKEN") }));
    await controller.forgotPin({ body: { email: "owner@sbt.com" } }, fakeRes(), jest.fn());
    expect(sendMail.mock.calls[0][0].text).toContain("https://app.example.com/reset-pin?token=RAWTOKEN");
  });

  test("with nothing configured the email still carries the code", async () => {
    delete process.env.CORS_ORIGIN; delete process.env.FRONTEND_URL; delete process.env.APP_URL;
    User.findOne.mockResolvedValue(fakeUser({ issueResetToken: jest.fn().mockResolvedValue("RAWTOKEN") }));
    await controller.forgotPin({ body: { email: "owner@sbt.com" } }, fakeRes(), jest.fn());
    const text = sendMail.mock.calls[0][0].text;
    expect(text).not.toContain("reset-pin?token");
    expect(text).toContain("RAWTOKEN");
  });

  test("an unknown email gets the same answer and no email is sent", async () => {
    User.findOne.mockResolvedValue(null);
    const res = fakeRes();
    await controller.forgotPin({ body: { email: "nobody@sbt.com" } }, res, jest.fn());
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: expect.stringContaining("If that email has an account") });
  });
});
