const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    qty: { type: Number, default: 1 },
    rate: { type: Number },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["estimate", "challan"], required: true, index: true },
    number: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    date: { type: String },
    dueDate: { type: String },
    lines: [lineSchema],
    notes: { type: String },
    total: { type: Number, default: 0 },
    status: { type: String, default: "Due" },
    // running total of payments applied against this document (positive payments minus refunds),
    // used to distinguish Due / Partially Paid / Paid instead of a plain binary flag
    amountPaid: { type: Number, default: 0 },
    // estimate-specific extra charges/carry-forward
    freightCost: { type: Number, default: 0 },
    labourCost: { type: Number, default: 0 },
    previousDue: { type: Number, default: 0 },
    contractorName: { type: String },
    destination: { type: String },
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
    // items the customer returned after this estimate was paid — each entry books a refund
    returns: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
        name: { type: String },
        qty: { type: Number },
        rate: { type: Number },
        amount: { type: Number },
        date: { type: String },
        _id: false,
      },
    ],
    // advance-booking support: an estimate can be booked/paid up front but collected in
    // arbitrary batches over time (e.g. 100 bags booked, taken 30 + 25 + ... later).
    // Each entry logs one collected batch; it never exceeds the booked line qty.
    deliveries: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
        name: { type: String },
        qty: { type: Number },
        date: { type: String },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
