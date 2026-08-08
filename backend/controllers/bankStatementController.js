const BankStatementLine = require("../models/BankStatementLine");
const LedgerEntry = require("../models/LedgerEntry");
const bankReconciliationService = require("../services/bankReconciliationService");

// POST /api/bank-statement/import  { rows: [{ date, description, amount }] }
// amount: positive = money in, negative = money out (standard bank-statement sign convention)
exports.import = async (req, res, next) => {
  try {
    const result = await bankReconciliationService.importAndMatch(req.userId, req.body.rows);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// GET /api/bank-statement?matched=true|false
exports.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.matched === "true") filter.matched = true;
    if (req.query.matched === "false") filter.matched = false;
    const lines = await BankStatementLine.find(filter).sort({ date: -1, createdAt: -1 }).limit(500);
    res.json(lines);
  } catch (err) {
    next(err);
  }
};

// POST /api/bank-statement/:id/match  { ledgerEntryId }
exports.match = async (req, res, next) => {
  try {
    const line = await bankReconciliationService.manualMatch(req.userId, req.params.id, req.body.ledgerEntryId);
    res.json(line);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/bank-statement/:id/unmatch
exports.unmatch = async (req, res, next) => {
  try {
    const line = await bankReconciliationService.unmatch(req.userId, req.params.id);
    res.json(line);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// GET /api/bank-statement/candidates?date=&amount=
// Helps a manual-match screen find likely ledger entries for one unmatched
// bank line — same matching rules as auto-match (Funds account, same
// amount, ±7 days here since a human is choosing, not the system guessing),
// minus anything already claimed by another bank line.
exports.candidates = async (req, res, next) => {
  try {
    const { date, amount } = req.query;
    if (!date || amount === undefined) {
      return res.status(400).json({ message: "date and amount are required" });
    }
    const wantAmount = Math.abs(Number(amount));
    const wantType = Number(amount) > 0 ? "debit" : "credit";
    const from = new Date(date);
    from.setDate(from.getDate() - 7);
    const to = new Date(date);
    to.setDate(to.getDate() + 7);

    const claimedIds = await BankStatementLine.find({
      owner: req.userId,
      matched: true,
      matchedLedgerEntryId: { $ne: null },
    }).distinct("matchedLedgerEntryId");

    const entries = await LedgerEntry.find({
      owner: req.userId,
      account: "Funds",
      type: wantType,
      amount: wantAmount,
      reversed: false,
      date: { $gte: from.toISOString().slice(0, 10), $lte: to.toISOString().slice(0, 10) },
      _id: { $nin: claimedIds },
    }).sort({ date: 1 });

    res.json(entries);
  } catch (err) {
    next(err);
  }
};
