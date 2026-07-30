const Item = require("../models/Item");
const StockMovement = require("../models/StockMovement");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Records incoming stock (from a Purchase) and rolls the item's purchasePrice
 * forward as a weighted average of old stock value + newly purchased value.
 * This replaces the old behaviour where purchasePrice was just a manually
 * typed number with no memory of what was actually paid batch to batch.
 */
async function recordStockIn({ owner, itemId, qty, rate, sourceType, sourceId, date }) {
  const item = await Item.findOne({ _id: itemId, owner });
  if (!item) throw new Error("Item not found for stock-in");

  const oldStock = Number(item.stock) || 0;
  const oldCost = Number(item.purchasePrice) || 0;
  const oldValue = oldStock * oldCost;
  const addedValue = Number(qty) * Number(rate);
  const newStock = round2(oldStock + Number(qty));
  const newAvgCost = newStock > 0 ? (oldValue + addedValue) / newStock : Number(rate);

  item.stock = newStock;
  item.purchasePrice = round2(newAvgCost);
  await item.save();

  const movement = await StockMovement.create({
    owner,
    itemId,
    direction: "in",
    qty: Number(qty),
    rate: round2(rate),
    balanceQty: newStock,
    balanceValue: round2(newStock * newAvgCost),
    sourceType,
    sourceId,
    date,
  });

  return { item, movement };
}

/**
 * Records outgoing stock (from an Estimate sale) at the item's current
 * weighted-average cost, and returns that cost basis so the caller can post
 * the matching COGS ledger entry. Stock is clamped at 0 to match the app's
 * existing behaviour of never showing negative stock.
 */
async function recordStockOut({ owner, itemId, qty, sourceType, sourceId, date }) {
  const item = await Item.findOne({ _id: itemId, owner });
  if (!item) return null;

  const costRate = Number(item.purchasePrice) || 0;
  const newStock = round2(Math.max(0, (Number(item.stock) || 0) - Number(qty)));
  item.stock = newStock;
  await item.save();

  const movement = await StockMovement.create({
    owner,
    itemId,
    direction: "out",
    qty: Number(qty),
    rate: round2(costRate),
    balanceQty: newStock,
    balanceValue: round2(newStock * costRate),
    sourceType,
    sourceId,
    date,
  });

  return { item, movement, cogsAmount: round2(Number(qty) * costRate) };
}

/**
 * Records stock coming back in from a customer Return. Unlike recordStockIn,
 * this does NOT touch the weighted-average purchasePrice — a return isn't a
 * new purchase, it's previously-existing stock coming back, so the average
 * cost basis it left at is the average cost basis it should return at.
 */
async function recordReturnIn({ owner, itemId, qty, rate, sourceType, sourceId, date }) {
  const item = await Item.findOne({ _id: itemId, owner });
  if (!item) return null;

  const newStock = round2((Number(item.stock) || 0) + Number(qty));
  item.stock = newStock;
  await item.save();

  const movement = await StockMovement.create({
    owner,
    itemId,
    direction: "in",
    qty: Number(qty),
    rate: round2(rate),
    balanceQty: newStock,
    balanceValue: round2(newStock * (Number(item.purchasePrice) || 0)),
    sourceType,
    sourceId,
    date,
  });

  return { item, movement, cogsReversal: round2(Number(qty) * Number(rate)) };
}

/** Current total ₹ value of all stock on hand, per item and overall. */
async function stockValuation(owner) {
  const items = await Item.find({ owner });
  const rows = items.map((it) => ({
    itemId: it._id,
    name: it.name,
    stock: round2(it.stock || 0),
    avgCost: round2(it.purchasePrice || 0),
    value: round2((it.stock || 0) * (it.purchasePrice || 0)),
  }));
  const totalValue = round2(rows.reduce((s, r) => s + r.value, 0));
  return { rows, totalValue };
}

module.exports = { recordStockIn, recordStockOut, recordReturnIn, stockValuation };
