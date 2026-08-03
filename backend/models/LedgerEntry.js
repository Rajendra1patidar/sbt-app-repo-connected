const mongoose = require("mongoose");

// Every business transaction in the app (Estimate, Payment, Expense, Purchase,
// Return) posts one or more LedgerEntry rows here. Every posting call writes at
// least two rows — one debit, one credit — sharing a batchId, so the whole
// ledger is self-checking: sum(debit) must always equal sum(credit).
//
// This collection is append-only from the app's point of view. Nothing here
// ever gets edited in place; corrections are made by posting a reversing entry.
const ledgerEntrySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    date: { type: String, required: true, index: true }, // YYYY-MM-DD, matches rest of app's date convention

    account: {
      type: String,
      required: true,
      enum: [
        "Funds", // cash + bank, combined (no GST/real-bank integration by design)
        "AccountsReceivable", // what customers owe you
        "VendorPayable", // what you owe suppliers
        "Sales", // revenue from estimates
        "Stock", // inventory value on hand
        "COGS", // cost of goods sold
        "Freight",
        "Labour",
        "OtherExpense",
        "Capital", // owner's equity / drawings
      ],
      index: true,
    },

    type: { type: String, enum: ["debit", "credit"], required: true },
    amount: { type: Number, required: true, min: 0 },

    // Which real-world transaction caused this posting
    sourceType: {
      type: String,
      enum: ["Estimate", "Payment", "Expense", "Purchase", "Return", "Order", "Opening", "Manual"],
      required: true,
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Optional party linkage, used for per-customer / per-vendor statements
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },

    narration: { type: String, trim: true, default: "" },

    // Groups every line of one transaction together so a batch's debits/credits
    // can be checked for balance independently of the rest of the ledger.
    batchId: { type: String, required: true, index: true },

    // True once this batch has been reversed by an opposite posting (e.g. a
    // payment that was later deleted). Reversed entries stay in the ledger for
    // audit purposes but are excluded from balance calculations going forward
    // by virtue of the reversing entry cancelling them out numerically — this
    // flag is just for UI clarity, not a requirement for correctness.
    reversed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ owner: 1, account: 1, date: 1 });
ledgerEntrySchema.index({ owner: 1, batchId: 1 });
ledgerEntrySchema.index({ owner: 1, customerId: 1 });
ledgerEntrySchema.index({ owner: 1, vendorId: 1 });

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
