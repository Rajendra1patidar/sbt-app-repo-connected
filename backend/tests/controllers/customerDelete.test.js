/**
 * Customers are archived, never deleted: DELETE hides the customer but leaves their bills,
 * payments and ledger entries pointing at them. Only the owner can archive or restore, and the
 * archive flag can't be set through a normal save.
 */
jest.mock("../../models/Customer");
jest.mock("../../services/customerPortalService");
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn(() => []) }));

const Customer = require("../../models/Customer");
const { logAudit } = require("../../services/auditLogger");
const controller = require("../../controllers/customerController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const req = (extra = {}) => ({ userId: "owner1", actorId: "owner1", params: { id: "c1" }, body: {}, ...extra });
const archivedDoc = { _id: "c1", name: "Ramesh Patel", archived: true };

beforeEach(() => {
  jest.clearAllMocks();
  Customer.findOneAndUpdate.mockResolvedValue(archivedDoc);
});

describe("customer delete = archive", () => {
  test("archives instead of deleting, whatever the customer's history", async () => {
    const res = fakeRes();
    await controller.remove(req(), res, jest.fn());
    const [filter, update] = Customer.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "c1", owner: "owner1" });
    expect(update.$set.archived).toBe(true);
    expect(update.$set.archivedAt).toBeTruthy();
    expect(Customer.findOneAndDelete).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "Archived", id: "c1", archived: true, customer: archivedDoc });
  });

  test("is recorded in the audit log", async () => {
    await controller.remove(req(), fakeRes(), jest.fn());
    expect(logAudit).toHaveBeenCalled();
    expect(logAudit.mock.calls[0][0].label).toMatch(/Ramesh Patel.*archived/);
  });

  test("404s for a customer that does not exist (or belongs to someone else)", async () => {
    Customer.findOneAndUpdate.mockResolvedValue(null);
    const res = fakeRes();
    await controller.remove(req(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("customer restore", () => {
  test("clears the archive flag", async () => {
    Customer.findOneAndUpdate.mockResolvedValue({ _id: "c1", name: "Ramesh Patel", archived: false });
    const res = fakeRes();
    await controller.restore(req(), res, jest.fn());
    const [filter, update] = Customer.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "c1", owner: "owner1" });
    expect(update.$set).toEqual({ archived: false, archivedAt: null });
    expect(res.json.mock.calls[0][0].message).toBe("Restored");
  });

  test("404s for a customer that does not exist", async () => {
    Customer.findOneAndUpdate.mockResolvedValue(null);
    const res = fakeRes();
    await controller.restore(req(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("the archive flag is not part of a normal save", () => {
  test("an edit cannot archive or un-archive a customer", async () => {
    Customer.find.mockResolvedValue([]);
    Customer.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "c1", name: "Old" }) });
    await controller.update(req({ body: { name: "New", phone: "9999999999", archived: true, archivedAt: "2026-01-01" } }), fakeRes(), jest.fn());
    const set = Customer.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.name).toBe("New");
    expect("archived" in set).toBe(false);
    expect("archivedAt" in set).toBe(false);
  });

  test("a new customer cannot be created already archived", async () => {
    Customer.find.mockResolvedValue([]);
    Customer.create.mockResolvedValue({ _id: "c2", name: "Fresh" });
    await controller.create(req({ body: { name: "Fresh", phone: "8888888888", archived: true } }), fakeRes(), jest.fn());
    expect("archived" in Customer.create.mock.calls[0][0]).toBe(false);
  });
});

describe("adding someone who is already in the archive", () => {
  test("says to restore them instead of adding them again", async () => {
    Customer.find.mockResolvedValue([{ _id: "c1", name: "Ramesh Patel", phone: "98765 43210", archived: true }]);
    const res = fakeRes();
    await controller.create(req({ body: { name: "ramesh patel", phone: "9876543210" } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/archive.*Restore/);
    expect(Customer.create).not.toHaveBeenCalled();
  });

  test("a live duplicate keeps the usual message", async () => {
    Customer.find.mockResolvedValue([{ _id: "c1", name: "Ramesh Patel", phone: "9876543210" }]);
    const res = fakeRes();
    await controller.create(req({ body: { name: "Ramesh Patel", phone: "9876543210" } }), res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ message: "A customer with this name and phone number already exists" });
  });
});
