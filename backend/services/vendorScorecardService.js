const Purchase = require("../models/Purchase");
const Vendor = require("../models/Vendor");
const Item = require("../models/Item");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Per-vendor scorecard built entirely from real Purchase history.
 *
 * There's no promised-delivery-date field anywhere in the schema, so this
 * deliberately does NOT claim an "on-time %" against an expectation nobody
 * ever recorded. Instead it reports what actually happened: how long an
 * order really took from being placed (createdAt) to being marked Received
 * (updatedAt), and how old any currently-pending orders are. That's a real
 * measurement, not a guess dressed up as one.
 */
async function computeVendorScorecards(owner) {
  const [purchases, vendors, items] = await Promise.all([
    Purchase.find({ owner }).select("vendorId itemId qty rate amount source status date createdAt updatedAt"),
    Vendor.find({ owner }).select("name phone leadTimeDays"),
    Item.find({ owner }).select("name"),
  ]);

  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));
  const itemMap = new Map(items.map((i) => [String(i._id), i]));

  const byVendor = new Map();
  for (const p of purchases) {
    if (!p.vendorId) continue; // an "order" record may not have a vendor picked yet
    const key = String(p.vendorId);
    const entry = byVendor.get(key) || { totalSpend: 0, count: 0, fulfillmentDays: [], pendingAgeDays: [], byItem: new Map() };
    entry.totalSpend = round2(entry.totalSpend + (Number(p.amount) || 0));
    entry.count += 1;

    if (p.source === "order") {
      if (p.status === "Received") {
        const days = Math.round((new Date(p.updatedAt) - new Date(p.createdAt)) / 86400000);
        if (days >= 0) entry.fulfillmentDays.push(days);
      } else {
        entry.pendingAgeDays.push(Math.round((Date.now() - new Date(p.createdAt)) / 86400000));
      }
    }

    if (p.itemId && Number(p.rate) > 0) {
      const itemKey = String(p.itemId);
      const arr = entry.byItem.get(itemKey) || [];
      arr.push({ rate: Number(p.rate), date: p.date || p.createdAt });
      entry.byItem.set(itemKey, arr);
    }

    byVendor.set(key, entry);
  }

  const results = [];
  for (const [vendorId, data] of byVendor) {
    const vendor = vendorMap.get(vendorId);
    if (!vendor) continue;

    const avgFulfillmentDays = data.fulfillmentDays.length
      ? round2(data.fulfillmentDays.reduce((s, d) => s + d, 0) / data.fulfillmentDays.length)
      : null;
    const oldestPendingDays = data.pendingAgeDays.length ? Math.max(...data.pendingAgeDays) : null;

    // Only items bought 2+ times from this vendor have a trend at all —
    // one data point can't show a direction.
    const priceTrends = [];
    for (const [itemId, entries] of data.byItem) {
      if (entries.length < 2) continue;
      entries.sort((a, b) => new Date(a.date) - new Date(b.date));
      const first = entries[0].rate;
      const latest = entries[entries.length - 1].rate;
      if (first <= 0) continue;
      priceTrends.push({
        itemId,
        name: itemMap.get(itemId)?.name || "Unknown item",
        firstRate: first,
        latestRate: latest,
        changePct: round2(((latest - first) / first) * 100),
        purchaseCount: entries.length,
      });
    }
    priceTrends.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    results.push({
      vendorId,
      name: vendor.name,
      phone: vendor.phone,
      leadTimeDays: vendor.leadTimeDays,
      totalSpend: data.totalSpend,
      purchaseCount: data.count,
      avgFulfillmentDays,
      pendingOrders: data.pendingAgeDays.length,
      oldestPendingDays,
      priceTrends,
    });
  }

  results.sort((a, b) => b.totalSpend - a.totalSpend);
  return results;
}

module.exports = { computeVendorScorecards };
