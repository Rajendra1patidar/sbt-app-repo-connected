/**
 * Staff can fix an item but not its prices; Settings only accept real
 * settings fields; changing the UPI ID raises an alert.
 */
jest.mock("../../models/Item");
jest.mock("../../models/Settings");
jest.mock("../../services/itemInsightsService");
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn() }));
jest.mock("../../utils/alertWebhook");

const Item = require("../../models/Item");
const Settings = require("../../models/Settings");
const { sendAlert } = require("../../utils/alertWebhook");
const itemController = require("../../controllers/itemController");
const settingsController = require("../../controllers/settingsController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

describe("item update", () => {
  const existing = () => ({ _id: "i1", name: "Cement PPC", sellingPrice: 390, purchasePrice: 340, deleted: false });
  const makeReq = (body, role) => ({ userId: "owner1", actorId: "a1", role, params: { id: "i1" }, body });

  beforeEach(() => {
    jest.clearAllMocks();
    Item.findOne.mockResolvedValue(existing());
    Item.find.mockResolvedValue([]); // no other item shares the name
    Item.findOneAndUpdate.mockResolvedValue(existing());
  });

  test("staff cannot change the selling or purchase price", async () => {
    for (const body of [{ sellingPrice: 400 }, { purchasePrice: 300 }]) {
      const res = fakeRes();
      await itemController.update(makeReq(body, "staff"), res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(Item.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("staff can save the form when the prices are unchanged", async () => {
    const res = fakeRes();
    await itemController.update(makeReq({ name: "Cement PPC 50kg", sellingPrice: 390, purchasePrice: 340 }, "staff"), res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(Item.findOneAndUpdate).toHaveBeenCalled();
  });

  test("the owner can change prices", async () => {
    const res = fakeRes();
    await itemController.update(makeReq({ sellingPrice: 410 }, "owner"), res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(Item.findOneAndUpdate).toHaveBeenCalled();
  });

  test("owner, id and the soft-delete flag cannot be set through an edit", async () => {
    await itemController.update(makeReq({ name: "x", owner: "evil", deleted: true, _id: "other" }, "owner"), fakeRes(), jest.fn());
    const set = Item.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.name).toBe("x");
    for (const k of ["owner", "deleted", "_id"]) expect(k in set).toBe(false);
  });
});

describe("settings update", () => {
  const makeReq = (body) => ({ userId: "owner1", body });
  beforeEach(() => {
    jest.clearAllMocks();
    sendAlert.mockResolvedValue(undefined);
  });

  test("owner and id fields in the body are ignored", async () => {
    Settings.findOneAndUpdate.mockResolvedValue({ orgName: "SBT" });
    await settingsController.update(makeReq({ orgName: "SBT", owner: "evil", _id: "x" }), fakeRes(), jest.fn());
    expect(Settings.findOneAndUpdate).toHaveBeenCalledWith({ owner: "owner1" }, { $set: { orgName: "SBT" } }, expect.anything());
  });

  test("changing the UPI ID raises an alert naming the old and new value", async () => {
    Settings.findOne.mockResolvedValue({ upiId: "old@upi" });
    Settings.findOneAndUpdate.mockResolvedValue({ upiId: "new@upi" });
    await settingsController.update(makeReq({ upiId: "new@upi" }), fakeRes(), jest.fn());
    expect(sendAlert).toHaveBeenCalledTimes(1);
    const text = sendAlert.mock.calls[0][0];
    expect(text).toMatch(/old@upi/);
    expect(text).toMatch(/new@upi/);
  });

  test("saving the same UPI ID again, or other settings, raises no alert", async () => {
    Settings.findOne.mockResolvedValue({ upiId: "same@upi" });
    Settings.findOneAndUpdate.mockResolvedValue({ upiId: "same@upi" });
    await settingsController.update(makeReq({ upiId: "same@upi" }), fakeRes(), jest.fn());
    await settingsController.update(makeReq({ orgName: "SBT" }), fakeRes(), jest.fn());
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
