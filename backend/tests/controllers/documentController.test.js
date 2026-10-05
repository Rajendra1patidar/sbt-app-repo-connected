/**
 * Covers the update() repost logic in documentController.js — specifically
 * the Bug 2 fix: a payment-status/amountPaid-only edit must repost the
 * ledger (so reports reflect the new status) WITHOUT touching stock, since
 * previously it ran a full restock + re-deduct cycle on every line even
 * though quantities never changed.
 *
 * Models and services are mocked (no real MongoDB in this sandbox), same
 * style as tests/controllers/purchaseController.test.js.
 */

jest.mock("../../models/Document");
jest.mock("../../models/Item");
jest.mock("../../models/FinancialYear");
jest.mock("../../models/Counter");
jest.mock("../../services/ledgerService");
jest.mock("../../services/stockService");
jest.mock("../../services/customerPortalService");
jest.mock("../../services/eventBus");
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn() }));
jest.mock("../../utils/withTransaction", () => ({
  withTransaction: (fn) => fn(null),
}));

const Document = require("../../models/Document");
const Item = require("../../models/Item");
const FinancialYear = require("../../models/FinancialYear");
const Counter = require("../../models/Counter");
const ledgerService = require("../../services/ledgerService");
const stockService = require("../../services/stockService");
const controller = require("../../controllers/documentController");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

/** A mutable fake estimate doc, mongoose-doc-enough for the controller's needs. */
function fakeEstimate(overrides = {}) {
  return {
    _id: "doc1",
    owner: "owner1",
    type: "estimate",
    number: "EST-0001",
    date: "2026-08-03",
    total: 1000,
    amountPaid: 0,
    status: "Due",
    cogsTotal: 300,
    lines: [{ itemId: "item1", qty: 10, rate: 100 }],
    returns: [],
    deleted: false,
    updatedAt: new Date("2026-08-03T10:00:00Z"),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  FinancialYear.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
  ledgerService.postEntries.mockResolvedValue(undefined);
  ledgerService.reverseSource.mockResolvedValue(undefined);
});

describe("update(estimate) — stock vs ledger repost split", () => {
  test("a status-only edit (marking Paid) reposts the ledger but never touches stock", async () => {
    const existing = fakeEstimate({ status: "Due", amountPaid: 0 });
    const updated = fakeEstimate({ status: "Paid", amountPaid: 1000 });
    Document.findOne.mockResolvedValue(existing);
    Document.findOneAndUpdate.mockResolvedValue(updated);

    const req = { userId: "owner1", params: { id: "doc1" }, body: { status: "Paid", amountPaid: 1000 } };
    const res = fakeRes();
    await controller.update("estimate")(req, res, jest.fn());

    // Ledger was reversed and reposted...
    expect(ledgerService.reverseSource).toHaveBeenCalledTimes(1);
    expect(ledgerService.postEntries).toHaveBeenCalled();
    // ...but stock was never touched, since the line items never changed.
    expect(stockService.recordReturnIn).not.toHaveBeenCalled();
    expect(stockService.recordStockOut).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  test("a status-only edit reuses the stored cogsTotal for the reposted COGS entry", async () => {
    const existing = fakeEstimate({ status: "Due", amountPaid: 0, cogsTotal: 450 });
    const updated = fakeEstimate({ status: "Paid", amountPaid: 1000, cogsTotal: 450 });
    Document.findOne.mockResolvedValue(existing);
    Document.findOneAndUpdate.mockResolvedValue(updated);

    const req = { userId: "owner1", params: { id: "doc1" }, body: { status: "Paid", amountPaid: 1000 } };
    const res = fakeRes();
    await controller.update("estimate")(req, res, jest.fn());

    const cogsPostCall = ledgerService.postEntries.mock.calls.find(
      (call) => call[0].some((e) => e.account === "COGS")
    );
    expect(cogsPostCall).toBeDefined();
    expect(cogsPostCall[0].find((e) => e.account === "COGS").amount).toBe(450);
  });

  test("a lines edit still fully reverses and re-deducts stock, same as before", async () => {
    const existing = fakeEstimate({ lines: [{ itemId: "item1", qty: 10, rate: 100 }] });
    const newLines = [{ itemId: "item1", qty: 15, rate: 100 }];
    const updated = fakeEstimate({ lines: newLines, total: 1500 });
    Document.findOne.mockResolvedValue(existing);
    Document.findOneAndUpdate.mockResolvedValue(updated);
    Item.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: "item1", name: "Widget", trackingMode: "count", purchasePrice: 80, stock: 100 }) });
    stockService.recordReturnIn.mockResolvedValue({ item: { _id: "item1", stock: 20 }, cogsReversal: 300 });
    stockService.recordStockOut.mockResolvedValue({ item: { _id: "item1", stock: 5, lowStock: 5 }, cogsAmount: 450 });

    const req = { userId: "owner1", params: { id: "doc1" }, body: { lines: newLines, total: 1500 } };
    const res = fakeRes();
    await controller.update("estimate")(req, res, jest.fn());

    expect(stockService.recordReturnIn).toHaveBeenCalledTimes(1); // reverses old line qty
    expect(stockService.recordStockOut).toHaveBeenCalledTimes(1); // re-deducts new line qty
    expect(ledgerService.reverseSource).toHaveBeenCalledTimes(1);
  });

  test("an edit to unrelated fields (e.g. notes) doesn't touch stock or the ledger at all", async () => {
    const existing = fakeEstimate();
    const updated = fakeEstimate({ notes: "Deliver after 5pm" });
    Document.findOne.mockResolvedValue(existing);
    Document.findOneAndUpdate.mockResolvedValue(updated);

    const req = { userId: "owner1", params: { id: "doc1" }, body: { notes: "Deliver after 5pm" } };
    const res = fakeRes();
    await controller.update("estimate")(req, res, jest.fn());

    expect(ledgerService.reverseSource).not.toHaveBeenCalled();
    expect(ledgerService.postEntries).not.toHaveBeenCalled();
    expect(stockService.recordReturnIn).not.toHaveBeenCalled();
    expect(stockService.recordStockOut).not.toHaveBeenCalled();
  });
});

describe("updateStatus — estimates can no longer have status set directly", () => {
  test("rejects the request for estimates before touching the database at all", async () => {
    const req = { userId: "owner1", params: { id: "doc1" }, body: { status: "Paid" } };
    const res = fakeRes();
    await controller.updateStatus("estimate")(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("record a payment") }));
    expect(Document.findOne).not.toHaveBeenCalled();
    expect(Document.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("still allows direct status changes for challans (Pending <-> Delivered is not payment-derived)", async () => {
    const existing = { _id: "doc2", owner: "owner1", type: "challan", date: "2026-08-03", deleted: false };
    Document.findOne.mockResolvedValue(existing);
    Document.findOneAndUpdate.mockResolvedValue({ ...existing, status: "Delivered" });

    const req = { userId: "owner1", params: { id: "doc2" }, body: { status: "Delivered" } };
    const res = fakeRes();
    await controller.updateStatus("challan")(req, res, jest.fn());

    expect(Document.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "Delivered" }));
  });
});


describe("create(estimate) — blocks overselling beyond total stock across all godowns", () => {
  const itemWith = (o) => ({ session: jest.fn().mockResolvedValue({ _id: "item1", name: "Cement PPC", unit: "bag", trackingMode: "unit", purchasePrice: 300, ...o }) });
  const makeReq = (lines) => ({ userId: "owner1", get: () => undefined, body: { customerId: "c1", date: "2026-10-05", lines, total: 1000 } });

  beforeEach(() => {
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 1 });
    Document.create.mockResolvedValue([fakeEstimate()]);
  });

  test("rejects with 400 when qty is greater than total stock, and deducts nothing", async () => {
    Item.findOne.mockReturnValue(itemWith({ stock: 10 }));
    const res = fakeRes(); const next = jest.fn();
    await controller.create("estimate")(makeReq([{ itemId: "item1", qty: 11, rate: 100 }]), res, next);
    expect(stockService.recordStockOut).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/Not enough stock across all godowns/);
  });

  test("sums multiple rows of the same item before comparing", async () => {
    Item.findOne.mockReturnValue(itemWith({ stock: 10 }));
    const res = fakeRes();
    await controller.create("estimate")(makeReq([{ itemId: "item1", qty: 6, rate: 100 }, { itemId: "item1", qty: 6, rate: 100 }]), res, jest.fn());
    expect(stockService.recordStockOut).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("allows selling exactly the total stock", async () => {
    Item.findOne.mockReturnValue(itemWith({ stock: 10 }));
    stockService.recordStockOut.mockResolvedValue({ item: { _id: "item1", stock: 0, lowStock: 5 }, cogsAmount: 3000 });
    const res = fakeRes();
    await controller.create("estimate")(makeReq([{ itemId: "item1", qty: 10, rate: 100 }]), res, jest.fn());
    expect(stockService.recordStockOut).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  test("weight-mode items check kg and pieces separately", async () => {
    Item.findOne.mockReturnValue(itemWith({ trackingMode: "weight", stock: 5, stockKg: 100 }));
    const res = fakeRes();
    await controller.create("estimate")(makeReq([{ itemId: "item1", qty: 50, piecesQty: 6, rate: 100 }]), res, jest.fn());
    expect(stockService.recordStockOut).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/pcs/);
  });
});
