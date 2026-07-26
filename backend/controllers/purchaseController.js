const Purchase = require("../models/Purchase");
const Vendor = require("../models/Vendor");
const Item = require("../models/Item");
const ledgerService = require("../services/ledgerService");
const stockService = require("../services/stockService");

// GET /api/purchases
exports.list = async (req, res, next) => {
  try {
    const docs = await Purchase.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// GET /api/purchases/:id
exports.getOne = async (req, res, next) => {
  try {
    const doc = await Purchase.findOne({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// POST /api/purchases   { vendorId, itemId, qty, rate, date, paymentStatus, amountPaid, notes }
// This is the entry point for real cost data: it (1) records the purchase,
// (2) rolls the item's weighted-average purchasePrice forward, (3) logs a
// StockMovement, and (4) posts the matching ledger entries — all in one call,
// so every purchase you enter automatically keeps COGS and stock valuation
// correct without any extra bookkeeping on your part.
exports.create = async (req, res, next) => {
  try {
    const v = req.body;
    const qty = Number(v.qty);
    const rate = Number(v.rate);
    if (!(qty > 0) || !(rate >= 0)) {
      return res.status(400).json({ message: "Quantity must be positive and rate must be zero or more" });
    }

    const vendor = await Vendor.findOne({ _id: v.vendorId, owner: req.userId });
    if (!vendor) return res.status(400).json({ message: "Vendor not found" });

    const item = await Item.findOne({ _id: v.itemId, owner: req.userId });
    if (!item) return res.status(400).json({ message: "Item not found" });

    const amount = Math.round(qty * rate * 100) / 100;
    const date = v.date || new Date().toISOString().slice(0, 10);
    const paymentStatus = ["paid", "unpaid", "partial"].includes(v.paymentStatus) ? v.paymentStatus : "unpaid";
    const amountPaid =
      paymentStatus === "paid" ? amount : paymentStatus === "partial" ? Math.min(Number(v.amountPaid) || 0, amount) : 0;

    const purchase = await Purchase.create({
      owner: req.userId,
      vendorId: vendor._id,
      itemId: item._id,
      qty,
      rate,
      amount,
      date,
      paymentStatus,
      amountPaid,
      notes: v.notes || "",
    });

    // 1) stock quantity + weighted-average cost + StockMovement
    const { item: updatedItem } = await stockService.recordStockIn({
      owner: req.userId,
      itemId: item._id,
      qty,
      rate,
      sourceType: "Purchase",
      sourceId: purchase._id,
      date,
    });

    // 2) ledger: Dr Stock, Cr VendorPayable (full amount always posts against the vendor first —
    // this keeps a clean paper trail of what was owed even if part of it was paid immediately)
    await ledgerService.postEntries(
      [
        { account: "Stock", type: "debit", amount },
        { account: "VendorPayable", type: "credit", amount, vendorId: vendor._id },
      ],
      { owner: req.userId, sourceType: "Purchase", sourceId: purchase._id, date, narration: `Purchase: ${item.name} x${qty}` }
    );

    // 3) if any part was paid immediately, settle that slice: Dr VendorPayable, Cr Funds
    if (amountPaid > 0) {
      await ledgerService.postEntries(
        [
          { account: "VendorPayable", type: "debit", amount: amountPaid, vendorId: vendor._id },
          { account: "Funds", type: "credit", amount: amountPaid },
        ],
        { owner: req.userId, sourceType: "Purchase", sourceId: purchase._id, date, narration: `Payment on purchase: ${item.name}` }
      );
    }

    res.status(201).json({ purchase, item: updatedItem });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/purchases/:id
// Reverses every ledger entry this purchase posted. Does NOT undo the stock
// quantity or weighted-average cost change (unwinding a weighted average
// correctly after other purchases/sales have happened since isn't reliable) —
// so this is meant for correcting a mis-entered purchase soon after creating it,
// not for arbitrary historical edits.
exports.remove = async (req, res, next) => {
  try {
    const purchase = await Purchase.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!purchase) return res.status(404).json({ message: "Not found" });

    await ledgerService.reverseSource(req.userId, "Purchase", purchase._id, "Purchase deleted");

    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
};
