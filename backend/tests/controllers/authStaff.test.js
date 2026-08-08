jest.mock("../../models/User");
jest.mock("../../models/Settings");
jest.mock("../../utils/mailer");

const User = require("../../models/User");
const controller = require("../../controllers/authController");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.hashPin.mockResolvedValue("hashed");
});

describe("authController.createStaff", () => {
  test("creates a staff account scoped to the owner's id", async () => {
    User.findOne.mockResolvedValue(null); // no existing account with that email
    User.create.mockResolvedValue({ _id: "staff1", email: "staff@sbt.com", name: "Ramesh", role: "staff" });

    const req = { userId: "owner1", body: { email: "staff@sbt.com", pin: "1234", name: "Ramesh" } };
    const res = fakeRes();
    await controller.createStaff(req, res, jest.fn());

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "staff@sbt.com", role: "staff", ownerId: "owner1" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("rejects a duplicate email", async () => {
    User.findOne.mockResolvedValue({ _id: "existing" });

    const req = { userId: "owner1", body: { email: "taken@sbt.com", pin: "1234" } };
    const res = fakeRes();
    await controller.createStaff(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(User.create).not.toHaveBeenCalled();
  });

  test("rejects a PIN under 4 digits", async () => {
    const req = { userId: "owner1", body: { email: "staff@sbt.com", pin: "12" } };
    const res = fakeRes();
    await controller.createStaff(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.create).not.toHaveBeenCalled();
  });
});

describe("authController.listStaff", () => {
  test("lists only staff belonging to this owner", async () => {
    const select = jest.fn().mockResolvedValue([{ _id: "staff1", role: "staff" }]);
    User.find.mockReturnValue({ select });

    const req = { userId: "owner1" };
    const res = fakeRes();
    await controller.listStaff(req, res, jest.fn());

    expect(User.find).toHaveBeenCalledWith({ ownerId: "owner1", role: "staff" });
    expect(res.json).toHaveBeenCalledWith([{ _id: "staff1", role: "staff" }]);
  });
});

describe("authController.removeStaff", () => {
  test("removes a staff account belonging to this owner", async () => {
    User.findOneAndDelete.mockResolvedValue({ _id: "staff1" });

    const req = { userId: "owner1", params: { id: "staff1" } };
    const res = fakeRes();
    await controller.removeStaff(req, res, jest.fn());

    expect(User.findOneAndDelete).toHaveBeenCalledWith({ _id: "staff1", ownerId: "owner1", role: "staff" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "staff1" }));
  });

  test("404s when trying to remove another owner's staff", async () => {
    User.findOneAndDelete.mockResolvedValue(null);

    const req = { userId: "owner1", params: { id: "someoneElsesStaff" } };
    const res = fakeRes();
    await controller.removeStaff(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// Regression coverage for a real bug found in review: for a staff login,
// req.userId is deliberately resolved to the *owner's* id (see
// middleware/auth.js) so every data query stays correctly scoped. But `me`
// and `changePin` are about the caller's own identity/credential, not the
// business data — using req.userId there meant a staff account calling
// either endpoint acted on the owner's account instead of their own.
describe("authController.me (staff vs owner identity)", () => {
  test("uses req.actorId, not req.userId, to look up the caller's own profile", async () => {
    const select = jest.fn().mockResolvedValue({ _id: "staff1", email: "staff@sbt.com", role: "staff" });
    User.findById.mockReturnValue({ select });

    // A staff login: req.userId is the owner's id (data scope), req.actorId is the staff's own id.
    const req = { userId: "owner1", actorId: "staff1" };
    const res = fakeRes();
    await controller.me(req, res, jest.fn());

    expect(User.findById).toHaveBeenCalledWith("staff1");
    expect(User.findById).not.toHaveBeenCalledWith("owner1");
  });
});

describe("authController.changePin (staff vs owner identity)", () => {
  test("looks up and updates the caller's own account, not req.userId's owner scope", async () => {
    const user = {
      isLocked: () => false,
      comparePin: jest.fn().mockResolvedValue(true),
      registerSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const req = { userId: "owner1", actorId: "staff1", body: { currentPin: "1111", newPin: "2222" } };
    const res = fakeRes();
    await controller.changePin(req, res, jest.fn());

    expect(User.findById).toHaveBeenCalledWith("staff1");
    expect(User.findById).not.toHaveBeenCalledWith("owner1");
    expect(user.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "PIN updated" }));
  });
});
