const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, required: true },
    vendor: { type: String },
    amount: { type: Number, required: true },
    date: { type: String },
  },
  { timestamps: true }
);

// Speeds up the sorted list query at scale.
expenseSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
