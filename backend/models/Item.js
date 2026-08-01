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
  },
  { timestamps: true }
);

// Speeds up the sorted list query and the per-owner duplicate-name scan in findDuplicate.
itemSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Item", itemSchema);
