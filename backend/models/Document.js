const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    qty: { type: Number, default: 1, min: [0.001, "Line quantity must be greater than 0"] },
    // Weight-mode items only: pieces physically removed from stock, captured
    // independently of `qty`. For these items `qty` holds the weighed kg
    // (so qty * rate still gives the correct billed amount, since rate is
    // ₹/kg) — `piecesQty` is the separate, non-derived physical stock count.
    piecesQty: { type: Number, min: [0, "Pieces can't be negative"] },
    // Which godown this line dispatches from. Optional — falls back to the
    // owner's default godown (see stockService.resolveGodownId).
    godownId: { type: mongoose.Schema.Types.ObjectId, ref: "Godown" },
    rate: { type: Number, min: [0, "Line rate can't be negative"] },
    // flat ₹ discount off this line's subtotal (qty * rate). Shown as its own
    // line on the printed estimate rather than netted silently into the rate.
    discountAmount: { type: Number, default: 0, min: [0, "Line discount can't be negative"] },
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
    total: { type: Number, default: 0, min: [0, "Total can't be negative"] },
    status: { type: String, default: "Due" },
    // running total of payments applied against this document (positive payments minus refunds),
    // used to distinguish Due / Partially Paid / Paid instead of a plain binary flag
    amountPaid: { type: Number, default: 0 },
    // only true when the user explicitly chose "Advance Booking" at save time — gates the
    // batch-collection feature so it doesn't show up on ordinary estimates
    isAdvanceBooking: { type: Boolean, default: false },
    // estimate-specific extra charges/carry-forward
    freightCost: { type: Number, default: 0, min: [0, "Freight cost can't be negative"] },
    labourCost: { type: Number, default: 0, min: [0, "Labour cost can't be negative"] },
    previousDue: { type: Number, default: 0, min: [0, "Previous due can't be negative"] },
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
        // Weight-mode items only: pieces physically returned, independent of
        // `qty` (which holds returned kg for these items).
        piecesQty: { type: Number },
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
    // lightweight audit trail: creation, status changes, returns, and deliveries
    // are all logged here so a document's story can be seen at a glance later
    history: [
      {
        action: { type: String, required: true },
        date: { type: String },
        note: { type: String },
        _id: false,
      },
    ],
    // soft-delete: a "deleted" estimate is never actually removed from the DB —
    // it stays in place (same number, same position) but is flagged so it's
    // excluded from the normal list/reports and locked from further edits until
    // it's explicitly restored.
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// Speeds up the common list query (owner + type, sorted newest-first) and
// per-customer lookups (e.g. customer statements, balance calculations).
documentSchema.index({ owner: 1, type: 1, createdAt: -1 });
documentSchema.index({ owner: 1, customerId: 1 });

module.exports = mongoose.model("Document", documentSchema);
