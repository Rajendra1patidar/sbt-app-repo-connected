const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }, // preferred/usual supplier, used by reorder suggestions
    name: { type: String, required: true, trim: true },
    sellingPrice: { type: Number, default: 0, min: [0, "Selling price can't be negative"] },
    purchasePrice: { type: Number, default: 0, min: [0, "Purchase price can't be negative"] },
    unit: { type: String, trim: true },
    stock: { type: Number, default: 0, min: [0, "Stock can't go negative"] },
    lowStock: { type: Number, default: 5, min: [0, "Low-stock threshold can't be negative"] },
    category: { type: String, trim: true, default: "Others" },
    trackingMode: { type: String, enum: ["unit", "box"], default: "unit" },
    piecesPerBox: { type: Number, default: 0, min: [0, "Pieces per box can't be negative"] },
    // soft-delete: an item used on any historical estimate/purchase can't be hard-deleted
    // without breaking that document's line items — deleting instead flags it, hides it
    // from pickers/lists, and blocks it from being selected on new documents, while
    // existing documents that reference it keep resolving normally.
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    // Normalized copy of name, kept in sync via the pre-validate hook below.
    // Backs the unique index — the controller's own find-then-create check is just
    // a fast-path for a friendly message; this index is what actually prevents two
    // simultaneous requests from both slipping past that check (see
    // itemController.create's E11000 handling).
    nameKey: { type: String, select: false },
  },
  { timestamps: true }
);

// Speeds up the sorted list query and the per-owner duplicate-name scan in findDuplicate.
itemSchema.index({ owner: 1, createdAt: -1 });

// Enforces per-owner uniqueness on normalized name at the DB level, among active
// items only — a soft-deleted item's old name stays free to reuse, matching the
// controller's existing "active items only" duplicate-check semantics.
itemSchema.index(
  { owner: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { deleted: false } }
);

itemSchema.pre("validate", function (next) {
  this.nameKey = (this.name || "").trim().toLowerCase();
  next();
});

// findOneAndUpdate (used by itemController.update) bypasses the document
// pre('validate') hook above, so nameKey has to be kept in sync here too —
// otherwise a rename could go stale in the index and stop actually enforcing
// uniqueness against the item's new name.
itemSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.name !== undefined) set.nameKey = (set.name || "").trim().toLowerCase();
  next();
});

module.exports = mongoose.model("Item", itemSchema);
