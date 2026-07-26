const mongoose = require("mongoose");

// One document per closed financial year. Closing a year snapshots every
// ledger account's ending balance (and total stock value) into
// openingBalances, which the *next* year's reports read as their starting
// point — this is what "carrying forward" means in practice, without having
// to replay the entire ledger history every time.
const financialYearSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true }, // YYYY-MM-DD

    closed: { type: Boolean, default: false },
    closedAt: { type: Date },

    // Ending balances as of endDate, carried forward as the opening position
    // for whatever year comes after this one.
    openingBalances: {
      funds: { type: Number, default: 0 },
      accountsReceivable: { type: Number, default: 0 },
      vendorPayable: { type: Number, default: 0 },
      stockValue: { type: Number, default: 0 },
      capital: { type: Number, default: 0 }, // includes retained profit from this year
    },
  },
  { timestamps: true }
);

financialYearSchema.index({ owner: 1, startDate: 1, endDate: 1 }, { unique: true });

module.exports = mongoose.model("FinancialYear", financialYearSchema);
