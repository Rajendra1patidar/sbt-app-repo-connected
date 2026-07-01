const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    qty: { type: Number, default: 1 },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["quote", "invoice", "challan"], required: true, index: true },
    number: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    date: { type: String },
    dueDate: { type: String },
    lines: [lineSchema],
    notes: { type: String },
    total: { type: Number, default: 0 },
    status: { type: String, default: "Draft" },
    // challan-specific fields (route sheet)
    route: { type: String },
    fromDate: { type: String },
    toDate: { type: String },
    byWhom: { type: String },
    transporter: { type: String },
    expenses: [{ label: String, amount: Number }],
    incomes: [{ label: String, amount: Number }],
    deliveryFee: { type: Number },
    feeVerified: { type: Boolean },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
