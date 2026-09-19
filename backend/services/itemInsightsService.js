const Purchase = require("../models/Purchase");
const Vendor = require("../models/Vendor");
const Document = require("../models/Document");
const reorderService = require("./reorderService");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Most recent restock record for this item, with the vendor name resolved.
 * `date` on Purchase is a plain YYYY-MM-DD string, so sorting by it alone
 * can't break same-day ties — createdAt is the tiebreaker.
 */
async function getLastPurchase(owner, itemId) {
  const purchase = await Purchase.findOne({ owner, itemId })
    .sort({ date: -1, createdAt: -1 })
    .lean();
  if (!purchase) return null;

  const vendor = purchase.vendorId ? await Vendor.findOne({ _id: purchase.vendorId, owner }).lean() : null;
  return {
    date: purchase.date || null,
    qty: purchase.qty ?? null,
    qtyKg: purchase.qtyKg ?? null,
    rate: purchase.rate ?? null,
    vendor: vendor ? { id: vendor._id, name: vendor.name, phone: vendor.phone } : null,
  };
}

/**
 * Most recent estimate line this item was sold on — the selling price the
 * customer actually paid, not the item's current sellingPrice default.
 * Scanned newest-first and stopped at the first matching line, rather than
 * aggregated, since only the single latest sale is needed here.
 */
async function getLastSale(owner, itemId) {
  const doc = await Document.findOne({ owner, type: "estimate", deleted: { $ne: true }, "lines.itemId": itemId })
    .sort({ date: -1, createdAt: -1 })
    .lean();
  if (!doc) return null;

  const line = (doc.lines || []).find((ln) => String(ln.itemId) === String(itemId));
  if (!line) return null;

  return { date: doc.date || null, qty: line.qty ?? null, rate: line.rate ?? null };
}

/**
 * Everything the item-detail screen shows beyond the item document itself
 * and its stockByGodown breakdown (which the frontend already has via the
 * live item record): last purchase, last sale, margin, and the same
 * pace/reorder math used by the bulk reorder-suggestions list.
 */
async function computeItemInsights(owner, item) {
  const isWeight = item.trackingMode === "weight";
  const unitCost = Number(item.purchasePrice) || 0;
  const unitPrice = Number(item.sellingPrice) || 0;

  const [lastPurchase, lastSale, reorder] = await Promise.all([
    getLastPurchase(owner, item._id),
    getLastSale(owner, item._id),
    reorderService.evaluateOne(owner, item),
  ]);

  return {
    lastPurchase,
    lastSale,
    margin: {
      perUnit: round2(unitPrice - unitCost),
      percent: unitCost > 0 ? round2(((unitPrice - unitCost) / unitCost) * 100) : null,
      isWeight,
    },
    reorder,
  };
}

module.exports = { computeItemInsights };
