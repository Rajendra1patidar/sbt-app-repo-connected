jest.mock("jsonwebtoken");
jest.mock("../../models/User");

const jwt = require("jsonwebtoken");
const User = require("../../models/User");
const { protect } = require("../../middleware/auth");

function fakeReq(token) {
  return { headers: { authorization: token ? `Bearer ${token}` : "" } };
}
function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("protect", () => {
  test("an owner account is scoped to its own id", async () => {
    jwt.verify.mockReturnValue({ id: "owner1" });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ role: "owner", ownerId: null }) });

    const req = fakeReq("sometoken");
    const res = fakeRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(req.userId).toBe("owner1");
    expect(req.actorId).toBe("owner1");
    expect(req.role).toBe("owner");
    expect(next).toHaveBeenCalled();
  });

  test("a staff account is scoped to its owner's id, not its own", async () => {
    jwt.verify.mockReturnValue({ id: "staffAccount1" });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ role: "staff", ownerId: "owner1" }),
    });

    const req = fakeReq("sometoken");
    const res = fakeRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(req.userId).toBe("owner1"); // data scope = the owner they work for
    expect(req.actorId).toBe("staffAccount1"); // who actually logged in
    expect(req.role).toBe("staff");
    expect(next).toHaveBeenCalled();
  });

  test("rejects when the account no longer exists", async () => {
    jwt.verify.mockReturnValue({ id: "deletedUser" });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const req = fakeReq("sometoken");
    const res = fakeRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects with no token at all", async () => {
    const req = fakeReq(null);
    const res = fakeRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
