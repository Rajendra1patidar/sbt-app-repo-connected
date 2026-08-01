const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    // optional soft credit limit — checked client-side before a new estimate is
    // submitted (outstanding + new total vs this) and shown as a warning, never
    // a hard block. Left unset (no limit) for most customers.
    creditLimit: { type: Number, min: [0, "Credit limit can't be negative"] },
  },
  { timestamps: true }
);

// Speeds up the sorted list query and the per-owner duplicate-name scan in findDuplicate.
customerSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Customer", customerSchema);
