/**
 * A customer with any history can't be deleted (it would leave their bills and
 * payments pointing at nobody). One with no history still can.
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
  test("is refused, with the reason, when the customer has bills or payments", async () => {
    Document.countDocuments.mockResolvedValue(14);
    Payment.countDocuments.mockResolvedValue(1);
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    const message = res.json.mock.calls[0][0].message;
    expect(message).toMatch(/Ramesh Patel/);
    expect(message).toMatch(/14 bills/);
    expect(message).toMatch(/1 payment\b/);
    expect(Customer.findOneAndDelete).not.toHaveBeenCalled();
  });

  test("is refused when the customer only has labour jobs, or only ledger entries", async () => {
    LabourSession.countDocuments.mockResolvedValue(2);
    const a = fakeRes();
    await controller.remove(req, a, jest.fn());
    expect(a.status).toHaveBeenCalledWith(409);

    LabourSession.countDocuments.mockResolvedValue(0);
    LedgerEntry.countDocuments.mockResolvedValue(3);
    const b = fakeRes();
    await controller.remove(req, b, jest.fn());
    expect(b.status).toHaveBeenCalledWith(409);
    expect(Customer.findOneAndDelete).not.toHaveBeenCalled();
  });

  test("the history check is scoped to this owner and this customer", async () => {
    await controller.remove(req, fakeRes(), jest.fn());
    expect(Document.countDocuments).toHaveBeenCalledWith({ owner: "owner1", customerId: "c1" });
  });

  test("goes ahead for a customer with no history at all", async () => {
    Customer.findOneAndDelete.mockResolvedValue({ _id: "c1" });
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(Customer.findOneAndDelete).toHaveBeenCalledWith({ _id: "c1", owner: "owner1" });
    expect(res.json).toHaveBeenCalledWith({ message: "Deleted", id: "c1" });
  });

  test("404s for a customer that does not exist", async () => {
    Customer.findOne.mockResolvedValue(null);
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
