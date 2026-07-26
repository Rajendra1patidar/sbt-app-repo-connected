const mongoose = require("mongoose");

// Records one purchase transaction (one item, one vendor, one rate). This is
// what feeds the item's weighted-average purchasePrice and the Stock/COGS
// ledger accounts — unlike the old Item.purchasePrice field, which used to be
// a single manually-typed number with no history behind it.
const purchaseSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },

    qty: { type: Number, required: true, min: 0.001 },
    rate: { type: Number, required: true, min: 0 }, // cost per unit for this batch
    amount: { type: Number, required: true, min: 0 }, // qty * rate

    date: { type: String, required: true }, // YYYY-MM-DD

    // Whether this purchase was paid for immediately (Funds) or on credit
    // (VendorPayable, settled later via a Payment-style entry against the vendor).
    paymentStatus: { type: String, enum: ["paid", "unpaid", "partial"], default: "unpaid" },
    amountPaid: { type: Number, default: 0 },

    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

purchaseSchema.index({ owner: 1, date: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
