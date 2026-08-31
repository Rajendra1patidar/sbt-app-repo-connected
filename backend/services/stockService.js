const Item = require("../models/Item");
const StockMovement = require("../models/StockMovement");
const Godown = require("../models/Godown");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX_RETRIES = 5;

/**
 * Resolves which godown a stock movement should apply to. Explicit
 * `godownId` wins; otherwise falls back to the owner's default godown. If
 * the owner has never created a godown at all, returns null — callers treat
 * that as "skip the per-godown breakdown", so nothing breaks for anyone who
 * hasn't adopted the Godowns feature yet.
 */
async function resolveGodownId(owner, godownId, session) {
  if (godownId) return godownId;
  const def = await Godown.findOne({ owner, isDefault: true }).session(session || null);
  return def ? def._id : null;
}

/**
 * Returns a new stockByGodown array with `deltaPieces`/`deltaKg` applied to
 * the given godown's entry (creating it if this is the item's first
 * movement at that location). Clamped at 0 the same way the aggregate
 * stock/stockKg fields are, so a location can't go negative even if the
 * overall item total still has room (e.g. a bad godown selection at sale
 * time). Never derives one unit from the other, same rule as everywhere else.
 */
function applyGodownDelta(item, godownId, deltaPieces, deltaKg) {
  const gid = String(godownId);
  const list = (item.stockByGodown || []).map((g) => ({
    godownId: g.godownId,
    stock: Number(g.stock) || 0,
    stockKg: Number(g.stockKg) || 0,
  }));
  let entry = list.find((g) => String(g.godownId) === gid);
  if (!entry) {
    entry = { godownId, stock: 0, stockKg: 0 };
    list.push(entry);
  }
  entry.stock = round2(Math.max(0, entry.stock + deltaPieces));
  entry.stockKg = round2(Math.max(0, entry.stockKg + deltaKg));
  return list;
}

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
async function recordStockIn({ owner, itemId, qty, qtyKg, rate, sourceType, sourceId, date, godownId, session }) {
  const resolvedGodownId = await resolveGodownId(owner, godownId, session);
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const isWeight = item.trackingMode === "weight";
      const oldStock = Number(item.stock) || 0;
      const oldStockKg = Number(item.stockKg) || 0;
      const oldCost = Number(item.purchasePrice) || 0;

      const newStock = round2(oldStock + Number(qty));
      const newStockKg = isWeight ? round2(oldStockKg + Number(qtyKg || 0)) : oldStockKg;

      // Weighted-average cost basis: for weight-mode items rate is ₹/kg, so
      // value is tracked against kg, not pieces — mirrors the existing
      // pieces-based weighted average below, just on the other unit.
      const oldBasisQty = isWeight ? oldStockKg : oldStock;
      const newBasisQty = isWeight ? newStockKg : newStock;
      const addedBasisQty = isWeight ? Number(qtyKg || 0) : Number(qty);
      const oldValue = oldBasisQty * oldCost;
      const addedValue = addedBasisQty * Number(rate);
      const newAvgCost = newBasisQty > 0 ? (oldValue + addedValue) / newBasisQty : Number(rate);

      const changes = { stock: newStock, purchasePrice: round2(newAvgCost) };
      if (isWeight) {
        changes.stockKg = newStockKg;
        // Rolling avg weight/piece — analytics only (reorder math, anomaly
        // checks). Never used to derive stock or stockKg from each other.
        const oldAvgWeight = Number(item.avgWeightPerPiece) || 0;
        changes.avgWeightPerPiece =
          newStock > 0 ? round2((oldStock * oldAvgWeight + Number(qtyKg || 0)) / newStock) : oldAvgWeight;
      }
      if (resolvedGodownId) {
        changes.stockByGodown = applyGodownDelta(item, resolvedGodownId, Number(qty), isWeight ? Number(qtyKg || 0) : 0);
      }
      return { changes, extra: { isWeight } };
    },
    session
  );
  if (!result) throw new Error("Item not found for stock-in");
  const { item, extra } = result;

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction: "in",
        qty: Number(qty),
        qtyKg: extra.isWeight ? Number(qtyKg || 0) : undefined,
        rate: round2(rate),
        balanceQty: item.stock,
        balanceKg: extra.isWeight ? item.stockKg : undefined,
        balanceValue: round2((extra.isWeight ? item.stockKg : item.stock) * item.purchasePrice),
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
async function recordStockOut({ owner, itemId, qty, qtyKg, sourceType, sourceId, date, godownId, session }) {
  const resolvedGodownId = await resolveGodownId(owner, godownId, session);
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const isWeight = item.trackingMode === "weight";
      const costRate = Number(item.purchasePrice) || 0;
      // Pieces removed is the physical-stock truth; weighed kg is the
      // billing truth. Both are deducted independently — pieces is never
      // computed from kg or vice versa.
      const newStock = round2(Math.max(0, (Number(item.stock) || 0) - Number(qty)));
      const changes = { stock: newStock };
      if (isWeight) {
        changes.stockKg = round2(Math.max(0, (Number(item.stockKg) || 0) - Number(qtyKg || 0)));
      }
      if (resolvedGodownId) {
        changes.stockByGodown = applyGodownDelta(item, resolvedGodownId, -Number(qty), isWeight ? -Number(qtyKg || 0) : 0);
      }
      return { changes, extra: { costRate, isWeight } };
    },
    session
  );
  if (!result) return null;
  const { item, extra } = result;

  // COGS basis: ₹/kg × kg sold for weight-mode items, ₹/unit × pieces otherwise.
  const cogsQty = extra.isWeight ? Number(qtyKg || 0) : Number(qty);

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction: "out",
        qty: Number(qty),
        qtyKg: extra.isWeight ? Number(qtyKg || 0) : undefined,
        rate: round2(extra.costRate),
        balanceQty: item.stock,
        balanceKg: extra.isWeight ? item.stockKg : undefined,
        balanceValue: round2((extra.isWeight ? item.stockKg : item.stock) * extra.costRate),
        sourceType,
        sourceId,
        date,
      },
    ],
    { session: session || undefined }
  );

  return { item, movement, cogsAmount: round2(cogsQty * extra.costRate) };
}

/**
 * Records stock coming back in from a customer Return. Unlike recordStockIn,
 * this does NOT touch the weighted-average purchasePrice — a return isn't a
 * new purchase, it's previously-existing stock coming back, so the average
 * cost basis it left at is the average cost basis it should return at.
 */
async function recordReturnIn({ owner, itemId, qty, qtyKg, rate, sourceType, sourceId, date, godownId, session }) {
  const resolvedGodownId = await resolveGodownId(owner, godownId, session);
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const isWeight = item.trackingMode === "weight";
      const newStock = round2((Number(item.stock) || 0) + Number(qty));
      const changes = { stock: newStock };
      if (isWeight) changes.stockKg = round2((Number(item.stockKg) || 0) + Number(qtyKg || 0));
      if (resolvedGodownId) {
        changes.stockByGodown = applyGodownDelta(item, resolvedGodownId, Number(qty), isWeight ? Number(qtyKg || 0) : 0);
      }
      return { changes, extra: { isWeight } };
    },
    session
  );
  if (!result) return null;
  const { item, extra } = result;
  const cogsQty = extra.isWeight ? Number(qtyKg || 0) : Number(qty);

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction: "in",
        qty: Number(qty),
        qtyKg: extra.isWeight ? Number(qtyKg || 0) : undefined,
        rate: round2(rate),
        balanceQty: item.stock,
        balanceKg: extra.isWeight ? item.stockKg : undefined,
        balanceValue: round2((extra.isWeight ? item.stockKg : item.stock) * (Number(item.purchasePrice) || 0)),
        sourceType,
        sourceId,
        date,
      },
    ],
    { session: session || undefined }
  );

  return { item, movement, cogsReversal: round2(cogsQty * Number(rate)) };
}

/**
 * Corrects a physically-counted quantity (e.g. after a stock take), instead
 * of adding/removing a known delta like the other record* functions. Unlike
 * a manual `$set` on Item.stock, this still writes a StockMovement row so
 * the audit trail and Stock Valuation report stay in sync with the
 * correction — and it does NOT touch the weighted-average purchasePrice,
 * since a count correction isn't a purchase at a new price.
 *
 * `newStock`/`newStockKg` are the count AT `godownId` (or the owner's
 * default godown, if omitted) — NOT the item's company-wide total. This
 * matters as soon as an item's stock is split across more than one godown:
 * counting 42 at Main Shop shouldn't overwrite the item's total to 42 if
 * another 10 are sitting, unaudited, at a second godown. Instead we work out
 * how far off THAT location's own recorded figure was, and roll only that
 * difference into the item's aggregate stock/stockKg — the other location's
 * entry is left untouched. For an owner who has never adopted the Godowns
 * feature (resolvedGodownId comes back null), there's only one number to
 * begin with, so `newStock`/`newStockKg` are just the new total, as before.
 *
 * Returns null (no movement written) if the counted quantity matches what
 * the books already show for that location.
 */
async function recordAdjustment({ owner, itemId, newStock, newStockKg, sourceId, date, godownId, session }) {
  const resolvedGodownId = await resolveGodownId(owner, godownId, session);
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const isWeight = item.trackingMode === "weight";
      const oldStock = round2(item.stock) || 0;
      const oldStockKgAgg = round2(item.stockKg) || 0;

      // What the books currently show at the location being counted —
      // the aggregate when there's no godown to scope to, otherwise just
      // that godown's own entry (0 if it has none yet).
      let locationOldStock = oldStock;
      let locationOldStockKg = oldStockKgAgg;
      if (resolvedGodownId) {
        const entry = (item.stockByGodown || []).find((g) => String(g.godownId) === String(resolvedGodownId));
        locationOldStock = entry ? Number(entry.stock) || 0 : 0;
        locationOldStockKg = entry ? Number(entry.stockKg) || 0 : 0;
      }

      const target = round2(newStock);
      const delta = round2(target - locationOldStock);
      const newAggStock = round2(Math.max(0, oldStock + delta));
      const changes = { stock: newAggStock };

      let oldStockKg, targetKg, deltaKg, newAggStockKg;
      if (isWeight) {
        oldStockKg = locationOldStockKg;
        // If a kg recount wasn't given, leave stockKg untouched (piece-only
        // recount) rather than guessing a kg figure from the piece delta.
        targetKg = newStockKg === undefined || newStockKg === null ? oldStockKg : round2(newStockKg);
        deltaKg = round2(targetKg - oldStockKg);
        newAggStockKg = round2(Math.max(0, oldStockKgAgg + deltaKg));
        changes.stockKg = newAggStockKg;
      }
      if (resolvedGodownId) {
        changes.stockByGodown = applyGodownDelta(item, resolvedGodownId, delta, isWeight ? deltaKg || 0 : 0);
      }
      return {
        changes,
        extra: { oldStock: locationOldStock, delta, isWeight, oldStockKg: locationOldStockKg, target, targetKg, deltaKg },
      };
    },
    session
  );
  if (!result) throw new Error("Item not found for stock adjustment");
  const { item, extra } = result;
  if (extra.delta === 0 && (!extra.isWeight || extra.deltaKg === 0)) return null; // counted qty already matches books

  const direction = extra.delta !== 0 ? (extra.delta > 0 ? "in" : "out") : extra.deltaKg > 0 ? "in" : "out";
  const rate = round2(item.purchasePrice) || 0;
  // Value basis: kg for weight-mode items (rate is ₹/kg there), pieces otherwise.
  const valueDelta = extra.isWeight ? extra.deltaKg : extra.delta;

  const [movement] = await StockMovement.create(
    [
      {
        owner,
        itemId,
        direction,
        qty: Math.abs(extra.delta),
        qtyKg: extra.isWeight ? Math.abs(extra.deltaKg) : undefined,
        rate,
        balanceQty: item.stock,
        balanceKg: extra.isWeight ? item.stockKg : undefined,
        balanceValue: round2((extra.isWeight ? item.stockKg : item.stock) * rate),
        sourceType: "Adjustment",
        sourceId,
        date,
      },
    ],
    { session: session || undefined }
  );

  return {
    item,
    movement,
    // Location-scoped before/after (what the count actually corrected) —
    // not the item's company-wide total, which lives on `item.stock`.
    oldStock: extra.oldStock,
    newStock: extra.target,
    delta: extra.delta,
    oldStockKg: extra.oldStockKg,
    newStockKg: extra.targetKg,
    deltaKg: extra.deltaKg,
    valueChange: round2(valueDelta * rate),
  };
}

/**
 * Moves stock from one godown to another for the same item. Total
 * stock/stockKg on the item is unchanged — only the stockByGodown split
 * moves — so this never touches purchasePrice or avgWeightPerPiece. Both
 * legs are logged as StockMovement rows (direction "out" at the source,
 * "in" at the destination) so the audit trail shows the transfer the same
 * way it would show a sale or purchase.
 */
async function recordTransfer({ owner, itemId, fromGodownId, toGodownId, qty, qtyKg, sourceId, date, session }) {
  if (String(fromGodownId) === String(toGodownId)) {
    throw new Error("Source and destination godown must be different");
  }
  const result = await atomicItemUpdate(
    owner,
    itemId,
    (item) => {
      const isWeight = item.trackingMode === "weight";
      const fromEntry = (item.stockByGodown || []).find((g) => String(g.godownId) === String(fromGodownId));
      const available = fromEntry ? Number(fromEntry.stock) || 0 : 0;
      const availableKg = fromEntry ? Number(fromEntry.stockKg) || 0 : 0;
      if (Number(qty) > available || (isWeight && Number(qtyKg || 0) > availableKg)) {
        const err = new Error(`Insufficient stock at source godown for "${item.name}"`);
        err.status = 400;
        throw err;
      }
      let list = applyGodownDelta(item, fromGodownId, -Number(qty), isWeight ? -Number(qtyKg || 0) : 0);
      // applyGodownDelta only knows about `item`'s original array, so re-apply
      // it against a synthetic item carrying the just-updated list for the
      // second leg of the same move.
      list = applyGodownDelta({ stockByGodown: list }, toGodownId, Number(qty), isWeight ? Number(qtyKg || 0) : 0);
      return { changes: { stockByGodown: list }, extra: { isWeight } };
    },
    session
  );
  if (!result) throw new Error("Item not found for stock transfer");
  const { item, extra } = result;
  const rate = round2(item.purchasePrice) || 0;
  const commonFields = {
    owner,
    itemId,
    qty: Number(qty),
    qtyKg: extra.isWeight ? Number(qtyKg || 0) : undefined,
    rate,
    sourceType: "Transfer",
    sourceId,
    date,
  };
  const movements = await StockMovement.create(
    [
      { ...commonFields, direction: "out", balanceQty: item.stock, balanceKg: extra.isWeight ? item.stockKg : undefined, balanceValue: round2((extra.isWeight ? item.stockKg : item.stock) * rate) },
      { ...commonFields, direction: "in", balanceQty: item.stock, balanceKg: extra.isWeight ? item.stockKg : undefined, balanceValue: round2((extra.isWeight ? item.stockKg : item.stock) * rate) },
    ],
    { session: session || undefined }
  );

  return { item, movements };
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

module.exports = { recordStockIn, recordStockOut, recordReturnIn, recordAdjustment, recordTransfer, resolveGodownId, stockValuation };
