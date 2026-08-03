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
    // Normalized copies of name/phone, kept in sync via the pre-validate hook below.
    // These back the unique index — the controller's own find-then-create check is
    // just a fast-path for a friendly message; this index is what actually prevents
    // two simultaneous requests from both slipping past that check and creating
    // duplicate customers (see customerController.create's E11000 handling).
    nameKey: { type: String, select: false },
    phoneKey: { type: String, select: false },
  },
  { timestamps: true }
);

// Speeds up the sorted list query and the per-owner duplicate-name scan in findDuplicate.
customerSchema.index({ owner: 1, createdAt: -1 });

// Enforces per-owner uniqueness on normalized name+phone at the DB level, closing
// the race window that a plain find-then-create check can't close by itself.
customerSchema.index({ owner: 1, nameKey: 1, phoneKey: 1 }, { unique: true });

customerSchema.pre("validate", function (next) {
  this.nameKey = (this.name || "").trim().toLowerCase();
  this.phoneKey = (this.phone || "").replace(/\D/g, "");
  next();
});

// findOneAndUpdate (used by customerController.update) bypasses the document
// pre('validate') hook above, so nameKey/phoneKey have to be kept in sync here
// too — otherwise a rename could go stale in the index and stop actually
// enforcing uniqueness against the customer's new name/phone.
customerSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.name !== undefined) set.nameKey = (set.name || "").trim().toLowerCase();
  if (set.phone !== undefined) set.phoneKey = (set.phone || "").replace(/\D/g, "");
  next();
});

module.exports = mongoose.model("Customer", customerSchema);
