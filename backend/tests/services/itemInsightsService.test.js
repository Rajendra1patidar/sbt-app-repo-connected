jest.mock("../../models/Purchase");
jest.mock("../../models/Vendor");
jest.mock("../../models/Document");
jest.mock("../../services/reorderService");

const Purchase = require("../../models/Purchase");
const Vendor = require("../../models/Vendor");
const Document = require("../../models/Document");
const reorderService = require("../../services/reorderService");
const { computeItemInsights } = require("../../services/itemInsightsService");

// Purchase.findOne / Document.findOne are used as `.sort().lean()` chains —
// this builds a mock that supports that chain and resolves to `result`.
function chain(result) {
  return { sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  jest.clearAllMocks();
  reorderService.evaluateOne.mockResolvedValue({ mode: "pace", needsReorder: false });
});

describe("computeItemInsights", () => {
  const item = { _id: "item1", trackingMode: "unit", purchasePrice: 50, sellingPrice: 65 };

  test("resolves last purchase with vendor name", async () => {
    Purchase.findOne.mockReturnValue(chain({ date: "2026-09-03", qty: 100, qtyKg: null, rate: 58, vendorId: "v1" }));
    Vendor.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "v1", name: "Agrawal Steel", phone: "999" }) });
    Document.findOne.mockReturnValue(chain(null));

    const result = await computeItemInsights("owner1", item);

    expect(result.lastPurchase).toEqual({
      date: "2026-09-03", qty: 100, qtyKg: null, rate: 58,
      vendor: { id: "v1", name: "Agrawal Steel", phone: "999" },
    });
  });

  test("returns null last purchase when the item has never been bought", async () => {
    Purchase.findOne.mockReturnValue(chain(null));
    Document.findOne.mockReturnValue(chain(null));

    const result = await computeItemInsights("owner1", item);

    expect(result.lastPurchase).toBeNull();
  });

  test("resolves last sale from the matching estimate line, not the item's default selling price", async () => {
    Purchase.findOne.mockReturnValue(chain(null));
    Document.findOne.mockReturnValue(
      chain({ date: "2026-09-15", lines: [{ itemId: "item1", qty: 12, rate: 175 }, { itemId: "other", qty: 3, rate: 40 }] })
    );

    const result = await computeItemInsights("owner1", item);

    expect(result.lastSale).toEqual({ date: "2026-09-15", qty: 12, rate: 175 });
  });

  test("computes margin per unit and percent off purchase vs selling price", async () => {
    Purchase.findOne.mockReturnValue(chain(null));
    Document.findOne.mockReturnValue(chain(null));

    const result = await computeItemInsights("owner1", item);

    expect(result.margin.perUnit).toBe(15); // 65 - 50
    expect(result.margin.percent).toBe(30); // 15/50 * 100
  });

  test("margin percent is null when purchase price is 0 (would divide by zero)", async () => {
    Purchase.findOne.mockReturnValue(chain(null));
    Document.findOne.mockReturnValue(chain(null));

    const result = await computeItemInsights("owner1", { ...item, purchasePrice: 0 });

    expect(result.margin.percent).toBeNull();
  });

  test("passes through the reorder pace/alert data from reorderService unchanged", async () => {
    Purchase.findOne.mockReturnValue(chain(null));
    Document.findOne.mockReturnValue(chain(null));
    reorderService.evaluateOne.mockResolvedValue({ mode: "pace", dailyRate: 86, daysLeft: 28, needsReorder: false });

    const result = await computeItemInsights("owner1", item);

    expect(result.reorder).toEqual({ mode: "pace", dailyRate: 86, daysLeft: 28, needsReorder: false });
    expect(reorderService.evaluateOne).toHaveBeenCalledWith("owner1", item);
  });
});
