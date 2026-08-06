const { requireOwner } = require("../../middleware/roles");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe("requireOwner", () => {
  test("allows an owner through", () => {
    const req = { role: "owner" };
    const res = fakeRes();
    const next = jest.fn();
    requireOwner(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("blocks a staff account with 403", () => {
    const req = { role: "staff" };
    const res = fakeRes();
    const next = jest.fn();
    requireOwner(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
