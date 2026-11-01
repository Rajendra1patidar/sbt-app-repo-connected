/**
 * Estimate integrity rules in documentController.js:
 *  - the SERVER rebuilds the total from the bill's own lines
 *  - new bills never fold an earlier balance into the total or mark older
 *    estimates Paid (that used to inflate sales and make old dues vanish)
 *  - editing an OLD bill keeps the previousDue it was created with
 *  - the same save request is only ever acted on once
 *  - staff can't re-price an estimate that already has payments
 *
 * Models and services are mocked (no MongoDB here), same style as
 * documentController.test.js.
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
jest.mock("../../utils/withTransaction", () => ({ withTransaction: (fn) => fn(null) }));
jest.mock("../../utils/idempotency", () => ({ begin: jest.fn() }));

const Document = require("../../models/Document");
const Item = require("../../models/Item");
const FinancialYear = require("../../models/FinancialYear");
const Counter = require("../../models/Counter");
const ledgerService = require("../../services/ledgerService");
const stockService = require("../../services/stockService");
const idempotency = require("../../utils/idempotency");
const controller = require("../../controllers/documentController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

function fakeEstimate(overrides = {}) {
  return {
    _id: "doc1", owner: "owner1", type: "estimate", number: "EST-0001", date: "2026-10-05",
    total: 200, amountPaid: 0, status: "Due", cogsTotal: 60,
    lines: [{ itemId: "item1", qty: 2, rate: 100 }],
    freightCost: 0, labourCost: 0, previousDue: 0,
    returns: [], deleted: false, updatedAt: new Date("2026-10-05T10:00:00Z"),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let handle;
beforeEach(() => {
  jest.clearAllMocks();
  FinancialYear.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
  ledgerService.postEntries.mockResolvedValue(undefined);
  ledgerService.reverseSource.mockResolvedValue(undefined);
  handle = { replay: false, inProgress: false, response: null, finish: jest.fn().mockResolvedValue(undefined), abort: jest.fn().mockResolvedValue(undefined) };
  idempotency.begin.mockResolvedValue(handle);
});

describe("create(estimate): the server owns the total", () => {
  const body = (extra = {}) => ({
    customerId: "c1", date: "2026-10-05",
    lines: [{ itemId: "item1", qty: 2, rate: 100 }],
    freightCost: 50, total: 250, ...extra,
  });
  const makeReq = (b, extra = {}) => ({ userId: "owner1", get: () => "key-1", body: b, ...extra });
  const created = () => Document.create.mock.calls[0][0][0];

  beforeEach(() => {
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 1 });
    Document.create.mockResolvedValue([fakeEstimate({ total: 250 })]);
    Item.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: "item1", name: "Cement", unit: "bag", trackingMode: "unit", purchasePrice: 30, stock: 100 }) });
    stockService.recordStockOut.mockResolvedValue({ item: { _id: "item1", stock: 98, lowStock: 5 }, cogsAmount: 60 });
  });

  test("saves the total rebuilt from the lines, not the figure the app sent, and says so", async () => {
    const res = fakeRes();
    await controller.create("estimate")(makeReq(body({ total: 99999 })), res, jest.fn());
    expect(created().total).toBe(250);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].totalAdjusted).toEqual({ sent: 99999, saved: 250 });
  });

  test("a total that matches to within a rupee is not reported as adjusted", async () => {
    const res = fakeRes();
    await controller.create("estimate")(makeReq(body({ total: 250.4 })), res, jest.fn());
    expect(created().total).toBe(250);
    expect(res.json.mock.calls[0][0].totalAdjusted).toBeUndefined();
  });

  test("never rolls an earlier balance into the total, and never touches older estimates", async () => {
    const res = fakeRes();
    await controller.create("estimate")(
      makeReq(body({ previousDue: 12400, previousBalance: 12400, rolledEstimateIds: ["old1", "old2"], total: 12650 })),
      res, jest.fn()
    );
    expect(created().total).toBe(250); // 2 x 100 + 50 freight - the 12,400 is NOT added
    expect(created().previousDue).toBe(0);
    expect(created().previousBalance).toBe(12400); // kept as information for the printed bill
    expect(Document.find).not.toHaveBeenCalled(); // no older estimate was looked up or marked Paid
  });

  test("a previousBalance that is not a positive number is stored as 0", async () => {
    for (const previousBalance of [-5, "abc", undefined, 0]) {
      Document.create.mockClear();
      await controller.create("estimate")(makeReq(body({ previousBalance })), fakeRes(), jest.fn());
      expect(created().previousBalance).toBe(0);
    }
  });

  test("a bill created as already Paid records the rebuilt total as the amount paid", async () => {
    await controller.create("estimate")(makeReq(body({ status: "Paid", total: 999 })), fakeRes(), jest.fn());
    expect(created().total).toBe(250);
    expect(created().amountPaid).toBe(250);
  });

  test("a successful save stores the result under the idempotency key", async () => {
    await controller.create("estimate")(makeReq(body()), fakeRes(), jest.fn());
    expect(idempotency.begin).toHaveBeenCalledWith("owner1", "key-1");
    expect(handle.finish).toHaveBeenCalledTimes(1);
    expect(handle.abort).not.toHaveBeenCalled();
  });

  test("a retry of a save that already went through returns the first answer and creates nothing", async () => {
    idempotency.begin.mockResolvedValue({ ...handle, replay: true, response: { doc: { number: "EST-0007" } } });
    const res = fakeRes();
    await controller.create("estimate")(makeReq(body()), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ doc: { number: "EST-0007" } });
    expect(Document.create).not.toHaveBeenCalled();
    expect(stockService.recordStockOut).not.toHaveBeenCalled();
  });

  test("a duplicate that arrives while the first is still running gets a 409 and creates nothing", async () => {
    idempotency.begin.mockResolvedValue({ ...handle, inProgress: true });
    const res = fakeRes();
    await controller.create("estimate")(makeReq(body()), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(Document.create).not.toHaveBeenCalled();
  });

  test("a save that fails releases the key so the retry can really run", async () => {
    Item.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: "item1", name: "Cement", unit: "bag", trackingMode: "unit", purchasePrice: 30, stock: 1 }) });
    const res = fakeRes();
    await controller.create("estimate")(makeReq(body()), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400); // not enough stock
    expect(handle.abort).toHaveBeenCalledTimes(1);
    expect(handle.finish).not.toHaveBeenCalled();
  });

  test("a challan keeps its own total (only estimates are rebuilt)", async () => {
    Document.create.mockResolvedValue([fakeEstimate({ type: "challan" })]);
    await controller.create("challan")(makeReq({ customerId: "c1", date: "2026-10-05", lines: [{ itemId: "item1", qty: 2, rate: 100 }], total: 777 }), fakeRes(), jest.fn());
    expect(created().total).toBe(777);
  });
});

describe("update(estimate)", () => {
  const makeReq = (b, extra = {}) => ({ userId: "owner1", params: { id: "doc1" }, body: b, ...extra });
  const setOf = () => Document.findOneAndUpdate.mock.calls[0][1].$set;

  test("editing an OLD bill keeps the previous due it was created with", async () => {
    // an old bill: 2 x 100 + 1,000 previous due that was folded into its total
    const existing = fakeEstimate({ total: 1200, previousDue: 1000 });
    Document.findOne.mockResolvedValue(existing);
    Document.findOneAndUpdate.mockResolvedValue(fakeEstimate({ total: 1300, previousDue: 1000 }));

    // an older app version sends previousDue: 0 and a total without it
    await controller.update("estimate")(makeReq({ freightCost: 100, previousDue: 0, total: 300 }), fakeRes(), jest.fn());

    expect(setOf().total).toBe(1300); // 200 + 100 freight + the 1,000 it already carried
    expect("previousDue" in setOf()).toBe(false);
  });

  test("the rebuilt total wins over a figure the app sends with an edit", async () => {
    Document.findOne.mockResolvedValue(fakeEstimate());
    Document.findOneAndUpdate.mockResolvedValue(fakeEstimate({ total: 250 }));
    const res = fakeRes();
    await controller.update("estimate")(makeReq({ freightCost: 50, total: 5 }), res, jest.fn());
    expect(setOf().total).toBe(250);
    expect(res.json.mock.calls[0][0].totalAdjusted).toEqual({ sent: 5, saved: 250 });
  });

  test("an edit that touches no money fields leaves the total alone", async () => {
    Document.findOne.mockResolvedValue(fakeEstimate({ total: 1234 }));
    Document.findOneAndUpdate.mockResolvedValue(fakeEstimate({ total: 1234, notes: "x" }));
    await controller.update("estimate")(makeReq({ notes: "deliver after 5pm" }), fakeRes(), jest.fn());
    expect("total" in setOf()).toBe(false);
  });

  test("identity and server-kept fields in the body are ignored", async () => {
    Document.findOne.mockResolvedValue(fakeEstimate());
    Document.findOneAndUpdate.mockResolvedValue(fakeEstimate());
    await controller.update("estimate")(
      makeReq({ notes: "ok", owner: "someoneElse", number: "EST-9999", type: "challan", history: [], cogsTotal: 1, deleted: true, createdAt: "x" }),
      fakeRes(), jest.fn()
    );
    const set = setOf();
    expect(set.notes).toBe("ok");
    for (const k of ["owner", "number", "type", "history", "cogsTotal", "deleted", "createdAt"]) expect(k in set).toBe(false);
  });

  describe("staff and estimates that already have payments", () => {
    const paid = () => fakeEstimate({ status: "Paid", amountPaid: 200 });

    test("staff cannot change the amounts", async () => {
      Document.findOne.mockResolvedValue(paid());
      const res = fakeRes();
      await controller.update("estimate")(makeReq({ freightCost: 500 }, { role: "staff" }), res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(Document.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("staff cannot swap the lines or the customer either", async () => {
      Document.findOne.mockResolvedValue(paid());
      const a = fakeRes();
      await controller.update("estimate")(makeReq({ lines: [{ itemId: "item1", qty: 1, rate: 100 }] }, { role: "staff" }), a, jest.fn());
      expect(a.status).toHaveBeenCalledWith(403);
      const b = fakeRes();
      await controller.update("estimate")(makeReq({ customerId: "someoneElse" }, { role: "staff" }), b, jest.fn());
      expect(b.status).toHaveBeenCalledWith(403);
    });

    test("staff can still edit notes, and re-send an unchanged form", async () => {
      Document.findOne.mockResolvedValue(paid());
      Document.findOneAndUpdate.mockResolvedValue(paid());
      const res = fakeRes();
      // the edit form sends every field, unchanged ones included
      await controller.update("estimate")(
        makeReq({ notes: "ok", freightCost: 0, labourCost: 0, lines: [{ itemId: "item1", qty: 2, rate: 100 }] }, { role: "staff" }),
        res, jest.fn()
      );
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(Document.findOneAndUpdate).toHaveBeenCalled();
    });

    test("staff can re-price an estimate that has no payments yet", async () => {
      Document.findOne.mockResolvedValue(fakeEstimate());
      Document.findOneAndUpdate.mockResolvedValue(fakeEstimate({ total: 700 }));
      const res = fakeRes();
      await controller.update("estimate")(makeReq({ freightCost: 500 }, { role: "staff" }), res, jest.fn());
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    test("the owner can re-price a paid estimate", async () => {
      Document.findOne.mockResolvedValue(paid());
      Document.findOneAndUpdate.mockResolvedValue(paid());
      const res = fakeRes();
      await controller.update("estimate")(makeReq({ freightCost: 500 }, { role: "owner" }), res, jest.fn());
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(Document.findOneAndUpdate).toHaveBeenCalled();
    });
  });
});
