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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
