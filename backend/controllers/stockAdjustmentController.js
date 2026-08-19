const { randomUUID } = require("crypto");
const StockAdjustment = require("../models/StockAdjustment");
const stockService = require("../services/stockService");
const ledgerService = require("../services/ledgerService");
const { withTransaction } = require("../utils/withTransaction");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Corrects one item's stock to `newStock`, writes the matching StockMovement
// + StockAdjustment audit row, and posts the value change to the ledger:
//   - counted MORE than the books showed -> debit Stock, credit OtherIncome
//   - counted LESS than the books showed -> debit OtherExpense, credit Stock
// Returns null if the count matches what's already on the books (no-op, not
// an error) so callers/bulk loop can just skip it.
async function applyOne({ owner, itemId, newStock, reason, date, batchId, session }) {
  const stockResult = await stockService.recordAdjustment({
    owner,
    itemId,
    newStock,
    sourceId: itemId, // no separate parent doc; the item itself is what's being corrected
    date,
    session,
  });
  if (!stockResult) return null;

  const adjDoc = await StockAdjustment.create(
    [
      {
        owner,
        itemId,
        previousStock: stockResult.oldStock,
        newStock: stockResult.item.stock,
        delta: stockResult.delta,
        rate: stockResult.movement.rate,
        valueChange: stockResult.valueChange,
        reason: reason || "Stock take",
        batchId,
        date,
      },
    ],
    { session: session || undefined }
  );

  const amount = Math.abs(stockResult.valueChange);
  if (amount > 0) {
    const lines =
      stockResult.delta > 0
        ? [
            { account: "Stock", type: "debit", amount },
            { account: "OtherIncome", type: "credit", amount },
          ]
        : [
            { account: "OtherExpense", type: "debit", amount },
            { account: "Stock", type: "credit", amount },
          ];
    await ledgerService.postEntries(lines, {
      owner,
      sourceType: "Adjustment",
      sourceId: adjDoc[0]._id,
      date,
      narration: reason || "Stock take adjustment",
      session,
    });
  }

  return { item: stockResult.item, adjustment: adjDoc[0] };
}

// GET /api/stock-adjustments
exports.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.itemId) filter.itemId = req.query.itemId;
    const docs = await StockAdjustment.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// POST /api/stock-adjustments  { itemId, newStock, reason?, date? }
exports.create = async (req, res, next) => {
  try {
    const { itemId, newStock, reason } = req.body;
    if (!itemId || newStock === undefined || newStock === null || Number(newStock) < 0) {
      return res.status(400).json({ message: "itemId and a non-negative newStock are required" });
    }
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const owner = req.userId;
    const result = await withTransaction((session) =>
      applyOne({ owner, itemId, newStock: Number(newStock), reason, date, batchId: randomUUID(), session })
    );
    if (!result) return res.json({ message: "No change — counted quantity already matches stock on hand" });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/stock-adjustments/bulk  { date?, reason?, lines: [{ itemId, newStock }] }
// Used by the Stock Take screen: applies every line as one batch. A single
// bad line (e.g. an item that's since been deleted) doesn't abort the whole
// batch — it's reported back per-line so the operator can see exactly what
// went through and what didn't, instead of an all-or-nothing transaction
// across dozens of unrelated items.
exports.bulk = async (req, res, next) => {
  try {
    const { lines, reason } = req.body;
    if (!Array.isArray(lines) || !lines.length) {
      return res.status(400).json({ message: "lines must be a non-empty array" });
    }
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const owner = req.userId;
    const batchId = randomUUID();

    const results = [];
    for (const line of lines) {
      const { itemId, newStock } = line || {};
      if (!itemId || newStock === undefined || newStock === null || Number(newStock) < 0) {
        results.push({ itemId, ok: false, message: "Missing or invalid itemId/newStock" });
        continue;
      }
      try {
        const result = await withTransaction((session) =>
          applyOne({ owner, itemId, newStock: Number(newStock), reason: line.reason || reason, date, batchId, session })
        );
        if (!result) {
          results.push({ itemId, ok: true, changed: false, message: "No change" });
        } else {
          results.push({
            itemId,
            ok: true,
            changed: true,
            item: result.item,
            previousStock: result.adjustment.previousStock,
            newStock: result.adjustment.newStock,
          });
        }
      } catch (err) {
        results.push({ itemId, ok: false, message: err.message || "Failed to adjust" });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    res.json({ batchId, total: lines.length, succeeded, failed: lines.length - succeeded, results });
  } catch (err) {
    next(err);
  }
};
