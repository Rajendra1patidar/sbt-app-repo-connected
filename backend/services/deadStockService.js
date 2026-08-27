const Item = require("../models/Item");
const StockMovement = require("../models/StockMovement");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// How long an item can sit with zero sales before it's flagged. Chosen to
// match the "90 days" window from the original dead-stock proposal — long
// enough that seasonal/slow-moving items (a specific bolt size, an odd
// window-frame dimension) aren't flagged just for having lumpy demand.
const DEAD_STOCK_DAYS = 90;

function daysAgoDateString(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Finds items that are sitting in stock but haven't had a single sale in
 * DEAD_STOCK_DAYS. Deliberately narrow in what counts as "a sale": only
 * "out" StockMovements sourced from an Estimate count as real customer
 * demand — a stock transfer between godowns, a stock-take correction, or a
 * return isn't evidence the item is actually moving, so those don't reset
 * the clock.
 *
 * Two things keep this from crying wolf:
 *   - Items with zero stock on hand are skipped outright — there's no
 *     "dead" inventory to flag if none of it is left.
 *   - Items created more recently than the window are skipped too — a new
 *     item simply hasn't had a fair chance to sell yet, and flagging it on
 *     day one would just be noise.
 */
async function computeDeadStock(owner, { daysThreshold = DEAD_STOCK_DAYS } = {}) {
  const cutoffDate = daysAgoDateString(daysThreshold);
  const cutoffCreatedAt = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

  const items = await Item.find({ owner, deleted: { $ne: true } });
  const results = [];

  for (const item of items) {
    const isWeight = item.trackingMode === "weight";
    const onHand = isWeight ? Number(item.stockKg || 0) : Number(item.stock || 0);
    if (onHand <= 0) continue;
    if (item.createdAt && item.createdAt > cutoffCreatedAt) continue;

    const hasRecentSale = await StockMovement.exists({
      owner,
      itemId: item._id,
      direction: "out",
      sourceType: "Estimate",
      date: { $gte: cutoffDate },
    });
    if (hasRecentSale) continue;

    const lastSale = await StockMovement.findOne({ owner, itemId: item._id, direction: "out", sourceType: "Estimate" })
      .sort({ date: -1 })
      .select("date");

    const unitCost = Number(item.purchasePrice) || 0;
    results.push({
      itemId: item._id,
      name: item.name,
      category: item.category,
      isWeight,
      stock: item.stock,
      stockKg: item.stockKg,
      value: round2(onHand * unitCost),
      lastSaleDate: lastSale ? lastSale.date : null, // null = never sold, not just "not recently"
    });
  }

  return results.sort((a, b) => b.value - a.value);
}

module.exports = { computeDeadStock, DEAD_STOCK_DAYS };
