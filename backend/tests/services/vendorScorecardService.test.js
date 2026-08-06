jest.mock("../../models/Purchase");
jest.mock("../../models/Vendor");
jest.mock("../../models/Item");

const Purchase = require("../../models/Purchase");
const Vendor = require("../../models/Vendor");
const Item = require("../../models/Item");
const { computeVendorScorecards } = require("../../services/vendorScorecardService");

function mockSelect(model, value) {
  model.find.mockReturnValue({ select: jest.fn().mockResolvedValue(value) });
}

beforeEach(() => {
  jest.clearAllMocks();
  Vendor.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "vendor1", name: "Acme Supplies", phone: "999", leadTimeDays: 7 }]) });
  Item.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "item1", name: "Cement Bag" }]) });
});

describe("computeVendorScorecards", () => {
  test("totals spend and count across every purchase from a vendor", async () => {
    mockSelect(Purchase, [
      { vendorId: "vendor1", itemId: "item1", rate: 500, amount: 5000, source: "manual", status: "Received", date: "2026-07-01", createdAt: "2026-07-01", updatedAt: "2026-07-01" },
      { vendorId: "vendor1", itemId: "item1", rate: 500, amount: 3000, source: "manual", status: "Received", date: "2026-07-10", createdAt: "2026-07-10", updatedAt: "2026-07-10" },
    ]);

    const result = await computeVendorScorecards("owner1");

    expect(result).toHaveLength(1);
    expect(result[0].totalSpend).toBe(8000);
    expect(result[0].purchaseCount).toBe(2);
  });

  test("computes real fulfillment time from createdAt -> updatedAt for received orders", async () => {
    mockSelect(Purchase, [
      { vendorId: "vendor1", itemId: "item1", rate: 500, amount: 5000, source: "order", status: "Received", date: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-06T00:00:00Z" },
    ]);

    const result = await computeVendorScorecards("owner1");
    expect(result[0].avgFulfillmentDays).toBe(5);
  });

  test("tracks pending order age separately from fulfilled ones", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    mockSelect(Purchase, [
      { vendorId: "vendor1", itemId: "item1", rate: 500, amount: 5000, source: "order", status: "Pending", date: "2026-08-04", createdAt: twoDaysAgo, updatedAt: twoDaysAgo },
    ]);

    const result = await computeVendorScorecards("owner1");
    expect(result[0].pendingOrders).toBe(1);
    expect(result[0].oldestPendingDays).toBe(2);
    expect(result[0].avgFulfillmentDays).toBeNull(); // nothing received yet
  });

  test("price trend needs at least 2 purchases of the same item, sorted by date", async () => {
    mockSelect(Purchase, [
      { vendorId: "vendor1", itemId: "item1", rate: 400, amount: 4000, source: "manual", status: "Received", date: "2026-06-01", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
      { vendorId: "vendor1", itemId: "item1", rate: 500, amount: 5000, source: "manual", status: "Received", date: "2026-07-01", createdAt: "2026-07-01", updatedAt: "2026-07-01" },
    ]);

    const result = await computeVendorScorecards("owner1");
    expect(result[0].priceTrends).toHaveLength(1);
    expect(result[0].priceTrends[0]).toMatchObject({ firstRate: 400, latestRate: 500, changePct: 25 });
  });

  test("a single purchase of an item produces no price trend", async () => {
    mockSelect(Purchase, [
      { vendorId: "vendor1", itemId: "item1", rate: 400, amount: 4000, source: "manual", status: "Received", date: "2026-06-01", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
    ]);

    const result = await computeVendorScorecards("owner1");
    expect(result[0].priceTrends).toHaveLength(0);
  });

  test("purchases with no vendor picked yet are skipped, not thrown", async () => {
    mockSelect(Purchase, [
      { vendorId: null, itemId: "item1", rate: 400, amount: 4000, source: "order", status: "Pending", date: "2026-06-01", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
    ]);

    const result = await computeVendorScorecards("owner1");
    expect(result).toHaveLength(0);
  });
});
