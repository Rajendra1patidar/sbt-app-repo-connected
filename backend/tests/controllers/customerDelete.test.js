/**
 * A customer with any history can't be deleted (it would leave their bills and
 * payments pointing at nobody), so "delete" archives them instead and they can be
 * restored. One with no history at all is still removed for good.
 */
jest.mock("../../models/Customer");
jest.mock("../../models/Document");
jest.mock("../../models/Payment");
jest.mock("../../models/LabourSession");
jest.mock("../../models/LedgerEntry");
jest.mock("../../services/customerPortalService");
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn() }));

const Customer = require("../../models/Customer");
const Document = require("../../models/Document");
const Payment = require("../../models/Payment");
const LabourSession = require("../../models/LabourSession");
const LedgerEntry = require("../../models/LedgerEntry");
const { logAudit } = require("../../services/auditLogger");
const controller = require("../../controllers/customerController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const req = { userId: "owner1", actorId: "owner1", params: { id: "c1" } };

beforeEach(() => {
  jest.clearAllMocks();
  Customer.findOne.mockResolvedValue({ _id: "c1", name: "Ramesh Patel" });
  Document.countDocuments.mockResolvedValue(0);
  Payment.countDocuments.mockResolvedValue(0);
  LabourSession.countDocuments.mockResolvedValue(0);
  LedgerEntry.countDocuments.mockResolvedValue(0);
});

describe("customer delete", () => {
  test("archives instead of refusing when the customer has bills or payments", async () => {
    Document.countDocuments.mockResolvedValue(14);
    Payment.countDocuments.mockResolvedValue(1);
    const archivedDoc = { _id: "c1", name: "Ramesh Patel", archived: true };
    Customer.findOneAndUpdate.mockResolvedValue(archivedDoc);
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(Customer.findOneAndDelete).not.toHaveBeenCalled();
    expect(Customer.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "c1", owner: "owner1" },
      { $set: { archived: true, archivedAt: expect.any(Date) } },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith({ message: "Archived", archived: true, id: "c1", customer: archivedDoc });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "update", model: "Customer", changedFields: ["archived"] }));
  });

  test("archives when the customer only has labour jobs, or only ledger entries", async () => {
    Customer.findOneAndUpdate.mockResolvedValue({ _id: "c1", archived: true });
    LabourSession.countDocuments.mockResolvedValue(2);
    const a = fakeRes();
    await controller.remove(req, a, jest.fn());
    expect(a.json.mock.calls[0][0].archived).toBe(true);

    LabourSession.countDocuments.mockResolvedValue(0);
    LedgerEntry.countDocuments.mockResolvedValue(3);
    const b = fakeRes();
    await controller.remove(req, b, jest.fn());
    expect(b.json.mock.calls[0][0].archived).toBe(true);
    expect(Customer.findOneAndDelete).not.toHaveBeenCalled();
  });

  test("archiving a customer who is already archived changes nothing and logs nothing", async () => {
    Customer.findOne.mockResolvedValue({ _id: "c1", name: "Ramesh Patel", archived: true });
    Document.countDocuments.mockResolvedValue(3);
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(Customer.findOneAndUpdate).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].archived).toBe(true);
  });

  test("the history check is scoped to this owner and this customer", async () => {
    await controller.remove(req, fakeRes(), jest.fn());
    expect(Document.countDocuments).toHaveBeenCalledWith({ owner: "owner1", customerId: "c1" });
  });

  test("goes ahead and deletes a customer with no history at all", async () => {
    Customer.findOneAndDelete.mockResolvedValue({ _id: "c1" });
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(Customer.findOneAndDelete).toHaveBeenCalledWith({ _id: "c1", owner: "owner1" });
    expect(Customer.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: "Deleted", id: "c1" });
  });

  test("404s for a customer that does not exist", async () => {
    Customer.findOne.mockResolvedValue(null);
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("customer restore", () => {
  test("clears the archived flag, scoped to this owner, and logs it", async () => {
    const doc = { _id: "c1", name: "Ramesh Patel", archived: false };
    Customer.findOneAndUpdate.mockResolvedValue(doc);
    const res = fakeRes();
    await controller.restoreCustomer(req, res, jest.fn());
    expect(Customer.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "c1", owner: "owner1" },
      { $set: { archived: false, archivedAt: null } },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith(doc);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ changedFields: ["archived"] }));
  });

  test("404s for a customer that does not exist", async () => {
    Customer.findOneAndUpdate.mockResolvedValue(null);
    const res = fakeRes();
    await controller.restoreCustomer(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("archiving through an ordinary save", () => {
  test("create and update ignore archived / archivedAt from the request body", async () => {
    Customer.find.mockResolvedValue([]);
    Customer.create.mockResolvedValue({ _id: "c2", name: "New" });
    const createRes = fakeRes();
    await controller.create({ ...req, body: { name: "New", archived: true, archivedAt: "2026-01-01" } }, createRes, jest.fn());
    expect(Customer.create).toHaveBeenCalledWith({ name: "New", owner: "owner1" });

    Customer.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "c1", name: "A" }) });
    Customer.findOneAndUpdate.mockResolvedValue({ _id: "c1", name: "B" });
    await controller.update({ ...req, body: { name: "B", archived: true } }, fakeRes(), jest.fn());
    expect(Customer.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { name: "B" } });
  });

  test("creating someone who exists but is archived says to restore them", async () => {
    Customer.find.mockResolvedValue([{ _id: "c1", name: "Ramesh Patel", phone: "98765 43210", archived: true }]);
    const res = fakeRes();
    await controller.create({ ...req, body: { name: "ramesh patel", phone: "9876543210" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/archived/i);
    expect(Customer.create).not.toHaveBeenCalled();
  });
});
