const Item = require("../models/Item");
const StockMovement = require("../models/StockMovement");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX_RETRIES = 5;

/**
 * Applies `computeUpdate(item)` to an item using optimistic-concurrency
 * retries instead of a plain read-then-write. Two sales of the same item
 * arriving at nearly the same moment used to be able to both read "10 in
 * stock", both deduct from that same stale number, and silently lose one of
 * the deductions. This closes that race: the write is conditioned on the
 * item's `updatedAt` still matching what we just read, so a concurrent
 * change makes our write a no-op (matched 0 documents) and we retry against
 * the fresh value instead of clobbering it.
 *
 * `computeUpdate(item)` returns `{ changes, extra }` — `changes` is the
 * `$set` to apply, `extra` is anything the caller needs back that isn't part
 * of the item itself (e.g. the cost rate at the moment of the sale).
 */
async function atomicItemUpdate(owner, itemId, computeUpdate, session) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await Item.findOne({ _id: itemId, owner }).session(session || null);
    if (!current) return null;

    const { changes, extra } = computeUpdate(current);
    const updated = await Item.findOneAndUpdate(
      { _id: itemId, owner, updatedAt: current.updatedAt },
      { $set: changes },
      { new: true, runValidators: true, session: session || undefined }
    );
    if (updated) return { item: updated, extra };
    // another request updated this item between our read and our write — retry with fresh data
  }
  throw new Error(`Couldn't update stock for item ${itemId} — too much concurrent activity, please try again`);
}

/**
 * Records incoming stock (from a Purchase) and rolls the item's purchasePrice
 * forward as a weighted average of old stock value + newly purchased value.
 * This replaces the old behaviour where purchasePrice was just a manually
 * typed number with no memory of what was actually paid batch to batch.
 */
async function recordStockIn({ owner, itemId, qty, rate, sourceType, sourceId, date, session }) {
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const oldStock = Number(item.stock) || 0;
      const oldCost = Number(item.purchasePrice) || 0;
      const oldValue = oldStock * oldCost;
      const addedValue = Number(qty) * Number(rate);
      const newStock = round2(oldStock + Number(qty));
      const newAvgCost = newStock > 0 ? (oldValue + addedValue) / newStock : Number(rate);
      return { changes: { stock: newStock, purchasePrice: round2(newAvgCost) }, extra: null };
    },
    session
  );
  if (!result) throw new Error("Item not found for stock-in");
  const { item } = result;

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction: "in",
        qty: Number(qty),
        rate: round2(rate),
        balanceQty: item.stock,
        balanceValue: round2(item.stock * item.purchasePrice),
        sourceType,
        sourceId,
        date,
      },
    ],
    { session: session || undefined }
  );

  return { item, movement };
}

/**
 * Records outgoing stock (from an Estimate sale) at the item's current
 * weighted-average cost, and returns that cost basis so the caller can post
 * the matching COGS ledger entry. Stock is clamped at 0 to match the app's
 * existing behaviour of never showing negative stock.
 */
async function recordStockOut({ owner, itemId, qty, sourceType, sourceId, date, session }) {
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const costRate = Number(item.purchasePrice) || 0;
      const newStock = round2(Math.max(0, (Number(item.stock) || 0) - Number(qty)));
      return { changes: { stock: newStock }, extra: { costRate } };
    },
    session
  );
  if (!result) return null;
  const { item, extra } = result;

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction: "out",
        qty: Number(qty),
        rate: round2(extra.costRate),
        balanceQty: item.stock,
        balanceValue: round2(item.stock * extra.costRate),
        sourceType,
        sourceId,
        date,
      },
    ],
    { session: session || undefined }
  );

  return { item, movement, cogsAmount: round2(Number(qty) * extra.costRate) };
}

/**
 * Records stock coming back in from a customer Return. Unlike recordStockIn,
 * this does NOT touch the weighted-average purchasePrice — a return isn't a
 * new purchase, it's previously-existing stock coming back, so the average
 * cost basis it left at is the average cost basis it should return at.
 */
async function recordReturnIn({ owner, itemId, qty, rate, sourceType, sourceId, date, session }) {
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const newStock = round2((Number(item.stock) || 0) + Number(qty));
      return { changes: { stock: newStock }, extra: null };
    },
    session
  );
  if (!result) return null;
  const { item } = result;

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction: "in",
        qty: Number(qty),
        rate: round2(rate),
        balanceQty: item.stock,
        balanceValue: round2(item.stock * (Number(item.purchasePrice) || 0)),
        sourceType,
        sourceId,
        date,
      },
    ],
    { session: session || undefined }
  );

  return { item, movement, cogsReversal: round2(Number(qty) * Number(rate)) };
}

/** Current total value of all stock on hand, per item and overall. */
async function stockValuation(owner) {
  const items = await Item.find({ owner, deleted: { $ne: true } });
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
