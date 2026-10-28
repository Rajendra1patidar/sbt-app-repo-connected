jest.mock("../../models/Settings");
const Settings = require("../../models/Settings");
const { update } = require("../../controllers/settingsController");

const mockRes = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };

describe("saving settings", () => {
  test("a mistyped UPI ID is answered with a plain 400 message (not a 500 error alert)", async () => {
    const err = Object.assign(new Error("Validation failed"), { name: "ValidationError", errors: { upiId: { message: "That UPI ID doesn't look right. It should look like shopname@okicici" } } });
    Settings.findOneAndUpdate.mockRejectedValue(err);
    const res = mockRes(); const next = jest.fn();
    await update({ userId: "o1", body: { upiId: "shop" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/shopname@okicici/);
    expect(next).not.toHaveBeenCalled();
  });

  test("other failures still go to the normal error handler", async () => {
    const boom = new Error("db down");
    Settings.findOneAndUpdate.mockRejectedValue(boom);
    const next = jest.fn();
    await update({ userId: "o1", body: {} }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
