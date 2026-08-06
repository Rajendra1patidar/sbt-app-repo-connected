/**
 * Covers the approval-gate branch added to purchaseController.create: a
 * staff account creating a manual purchase above the configured threshold
 * should queue an ApprovalRequest instead of creating the Purchase, while
 * an owner (or an order, or a staff purchase under the threshold) should
 * go through exactly as before. Mocking style matches
 * tests/controllers/purchaseController.test.js.
 */

jest.mock("../../models/Purchase");
jest.mock("../../models/Item");
jest.mock("../../models/Vendor");
jest.mock("../../models/Settings");
jest.mock("../../models/ApprovalRequest");
jest.mock("../../services/ledgerService");
jest.mock("../../services/stockService");
jest.mock("../../services/eventBus");
jest.mock("../../utils/withTransaction", () => ({
  withTransaction: (fn) => fn(null),
}));

const Purchase = require("../../models/Purchase");
const Item = require("../../models/Item");
const Vendor = require("../../models/Vendor");
const Settings = require("../../models/Settings");
const ApprovalRequest = require("../../models/ApprovalRequest");
const stockService = require("../../services/stockService");
const eventBus = require("../../services/eventBus");
const controller = require("../../controllers/purchaseController");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function fakeDoc(overrides = {}) {
  return {
    _id: "doc1", owner: "owner1", itemId: "item1", vendorId: "vendor1",
    qty: 10, rate: 500, amount: 5000, amountPaid: 0, paymentStatus: "unpaid",
    source: "manual", status: "Pending", date: "2026-08-06",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Item.findOne.mockResolvedValue({ _id: "item1", name: "Cement Bag" });
  Vendor.findOne.mockResolvedValue({ _id: "vendor1", name: "Acme Supplies" });
  stockService.recordStockIn.mockResolvedValue({ item: { _id: "item1", stock: 10 }, movement: {} });
});

describe("purchaseController.create — approval gate", () => {
  test("staff purchase above the threshold queues an approval instead of creating a Purchase", async () => {
    Settings.findOne.mockResolvedValue({ approvalThreshold: 2000 });
    ApprovalRequest.create.mockResolvedValue({ _id: "approval1" });

    const req = {
      userId: "owner1", role: "staff", actorId: "staff1",
      body: { source: "manual", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 500 }, // amount 5000
    };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(ApprovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "owner1", requestedBy: "staff1", type: "purchase", amount: 5000 })
    );
    expect(Purchase.create).not.toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalledWith("approval.requested", expect.objectContaining({ approvalId: "approval1" }));
    expect(res.status).toHaveBeenCalledWith(202);
  });

  test("staff purchase under the threshold goes through normally", async () => {
    Settings.findOne.mockResolvedValue({ approvalThreshold: 10000 });
    const doc = fakeDoc();
    Purchase.create.mockResolvedValue([doc]);

    const req = {
      userId: "owner1", role: "staff", actorId: "staff1",
      body: { source: "manual", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 500 },
    };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(ApprovalRequest.create).not.toHaveBeenCalled();
    expect(Purchase.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("threshold of 0 (disabled) never gates, even for staff", async () => {
    Settings.findOne.mockResolvedValue({ approvalThreshold: 0 });
    const doc = fakeDoc();
    Purchase.create.mockResolvedValue([doc]);

    const req = {
      userId: "owner1", role: "staff", actorId: "staff1",
      body: { source: "manual", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 500 },
    };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(ApprovalRequest.create).not.toHaveBeenCalled();
    expect(Purchase.create).toHaveBeenCalled();
  });

  test("the owner's own purchase is never gated, regardless of amount", async () => {
    Settings.findOne.mockResolvedValue({ approvalThreshold: 100 });
    const doc = fakeDoc();
    Purchase.create.mockResolvedValue([doc]);

    const req = {
      userId: "owner1", role: "owner", actorId: "owner1",
      body: { source: "manual", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 500 },
    };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(Settings.findOne).not.toHaveBeenCalled();
    expect(ApprovalRequest.create).not.toHaveBeenCalled();
    expect(Purchase.create).toHaveBeenCalled();
  });

  test("a staff-created order (not manual) is never gated", async () => {
    Settings.findOne.mockResolvedValue({ approvalThreshold: 100 });
    const doc = fakeDoc({ source: "order" });
    Purchase.create.mockResolvedValue([doc]);

    const req = {
      userId: "owner1", role: "staff", actorId: "staff1",
      body: { source: "order", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 500 },
    };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(Settings.findOne).not.toHaveBeenCalled();
    expect(ApprovalRequest.create).not.toHaveBeenCalled();
    expect(Purchase.create).toHaveBeenCalled();
  });
});
