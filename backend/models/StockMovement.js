const mongoose = require("mongoose");

// One row per unit of stock movement (in from a Purchase, out from an Estimate
// sale, back in from a Return). Unlike Item.stock, which only ever shows the
// current quantity, this collection is the audit trail behind that number and
// also carries the ₹ cost basis at the time of each movement — which is what
// makes a real Stock Valuation report possible.
const stockMovementSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },

    direction: { type: String, enum: ["in", "out"], required: true },
    qty: { type: Number, required: true, min: 0.001 },
    rate: { type: Number, required: true, min: 0 }, // cost basis per unit at time of movement

    // Running balance snapshot immediately after this movement, so a stock
    // valuation as of any point in time can be read directly off this row
    // instead of re-summing the whole history every time.
    balanceQty: { type: Number, required: true },
    balanceValue: { type: Number, required: true },

    sourceType: { type: String, enum: ["Purchase", "Estimate", "Return", "Order", "Adjustment"], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },

    date: { type: String, required: true }, // YYYY-MM-DD
  },
  { timestamps: true }
);

stockMovementSchema.index({ owner: 1, itemId: 1, date: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
