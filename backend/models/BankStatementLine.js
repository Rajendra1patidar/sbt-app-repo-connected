const mongoose = require("mongoose");

// One row from an imported bank/UPI statement. Auto-matched against an
// unreversed "Funds" LedgerEntry where the amount and date line up
// unambiguously (see services/bankReconciliationService) — anything left
// unmatched needs a human to either manually link it or investigate why it
// doesn't show up in the ledger at all.
const bankStatementLineSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    description: { type: String, trim: true, default: "" },
    // Positive = money in (deposit/credit on the statement), negative = money out (withdrawal/debit)
    amount: { type: Number, required: true },
    // Groups every row from one import together, for review/undo of a whole batch.
    importBatchId: { type: String, required: true, index: true },
    matched: { type: Boolean, default: false, index: true },
    matchedLedgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerEntry", default: null },
    matchedManually: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bankStatementLineSchema.index({ owner: 1, matched: 1, date: -1 });

module.exports = mongoose.model("BankStatementLine", bankStatementLineSchema);
