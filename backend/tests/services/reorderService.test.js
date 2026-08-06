jest.mock("../../models/Item");
jest.mock("../../models/Vendor");
jest.mock("../../models/StockMovement");

const Item = require("../../models/Item");
const Vendor = require("../../models/Vendor");
const StockMovement = require("../../models/StockMovement");
const { computeSuggestions } = require("../../services/reorderService");

function movement(itemId, qty) {
  return { itemId, qty, direction: "out" };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("computeSuggestions", () => {
  test("pace mode: reorder point scales with vendor lead time, not just the static lowStock", async () => {
    // Sells 30 units over the 30-day window -> dailyRate 1/day.
    // Vendor lead time 10 days + 3 days safety = reorder point 13.
    // Stock is 12, below that computed point even though it's well above the
    // static lowStock of 5 — this should still surface as a suggestion.
    Item.find.mockResolvedValue([
      { _id: "item1", name: "Cement Bag", unit: "bag", stock: 12, lowStock: 5, vendorId: "vendor1" },
    ]);
    Vendor.find.mockResolvedValue([{ _id: "vendor1", name: "ABC Suppliers", phone: "999", leadTimeDays: 10 }]);
    StockMovement.find.mockResolvedValue(Array.from({ length: 5 }, () => movement("item1", 6))); // 30 units total

    const suggestions = await computeSuggestions("owner1");

    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s.mode).toBe("pace");
    expect(s.dailyRate).toBe(1);
    expect(s.leadTimeDays).toBe(10);
    expect(s.reorderPoint).toBe(13); // 1 * (10 + 3)
    expect(s.suggestedQty).toBeGreaterThan(0);
  });

  test("a manually-raised lowStock still acts as a floor above the computed reorder point", async () => {
    // dailyRate 1/day, default lead time 7 + safety 3 = reorder point 10.
    // lowStock manually set to 20 -> effective threshold should be 20, not 10.
    Item.find.mockResolvedValue([
      { _id: "item1", name: "Cement Bag", unit: "bag", stock: 18, lowStock: 20, vendorId: null },
    ]);
    Vendor.find.mockResolvedValue([]);
    StockMovement.find.mockResolvedValue(Array.from({ length: 5 }, () => movement("item1", 6)));

    const suggestions = await computeSuggestions("owner1");

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reorderPoint).toBe(10);
    // stock 18 is below the manual floor of 20 even though above the computed point of 10
  });

  test("well-stocked pace items are not suggested", async () => {
    Item.find.mockResolvedValue([
      { _id: "item1", name: "Cement Bag", unit: "bag", stock: 500, lowStock: 5, vendorId: null },
    ]);
    Vendor.find.mockResolvedValue([]);
    StockMovement.find.mockResolvedValue(Array.from({ length: 5 }, () => movement("item1", 6)));

    const suggestions = await computeSuggestions("owner1");
    expect(suggestions).toHaveLength(0);
  });

  test("falls back to static mode when there isn't enough sales history", async () => {
    Item.find.mockResolvedValue([
      { _id: "item1", name: "Rare Part", unit: "pc", stock: 2, lowStock: 5, vendorId: null },
    ]);
    Vendor.find.mockResolvedValue([]);
    StockMovement.find.mockResolvedValue([movement("item1", 1)]); // only 1 movement, below MIN_MOVEMENTS

    const suggestions = await computeSuggestions("owner1");

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].mode).toBe("static");
    expect(suggestions[0].suggestedQty).toBeNull();
    expect(suggestions[0].reorderPoint).toBeNull();
  });
});
