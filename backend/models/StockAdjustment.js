const mongoose = require("mongoose");

// One row per item corrected in a stock take. Separate from StockMovement
// (which is the generic in/out ledger every source type writes to) because
// this is the human-facing record: it keeps the reason and the before/after
// snapshot together for a single item, in one place, without having to
// re-derive "what did the count used to be" from the movement's balanceQty.
const stockAdjustmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },

    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    delta: { type: Number, required: true }, // newStock - previousStock, signed
    rate: { type: Number, required: true, min: 0 }, // cost basis used for the ledger posting
    valueChange: { type: Number, required: true }, // delta * rate, signed

    // Weight-mode items only: the same before/after/delta, but for stockKg.
    // Independent of the piece fields above — a stock take on a weight-mode
    // item counts pieces AND re-weighs them, since neither can be inferred
    // from the other.
    previousStockKg: { type: Number },
    newStockKg: { type: Number },
    deltaKg: { type: Number },

    reason: { type: String, trim: true, default: "Stock take" },
    // Groups every line entered in the same paste/submit together, so a bulk
    // stock take can be viewed or (in principle) reasoned about as one event.
    batchId: { type: String, index: true },

    date: { type: String, required: true }, // YYYY-MM-DD
  },
  { timestamps: true }
);

stockAdjustmentSchema.index({ owner: 1, date: -1 });

module.exports = mongoose.model("StockAdjustment", stockAdjustmentSchema);
