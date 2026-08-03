/**
 * Covers the merged Order/Purchase flow in purchaseController.js:
 *  - source:"order"  -> created Pending, stock untouched until paid in full
 *  - source:"manual" -> stock bumped immediately on creation
 *  - recordPayment   -> only a full payment on a still-Pending order calls
 *                       stockService.recordStockIn; a partial payment doesn't
 *  - remove          -> reverses the ledger under the right sourceType
 *
 * Models and services are mocked (no real MongoDB in this sandbox), same
 * style as tests/services/stockService.test.js.
 */

jest.mock("../../models/Purchase");
jest.mock("../../models/Item");
jest.mock("../../models/Vendor");
jest.mock("../../services/ledgerService");
jest.mock("../../services/stockService");
jest.mock("../../utils/withTransaction", () => ({
  withTransaction: (fn) => fn(null),
}));

const Purchase = require("../../models/Purchase");
const Item = require("../../models/Item");
const Vendor = require("../../models/Vendor");
const ledgerService = require("../../services/ledgerService");
const stockService = require("../../services/stockService");
const controller = require("../../controllers/purchaseController");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

/** A mutable fake doc that behaves enough like a Mongoose doc for the controller's needs. */
function fakeDoc(overrides = {}) {
  return {
    _id: "doc1",
    owner: "owner1",
    itemId: "item1",
    vendorId: "vendor1",
    qty: 10,
    rate: 5,
    amount: 50,
    amountPaid: 0,
    paymentStatus: "unpaid",
    source: "order",
    status: "Pending",
    date: "2026-08-03",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Item.findOne.mockResolvedValue({ _id: "item1", name: "Widget" });
  Vendor.findOne.mockResolvedValue({ _id: "vendor1", name: "Acme Supplies" });
  stockService.recordStockIn.mockResolvedValue({ item: { _id: "item1", stock: 10 }, movement: {} });
  ledgerService.postEntries.mockResolvedValue(undefined);
  ledgerService.reverseSource.mockResolvedValue(undefined);
});

describe("create — source:order", () => {
  test("a priced order is created Pending and does NOT touch stock yet", async () => {
    const doc = fakeDoc();
    Purchase.create.mockResolvedValue([doc]);

    const req = { userId: "owner1", body: { source: "order", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 5 } };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(Purchase.create).toHaveBeenCalledWith(
      [expect.objectContaining({ source: "order", status: "Pending", amount: 50 })],
      expect.anything()
    );
    expect(stockService.recordStockIn).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("a zero-rate (free) order completes immediately", async () => {
    const doc = fakeDoc({ rate: 0, amount: 0 });
    Purchase.create.mockResolvedValue([doc]);

    const req = { userId: "owner1", body: { source: "order", itemId: "item1", qty: 10, rate: 0 } };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(stockService.recordStockIn).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "Order", itemId: "item1", qty: 10, rate: 0 })
    );
    expect(doc.status).toBe("Received");
  });
});

describe("create — source:manual", () => {
  test("stock is bumped immediately, regardless of payment status", async () => {
    const doc = fakeDoc({ source: "manual", status: "Pending", paymentStatus: "unpaid" });
    Purchase.create.mockResolvedValue([doc]);

    const req = { userId: "owner1", body: { source: "manual", itemId: "item1", vendorId: "vendor1", qty: 10, rate: 5 } };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());

    expect(stockService.recordStockIn).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "Purchase", qty: 10, rate: 5 })
    );
    expect(doc.status).toBe("Received");
  });

  test("rejects when no vendor is found", async () => {
    Vendor.findOne.mockResolvedValue(null);
    const req = { userId: "owner1", body: { source: "manual", itemId: "item1", vendorId: "bad", qty: 10, rate: 5 } };
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(stockService.recordStockIn).not.toHaveBeenCalled();
  });
});

describe("recordPayment", () => {
  test("a partial payment on a Pending order does not touch stock or post ledger entries", async () => {
    const doc = fakeDoc({ amount: 100, amountPaid: 0 });
    Purchase.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(doc) });

    const req = { userId: "owner1", params: { id: "doc1" }, body: { amount: 40 } };
    const res = fakeRes();
    await controller.recordPayment(req, res, jest.fn());

    expect(doc.amountPaid).toBe(40);
    expect(doc.paymentStatus).toBe("partial");
    expect(doc.status).toBe("Pending");
    expect(stockService.recordStockIn).not.toHaveBeenCalled();
    expect(ledgerService.postEntries).not.toHaveBeenCalled();
  });

  test("paying an order off in full triggers the stock increase", async () => {
    const doc = fakeDoc({ amount: 100, amountPaid: 60 });
    Purchase.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(doc) });

    const req = { userId: "owner1", params: { id: "doc1" }, body: { amount: 40 } };
    const res = fakeRes();
    await controller.recordPayment(req, res, jest.fn());

    expect(doc.amountPaid).toBe(100);
    expect(doc.paymentStatus).toBe("paid");
    expect(doc.status).toBe("Received");
    expect(stockService.recordStockIn).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "Order" }));
  });

  test("settling a remaining balance on an already-received manual purchase posts ledger only, no stock change", async () => {
    const doc = fakeDoc({ source: "manual", status: "Received", amount: 100, amountPaid: 60, paymentStatus: "partial" });
    Purchase.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(doc) });

    const req = { userId: "owner1", params: { id: "doc1" }, body: { amount: 40 } };
    const res = fakeRes();
    await controller.recordPayment(req, res, jest.fn());

    expect(doc.paymentStatus).toBe("paid");
    expect(stockService.recordStockIn).not.toHaveBeenCalled();
    expect(ledgerService.postEntries).toHaveBeenCalledTimes(1);
  });

  test("rejects paying an order that's already fully paid and received", async () => {
    const doc = fakeDoc({ source: "order", status: "Received", amount: 100, amountPaid: 100, paymentStatus: "paid" });
    Purchase.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(doc) });

    const req = { userId: "owner1", params: { id: "doc1" }, body: { amount: 10 } };
    const res = fakeRes();
    await controller.recordPayment(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("remove", () => {
  test("reverses the ledger under sourceType Order for an order-sourced doc", async () => {
    Purchase.findOneAndDelete.mockResolvedValue(fakeDoc({ source: "order" }));
    const req = { userId: "owner1", params: { id: "doc1" } };
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(ledgerService.reverseSource).toHaveBeenCalledWith("owner1", "Order", "doc1", expect.any(String));
  });

  test("reverses the ledger under sourceType Purchase for a manual doc", async () => {
    Purchase.findOneAndDelete.mockResolvedValue(fakeDoc({ source: "manual" }));
    const req = { userId: "owner1", params: { id: "doc1" } };
    const res = fakeRes();
    await controller.remove(req, res, jest.fn());
    expect(ledgerService.reverseSource).toHaveBeenCalledWith("owner1", "Purchase", "doc1", expect.any(String));
  });
});
