const Item = require("../models/Item");
const Vendor = require("../models/Vendor");
const StockMovement = require("../models/StockMovement");

// A trailing window of "out" movements estimates how fast an item actually
// sells. Below MIN_MOVEMENTS data points in that window the pace isn't
// trusted enough to size an order off it, so those items fall back to the
// original static low-stock alert instead (no computed reorder point, no
// suggested qty — just the existing flag-only behaviour).
const WINDOW_DAYS = 30;
const MIN_MOVEMENTS = 3;

// Restock target: order enough to cover this many days of sales again, on
// top of the vendor's lead time — i.e. after the order arrives, you're
// covered for roughly a month before needing to reorder again.
const BUFFER_DAYS = 30;

// Used when an item has no vendor, or its vendor has no leadTimeDays set —
// a deliberately conservative (long) default so an unconfigured vendor
// doesn't understate how much buffer stock is actually needed.
const DEFAULT_LEAD_TIME_DAYS = 7;

// Extra cushion beyond the vendor's lead time, to absorb a slower-than-usual
// delivery or a sales spike between when the reorder point is crossed and
// when the order actually gets placed.
const SAFETY_STOCK_DAYS = 3;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Pure per-item math, shared by computeSuggestions (bulk, alerts-only) and
 * itemInsightsService (single item, wants the numbers whether or not the
 * item is actually due for reorder). Given one item plus its vendor and
 * trailing-window sales stats, returns the full pace/reorder picture and a
 * `needsReorder` flag — never filters anything out itself.
 *
 * For items with enough recent sales history ("pace" mode), the trigger is
 * a real reorder point: dailyRate × (vendor lead time + safety days) — not
 * just the static per-item lowStock field. A manually-set lowStock is still
 * respected as a floor (Math.max), so raising it by hand always keeps the
 * item covered even if the computed reorder point would trigger later.
 *
 * For items without enough history ("static" mode), behaviour is unchanged
 * from before: flag at lowStock, no computed quantity.
 */
function evaluateItem(it, vendor, stats) {
  const stock = Number(it.stock) || 0;
  const lowStock = Number(it.lowStock) || 5;
  const leadTimeDays = Number(vendor?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS) || DEFAULT_LEAD_TIME_DAYS;
  const hasEnoughHistory = stats && stats.count >= MIN_MOVEMENTS && stats.totalQty > 0;
  const vendorOut = vendor ? { id: vendor._id, name: vendor.name, phone: vendor.phone } : null;

  if (hasEnoughHistory) {
    const dailyRate = stats.totalQty / WINDOW_DAYS;
    const daysLeft = dailyRate > 0 ? round2((stock / dailyRate)) : null;
    const reorderPoint = Math.ceil(dailyRate * (leadTimeDays + SAFETY_STOCK_DAYS));
    // a manually-raised lowStock always still counts as a floor — the
    // computed point can only push the trigger earlier, never later than
    // what the owner explicitly set.
    const effectiveThreshold = Math.max(reorderPoint, lowStock);
    const needsReorder = stock <= effectiveThreshold;
    const suggestedQty = needsReorder ? Math.max(0, Math.ceil(dailyRate * (leadTimeDays + BUFFER_DAYS) - stock)) : 0;
    return {
      itemId: it._id, name: it.name, unit: it.unit, stock, lowStock,
      mode: "pace", dailyRate: round2(dailyRate), daysLeft, suggestedQty,
      leadTimeDays, reorderPoint, needsReorder,
      vendor: vendorOut,
    };
  }

  // not enough sales history to trust a pace calculation — fall back to
  // the original static alert with no computed quantity
  return {
    itemId: it._id, name: it.name, unit: it.unit, stock, lowStock,
    mode: "static", dailyRate: null, daysLeft: null, suggestedQty: null,
    leadTimeDays: null, reorderPoint: null, needsReorder: stock <= lowStock,
    vendor: vendorOut,
  };
}

async function windowStats(owner, itemIds) {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  const query = { owner, direction: "out", date: { $gte: windowStartStr } };
  if (itemIds) query.itemId = { $in: itemIds };
  const movements = await StockMovement.find(query);

  const byItem = new Map(); // itemId -> { totalQty, count }
  for (const m of movements) {
    const key = String(m.itemId);
    const cur = byItem.get(key) || { totalQty: 0, count: 0 };
    cur.totalQty += Number(m.qty) || 0;
    cur.count += 1;
    byItem.set(key, cur);
  }
  return byItem;
}

/**
 * Computes reorder suggestions for every item this owner has, keeping only
 * the ones actually due for reorder (needsReorder).
 */
async function computeSuggestions(owner) {
  const [items, vendors, byItem] = await Promise.all([
    Item.find({ owner }),
    Vendor.find({ owner }),
    windowStats(owner),
  ]);

  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  const suggestions = [];
  for (const it of items) {
    const vendor = it.vendorId ? vendorMap.get(String(it.vendorId)) : null;
    const evaluated = evaluateItem(it, vendor, byItem.get(String(it._id)));
    if (evaluated.needsReorder) suggestions.push(evaluated);
  }

  // fastest-emptying items first (pace-based with a days-left figure), static-alert items last
  suggestions.sort((a, b) => {
    if (a.daysLeft == null && b.daysLeft == null) return 0;
    if (a.daysLeft == null) return 1;
    if (b.daysLeft == null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  return suggestions;
}

/** Same math as computeSuggestions, for exactly one item — returns the full
 * pace/reorder picture regardless of whether it's currently due, so a detail
 * screen can show "healthy, N days left" as well as an active alert. */
async function evaluateOne(owner, item) {
  const vendor = item.vendorId ? await Vendor.findOne({ _id: item.vendorId, owner }) : null;
  const byItem = await windowStats(owner, [item._id]);
  return evaluateItem(item, vendor, byItem.get(String(item._id)));
}

module.exports = { computeSuggestions, evaluateOne, WINDOW_DAYS };
