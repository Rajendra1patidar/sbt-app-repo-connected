const FinancialYear = require("../models/FinancialYear");
const ledgerService = require("../services/ledgerService");
const stockService = require("../services/stockService");

// GET /api/financial-years
exports.list = async (req, res, next) => {
  try {
    const docs = await FinancialYear.find({ owner: req.userId }).sort({ startDate: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// POST /api/financial-years   { startDate, endDate }
exports.create = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate are required" });
    const doc = await FinancialYear.create({ owner: req.userId, startDate, endDate });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// POST /api/financial-years/:id/close
// Snapshots every ledger account's balance as of this year's endDate, plus the
// current total stock value, into openingBalances — this is what the next
// financial year reads as its starting point instead of assuming zero.
exports.close = async (req, res, next) => {
  try {
    const fy = await FinancialYear.findOne({ _id: req.params.id, owner: req.userId });
    if (!fy) return res.status(404).json({ message: "Financial year not found" });
    if (fy.closed) return res.status(400).json({ message: "This financial year is already closed" });

    const funds = await ledgerService.accountBalance(req.userId, "Funds", { endDate: fy.endDate });
    const receivable = await ledgerService.accountBalance(req.userId, "AccountsReceivable", { endDate: fy.endDate });
    const payable = await ledgerService.accountBalance(req.userId, "VendorPayable", { endDate: fy.endDate });
    const balanceSheet = await ledgerService.balanceSheet(req.userId, { asOfDate: fy.endDate });
    const { totalValue: stockValue } = await stockService.stockValuation(req.userId);

    fy.openingBalances = {
      funds: funds.net,
      accountsReceivable: receivable.net,
      vendorPayable: round2(payable.credit - payable.debit),
      stockValue,
      capital: balanceSheet.capital.total,
    };
    fy.closed = true;
    fy.closedAt = new Date();
    await fy.save();

    res.json(fy);
  } catch (err) {
    next(err);
  }
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
