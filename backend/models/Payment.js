const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    amount: { type: Number, required: true },
    date: { type: String },
    method: { type: String },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    invoiceNumber: { type: String },
    type: { type: String, enum: ["advance", "partial", "full", "refund"] },
  },
  { timestamps: true }
);

// Speeds up the sorted list query, plus the per-invoice and per-customer lookups
// used for invoice payment history and customer statements.
paymentSchema.index({ owner: 1, createdAt: -1 });
paymentSchema.index({ owner: 1, invoiceId: 1 });
paymentSchema.index({ owner: 1, customerId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
