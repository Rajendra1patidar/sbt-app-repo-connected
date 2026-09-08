/**
 * Unit tests for stockService.
 *
 * These mock the Item / StockMovement models directly rather than spinning up
 * a real MongoDB (this sandbox has no network access to download a mongod
 * binary for mongodb-memory-server). That means the optimistic-concurrency
 * *mechanism* — findOneAndUpdate conditioned on updatedAt — isn't exercised
 * against a real database's actual concurrency behaviour, but every piece of
 * business logic that lives in this file (weighted-average cost math, the
 * retry loop, stock clamping, valuation totals) is fully covered.
 */

jest.mock("../../models/Item");
jest.mock("../../models/StockMovement");
jest.mock("../../models/Godown");

const Item = require("../../models/Item");
const StockMovement = require("../../models/StockMovement");
const Godown = require("../../models/Godown");
const {
  recordStockIn,
  recordStockOut,
  recordReturnIn,
  stockValuation,
  applySaleGodownDelta,
} = require("../../services/stockService");

/** Builds a fake Item doc as Item.findOne(...).session(...) would resolve to. */
function fakeItem(overrides = {}) {
  return {
    _id: "item1",
    owner: "owner1",
    stock: 0,
    purchasePrice: 0,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Wires Item.findOne to return `doc` (or null) via the .session() chain the code uses. */
function mockFindOne(doc) {
  Item.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(doc) });
}

beforeEach(() => {
  jest.clearAllMocks();
  // No explicit godownId is passed in these tests, and none of them are
  // exercising the Godowns feature — resolveGodownId() falls back to
  // looking up the owner's default godown, so it needs a resolved value
  // (none exists here) rather than hitting the real Godown model.
  Godown.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
});

describe("recordStockIn", () => {
  test("rolls purchasePrice forward as a weighted average of old + new stock value", async () => {
    // 10 units already in stock @ ₹100, buying 10 more @ ₹200
    // -> new stock 20, new avg cost = (10*100 + 10*200) / 20 = 150
    const current = fakeItem({ stock: 10, purchasePrice: 100 });
    mockFindOne(current);
    Item.findOneAndUpdate.mockResolvedValue({ stock: 20, purchasePrice: 150 });
    StockMovement.create.mockResolvedValue([{ direction: "in", qty: 10, rate: 200 }]);

    const { item, movement } = await recordStockIn({
      owner: "owner1",
      itemId: "item1",
      qty: 10,
      rate: 200,
      sourceType: "Purchase",
      sourceId: "p1",
      date: "2026-08-01",
    });

    expect(Item.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "item1", owner: "owner1", updatedAt: current.updatedAt },
      { $set: { stock: 20, purchasePrice: 150 } },
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(item.purchasePrice).toBe(150);
    expect(movement.direction).toBe("in");
  });

  test("falls back to the incoming rate when there was no prior stock", async () => {
    mockFindOne(fakeItem({ stock: 0, purchasePrice: 0 }));
    Item.findOneAndUpdate.mockResolvedValue({ stock: 5, purchasePrice: 40 });
    StockMovement.create.mockResolvedValue([{}]);

    await recordStockIn({ owner: "o", itemId: "i", qty: 5, rate: 40, sourceType: "Purchase", sourceId: "p", date: "d" });

    const [, setDoc] = Item.findOneAndUpdate.mock.calls[0];
    expect(setDoc.$set.purchasePrice).toBe(40);
  });

  test("retries on a concurrent write conflict and succeeds against fresh data", async () => {
    const staleRead = fakeItem({ stock: 10, purchasePrice: 100, updatedAt: new Date("2026-01-01") });
    Item.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(staleRead) });
    // First attempt: someone else updated the doc between read and write -> matched 0 docs -> null
    // Second attempt: succeeds
    Item.findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ stock: 20, purchasePrice: 150 });
    StockMovement.create.mockResolvedValue([{}]);

    const { item } = await recordStockIn({ owner: "o", itemId: "i", qty: 10, rate: 200, sourceType: "Purchase", sourceId: "p", date: "d" });

    expect(Item.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(item.stock).toBe(20);
  });

  test("gives up after MAX_RETRIES (5) failed writes", async () => {
    mockFindOne(fakeItem());
    Item.findOneAndUpdate.mockResolvedValue(null); // never succeeds

    await expect(
      recordStockIn({ owner: "o", itemId: "i", qty: 1, rate: 1, sourceType: "Purchase", sourceId: "p", date: "d" })
    ).rejects.toThrow(/too much concurrent activity/i);

    expect(Item.findOneAndUpdate).toHaveBeenCalledTimes(5);
  });

  test("throws when the item doesn't exist", async () => {
    mockFindOne(null);
    await expect(
      recordStockIn({ owner: "o", itemId: "missing", qty: 1, rate: 1, sourceType: "Purchase", sourceId: "p", date: "d" })
    ).rejects.toThrow(/item not found/i);
    expect(Item.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("recordStockOut", () => {
  test("deducts qty at the item's current average cost and reports COGS", async () => {
    mockFindOne(fakeItem({ stock: 10, purchasePrice: 50 }));
    Item.findOneAndUpdate.mockResolvedValue({ stock: 7, purchasePrice: 50 });
    StockMovement.create.mockResolvedValue([{ direction: "out" }]);

    const { movement, cogsAmount } = await recordStockOut({
      owner: "o", itemId: "i", qty: 3, sourceType: "Estimate", sourceId: "e", date: "d",
    });

    expect(cogsAmount).toBe(150); // 3 * 50
    expect(movement.direction).toBe("out");
  });

  test("clamps stock at 0 instead of going negative", async () => {
    mockFindOne(fakeItem({ stock: 2, purchasePrice: 20 }));
    Item.findOneAndUpdate.mockResolvedValue({ stock: 0, purchasePrice: 20 });
    StockMovement.create.mockResolvedValue([{}]);

    await recordStockOut({ owner: "o", itemId: "i", qty: 5, sourceType: "Estimate", sourceId: "e", date: "d" });

    const [, setDoc] = Item.findOneAndUpdate.mock.calls[0];
    expect(setDoc.$set.stock).toBe(0);
  });

  test("returns null (no throw) when the item is gone", async () => {
    mockFindOne(null);
    const result = await recordStockOut({ owner: "o", itemId: "gone", qty: 1, sourceType: "Estimate", sourceId: "e", date: "d" });
    expect(result).toBeNull();
    expect(StockMovement.create).not.toHaveBeenCalled();
  });
});

describe("recordReturnIn", () => {
  test("adds qty back without touching purchasePrice", async () => {
    mockFindOne(fakeItem({ stock: 4, purchasePrice: 75 }));
    Item.findOneAndUpdate.mockResolvedValue({ stock: 6, purchasePrice: 75 });
    StockMovement.create.mockResolvedValue([{}]);

    await recordReturnIn({ owner: "o", itemId: "i", qty: 2, rate: 999, sourceType: "Return", sourceId: "r", date: "d" });

    const [, setDoc] = Item.findOneAndUpdate.mock.calls[0];
    expect(setDoc.$set).toEqual({ stock: 6 }); // purchasePrice deliberately absent
  });

  test("reports cogsReversal based on the passed-in rate, not current avg cost", async () => {
    mockFindOne(fakeItem({ stock: 4, purchasePrice: 75 }));
    Item.findOneAndUpdate.mockResolvedValue({ stock: 6, purchasePrice: 75 });
    StockMovement.create.mockResolvedValue([{}]);

    const { cogsReversal } = await recordReturnIn({
      owner: "o", itemId: "i", qty: 2, rate: 30, sourceType: "Return", sourceId: "r", date: "d",
    });
    expect(cogsReversal).toBe(60); // 2 * 30, independent of purchasePrice
  });
});

describe("stockValuation", () => {
  test("computes per-item value and the overall total, skipping soft-deleted items via the query", async () => {
    Item.find.mockResolvedValue([
      { _id: "a", name: "Widget", stock: 10, purchasePrice: 5.5 },
      { _id: "b", name: "Gadget", stock: 0, purchasePrice: 100 },
    ]);

    const { rows, totalValue } = await stockValuation("owner1");

    expect(Item.find).toHaveBeenCalledWith({ owner: "owner1", deleted: { $ne: true } });
    expect(rows).toEqual([
      { itemId: "a", name: "Widget", stock: 10, avgCost: 5.5, value: 55 },
      { itemId: "b", name: "Gadget", stock: 0, avgCost: 100, value: 0 },
    ]);
    expect(totalValue).toBe(55);
  });
});

describe("applySaleGodownDelta", () => {
  test("deducts entirely from the chosen godown when it has enough stock", () => {
    const item = { stockByGodown: [{ godownId: "gA", stock: 20 }, { godownId: "gB", stock: 5 }] };
    const result = applySaleGodownDelta(item, "gA", 8, 0);
    expect(result).toEqual([
      { godownId: "gA", stock: 12, stockKg: 0 },
      { godownId: "gB", stock: 5, stockKg: 0 },
    ]);
    // sum stays consistent with what was actually sold: 25 - 8 = 17
    expect(result.reduce((s, g) => s + g.stock, 0)).toBe(17);
  });

  test("reallocates the shortfall from other godowns instead of silently clamping it away (Bug 1 fix)", () => {
    // Chosen godown (gA) only has 3 in stock, but 8 are being sold from it —
    // previously this clamped gA to 0 and lost the other 5 units entirely,
    // desyncing stockByGodown from the item's aggregate stock.
    const item = {
      stockByGodown: [
        { godownId: "gA", stock: 3 },
        { godownId: "gB", stock: 10 },
        { godownId: "gC", stock: 2 },
      ],
    };
    const result = applySaleGodownDelta(item, "gA", 8, 0);

    // gA drained first (3 -> 0), remaining shortfall of 5 pulled from the
    // largest other godown (gB, 10 -> 5) rather than lost.
    expect(result).toEqual([
      { godownId: "gA", stock: 0, stockKg: 0 },
      { godownId: "gB", stock: 5, stockKg: 0 },
      { godownId: "gC", stock: 2, stockKg: 0 },
    ]);
    // Total across all godowns dropped by exactly the 8 sold — no drift.
    expect(result.reduce((s, g) => s + g.stock, 0)).toBe(15 - 8);
  });

  test("clamps at 0 (old behaviour) only when no godown has any stock left to reallocate from", () => {
    const item = { stockByGodown: [{ godownId: "gA", stock: 2 }, { godownId: "gB", stock: 0 }] };
    const result = applySaleGodownDelta(item, "gA", 10, 0);
    expect(result).toEqual([
      { godownId: "gA", stock: 0, stockKg: 0 },
      { godownId: "gB", stock: 0, stockKg: 0 },
    ]);
  });

  test("creates a new zeroed entry for a godown the item never had stock in before, then reallocates from elsewhere", () => {
    const item = { stockByGodown: [{ godownId: "gB", stock: 6 }] };
    const result = applySaleGodownDelta(item, "gNew", 4, 0);
    expect(result).toEqual([
      { godownId: "gB", stock: 2, stockKg: 0 },
      { godownId: "gNew", stock: 0, stockKg: 0 },
    ]);
  });

  test("handles weight-mode kg deltas independently of piece deltas", () => {
    const item = {
      stockByGodown: [
        { godownId: "gA", stock: 5, stockKg: 4 },
        { godownId: "gB", stock: 5, stockKg: 20 },
      ],
    };
    const result = applySaleGodownDelta(item, "gA", 3, 10);
    expect(result).toEqual([
      { godownId: "gA", stock: 2, stockKg: 0 },
      { godownId: "gB", stock: 5, stockKg: 14 }, // 20 - (10 - 4) shortfall
    ]);
  });
});