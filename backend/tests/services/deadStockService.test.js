jest.mock("../../models/Item");
jest.mock("../../models/StockMovement");

const Item = require("../../models/Item");
const StockMovement = require("../../models/StockMovement");
const { computeDeadStock } = require("../../services/deadStockService");

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const dateStr = (n) => daysAgo(n).toISOString().slice(0, 10);
const OWNER = "64b000000000000000000001";

beforeEach(() => jest.clearAllMocks());

test("flags unsold/stale stock, skips recent sales, zero stock and new items — in 2 queries", async () => {
  Item.find.mockReturnValue({
    lean: jest.fn().mockResolvedValue([
      { _id: "a", name: "Never sold", stock: 10, purchasePrice: 100, createdAt: daysAgo(200) },
      { _id: "b", name: "Sold recently", stock: 10, purchasePrice: 100, createdAt: daysAgo(200) },
      { _id: "c", name: "Sold long ago", stock: 5, purchasePrice: 50, createdAt: daysAgo(200) },
      { _id: "d", name: "No stock", stock: 0, purchasePrice: 100, createdAt: daysAgo(200) },
      { _id: "e", name: "Brand new", stock: 10, purchasePrice: 100, createdAt: daysAgo(5) },
      { _id: "f", name: "Weight item", trackingMode: "weight", stockKg: 20, purchasePrice: 10, createdAt: daysAgo(200) },
    ]),
  });
  StockMovement.aggregate.mockResolvedValue([
    { _id: "b", lastSaleDate: dateStr(10) },
    { _id: "c", lastSaleDate: dateStr(150) },
  ]);

  const result = await computeDeadStock(OWNER);

  expect(result.map((r) => r.name)).toEqual(["Never sold", "Sold long ago", "Weight item"]); // sorted by value desc
  expect(result[0].lastSaleDate).toBeNull();
  expect(result[1].lastSaleDate).toBe(dateStr(150));
  expect(result[2].value).toBe(200);
  expect(Item.find).toHaveBeenCalledTimes(1);
  expect(StockMovement.aggregate).toHaveBeenCalledTimes(1);
});
