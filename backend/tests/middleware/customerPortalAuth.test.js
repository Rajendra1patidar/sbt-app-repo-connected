jest.mock("jsonwebtoken");

const jwt = require("jsonwebtoken");
const { protectCustomerPortal } = require("../../middleware/customerPortalAuth");

function fakeReq(token) {
  return { headers: { authorization: token ? `Bearer ${token}` : "" } };
}
function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("protectCustomerPortal", () => {
  test("a valid customer-portal token scopes req to that customer/owner", () => {
    jwt.verify.mockReturnValue({ customerId: "cust1", ownerId: "owner1", scope: "customer-portal" });

    const req = fakeReq("sometoken");
    const res = fakeRes();
    const next = jest.fn();

    protectCustomerPortal(req, res, next);

    expect(req.customerId).toBe("cust1");
    expect(req.ownerId).toBe("owner1");
    expect(next).toHaveBeenCalled();
  });

  test("rejects a token missing the customer-portal scope (e.g. an owner token)", () => {
    jwt.verify.mockReturnValue({ id: "owner1" }); // shape of an owner/staff token

    const req = fakeReq("ownertoken");
    const res = fakeRes();
    const next = jest.fn();

    protectCustomerPortal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects with no token at all", () => {
    const req = fakeReq(null);
    const res = fakeRes();
    const next = jest.fn();

    protectCustomerPortal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects an expired/invalid token", () => {
    jwt.verify.mockImplementation(() => { throw new Error("jwt expired"); });

    const req = fakeReq("badtoken");
    const res = fakeRes();
    const next = jest.fn();

    protectCustomerPortal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
