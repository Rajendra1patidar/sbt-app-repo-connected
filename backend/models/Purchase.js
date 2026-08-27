const mongoose = require("mongoose");

// Unified restock record. Every unit of stock that comes in from a supplier —
// whether you placed an Order and paid it off, or logged an already-received
// Purchase directly — lives in this one collection now, distinguished by
// `source`. This is what lets a single Order show up as one card in both the
// Orders screen (filtered to source:"order") and the Purchases screen (every
// record, both sources), instead of living in two disconnected collections
// that could drift out of sync with each other.
//
//   source "order"  — placed now, nothing owed is assumed paid yet. Stock is
//                      only counted (status flips to "Received") once
//                      amountPaid reaches amount. This is the "ask to pay,
//                      then increase stock" flow.
//   source "manual" — a purchase you're logging after the fact, stock
//                      already in hand. Stock is bumped immediately on
//                      creation regardless of payment status; Pay here only
//                      settles money owed to the vendor.
const purchaseSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }, // optional for "order" (may not know the vendor yet); enforced as required by the controller for "manual"

    qty: { type: Number, required: true, min: 0.001 },
    // For weight-mode items only: the actual weighed kg received alongside
    // `qty` pieces. Kept independent of qty — never derived from it — since
    // per-piece weight varies batch to batch. `rate` for these items is
    // ₹/kg and is applied against qtyKg, not qty, for costing.
    qtyKg: { type: Number, min: [0, "Weight can't be negative"] },
    // Which godown this stock was received into. Optional — omitting it
    // falls back to the owner's default godown (see stockService.resolveGodownId),
    // so purchases made before Godowns existed, or by owners who never set
    // one up, keep working unchanged.
    godownId: { type: mongoose.Schema.Types.ObjectId, ref: "Godown" },
    rate: { type: Number, default: 0, min: [0, "Rate can't be negative"] },
    amount: { type: Number, default: 0, min: [0, "Amount can't be negative"] },
    amountPaid: { type: Number, default: 0, min: [0, "Amount paid can't be negative"] },
    paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },

    source: { type: String, enum: ["order", "manual"], required: true },
    // "Received" means stock has actually been counted for this record.
    // "order" docs start Pending and flip once fully paid; "manual" docs
    // are created already Received since the stock is already on hand.
    status: { type: String, enum: ["Pending", "Received"], default: "Pending" },

    date: { type: String }, // YYYY-MM-DD
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

purchaseSchema.index({ owner: 1, createdAt: -1 });
purchaseSchema.index({ owner: 1, source: 1, createdAt: -1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
