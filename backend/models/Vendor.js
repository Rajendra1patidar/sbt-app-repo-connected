const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    // Typical days between placing an order with this vendor and stock
    // actually arriving. Feeds the reorder-point calculation in
    // reorderService — left unset, items from this vendor fall back to a
    // conservative default lead time instead of failing the calculation.
    leadTimeDays: { type: Number, default: 7, min: 0 },
  },
  { timestamps: true }
);

// Speeds up the sorted list query and the per-owner duplicate-name scan in findDuplicate.
vendorSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Vendor", vendorSchema);
