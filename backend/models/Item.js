const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    purchasePrice: { type: Number, default: 0 },
    unit: { type: String, trim: true },
    stock: { type: Number, default: 0 },
    lowStock: { type: Number, default: 5 },
    category: { type: String, trim: true, default: "Others" },
    trackingMode: { type: String, enum: ["unit", "box"], default: "unit" },
    piecesPerBox: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", itemSchema);
