const ledgerService = require("../services/ledgerService");
const stockService = require("../services/stockService");

// GET /api/ledger/trial-balance?startDate=&endDate=
exports.trialBalance = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await ledgerService.trialBalance(req.userId, { startDate, endDate });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/ledger/profit-loss?startDate=&endDate=
exports.profitAndLoss = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await ledgerService.profitAndLoss(req.userId, { startDate, endDate });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/ledger/balance-sheet?asOfDate=
exports.balanceSheet = async (req, res, next) => {
  try {
    const { asOfDate } = req.query;
    const result = await ledgerService.balanceSheet(req.userId, { asOfDate });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/ledger/day-book?startDate=&endDate=
exports.dayBook = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await ledgerService.dayBook(req.userId, { startDate, endDate });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/ledger/account-balance?account=&startDate=&endDate=
// Used by the Day Book's running-balance column: pass endDate = the day
// before the visible range's "From" date to get the opening balance to
// carry forward, instead of starting the running total at zero.
exports.accountBalance = async (req, res, next) => {
  try {
    const { account, startDate, endDate } = req.query;
    if (!account) return res.status(400).json({ message: "account is required" });
    const result = await ledgerService.accountBalance(req.userId, account, { startDate, endDate });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/ledger/stock-valuation
exports.stockValuation = async (req, res, next) => {
  try {
    const result = await stockService.stockValuation(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/ledger/customers/:id/statement
exports.customerStatement = async (req, res, next) => {
  try {
    const result = await ledgerService.partyStatement(req.userId, { customerId: req.params.id });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
