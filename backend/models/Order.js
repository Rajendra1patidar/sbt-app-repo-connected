const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }, // optional — who this restock will likely be ordered from
    qty: { type: Number, required: true },
    // Cost per unit for this restock, and the resulting amount owed. Stock is no
    // longer bumped by a manual "mark as received" — it's bumped automatically
    // once `amountPaid` reaches `amount` (see recordPayment in orderController).
    rate: { type: Number, default: 0, min: [0, "Rate can't be negative"] },
    amount: { type: Number, default: 0, min: [0, "Amount can't be negative"] },
    amountPaid: { type: Number, default: 0, min: [0, "Amount paid can't be negative"] },
    paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
    date: { type: String },
    notes: { type: String },
    status: { type: String, enum: ["Pending", "Received"], default: "Pending" },
  },
  { timestamps: true }
);

// Speeds up the sorted list query at scale.
orderSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
