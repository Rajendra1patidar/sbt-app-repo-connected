const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }, // optional — who this restock will likely be ordered from
    qty: { type: Number, required: true },
    date: { type: String },
    notes: { type: String },
    status: { type: String, enum: ["Pending", "Received"], default: "Pending" },
  },
  { timestamps: true }
);

// Speeds up the sorted list query at scale.
orderSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
