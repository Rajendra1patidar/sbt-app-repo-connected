const mongoose = require("mongoose");
const LedgerEntry = require("../models/LedgerEntry");
const Purchase = require("../models/Purchase");
const Document = require("../models/Document");
const Expense = require("../models/Expense");
const { mapExpenseAccount } = require("../controllers/expenseController");

// Same reasoning as ledgerService.toOwnerId: aggregate() pipelines skip Mongoose's
// automatic string->ObjectId casting, so owner has to be cast by hand here too.
const toOwnerId = (owner) =>
  mongoose.Types.ObjectId.isValid(owner) ? new mongoose.Types.ObjectId(owner) : owner;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function dateMatch(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = startDate;
  if (endDate) range.$lte = endDate;
  return { date: range };
}

/**
 * Net debit-credit total the ledger holds for one (sourceType, account) pair
 * in a date range. Deliberately does NOT filter out reversed entries — a
 * reversal is itself a same-sourceType posting with the opposite type, so
 * including both is what makes a deleted/edited transaction net to zero
 * instead of disappearing from one side of the comparison but not the other.
 */
async function ledgerNet(owner, { sourceType, account, startDate, endDate }) {
  const match = { owner: toOwnerId(owner), sourceType, account, ...dateMatch(startDate, endDate) };
  const rows = await LedgerEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        debit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
        credit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
      },
    },
  ]);
  const debit = rows[0]?.debit || 0;
  const credit = rows[0]?.credit || 0;
  return round2(debit - credit);
}

function buildCheck(name, sourceTotal, ledgerTotal, note) {
  const diff = round2(sourceTotal - ledgerTotal);
  return {
    check: name,
    sourceTotal: round2(sourceTotal),
    ledgerTotal: round2(ledgerTotal),
    diff,
    ok: Math.abs(diff) < 0.01,
    note,
  };
}

/**
 * Runs the ledger's source-of-truth collections (Purchase, Document/Estimate,
 * Expense) against what actually got posted to LedgerEntry, and returns any
 * account where the two sides disagree for the given date range. This is the
 * check that would have caught a silent P&L mismatch immediately instead of
 * someone noticing wrong numbers on screen — each row here should read ok:true
 * on a healthy ledger; a false row means source data and ledger have drifted.
 */
async function integrityCheck(owner, { startDate, endDate } = {}) {
  const results = [];

  // 1) Purchases -> Stock debits posted with sourceType "Purchase".
  // (The Stock account also moves via Estimate/Return COGS postings, which is
  // why this compares against sourceType "Purchase" specifically rather than
  // the whole Stock account balance.)
  {
    const purchaseTotal = await Purchase.aggregate([
      { $match: { owner: toOwnerId(owner), ...dateMatch(startDate, endDate) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const sourceTotal = purchaseTotal[0]?.total || 0;
    const ledgerTotal = await ledgerNet(owner, { sourceType: "Purchase", account: "Stock", startDate, endDate });
    results.push(
      buildCheck(
        "Purchases vs Stock ledger",
        sourceTotal,
        ledgerTotal,
        "Deleting a purchase reverses this ledger side but never adjusts Item.stock qty — a mismatch here can be expected if a purchase was deleted after other stock moved; check Bug 1 in the review before assuming an error."
      )
    );
  }

  // 2) Estimates minus returns -> net Sales postings (sourceType "Estimate" + "Return").
  {
    const estimateTotal = await Document.aggregate([
      { $match: { owner: toOwnerId(owner), type: "estimate", deleted: { $ne: true }, ...dateMatch(startDate, endDate) } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);
    const returnStages = [
      { $match: { owner: toOwnerId(owner), type: "estimate", deleted: { $ne: true } } },
      { $unwind: "$returns" },
    ];
    if (startDate || endDate) {
      const range = {};
      if (startDate) range.$gte = startDate;
      if (endDate) range.$lte = endDate;
      returnStages.push({ $match: { "returns.date": range } });
    }
    returnStages.push({ $group: { _id: null, total: { $sum: "$returns.amount" } } });
    const returnTotal = await Document.aggregate(returnStages);
    const sourceTotal = (estimateTotal[0]?.total || 0) - (returnTotal[0]?.total || 0);

    const salesEstimate = await ledgerNet(owner, { sourceType: "Estimate", account: "Sales", startDate, endDate });
    const salesReturn = await ledgerNet(owner, { sourceType: "Return", account: "Sales", startDate, endDate });
    const ledgerTotal = salesEstimate + salesReturn;

    results.push(
      buildCheck(
        "Estimates (net of returns) vs Sales ledger",
        sourceTotal,
        ledgerTotal,
        "A deleted/edited estimate that was re-posted after this range began can also show a diff here — the reversal is dated at edit time, not the original estimate date."
      )
    );
  }

  // 3) Expenses grouped by the account each category maps to, vs that account's
  // sourceType "Expense" postings.
  {
    const expenses = await Expense.aggregate([
      { $match: { owner: toOwnerId(owner), ...dateMatch(startDate, endDate) } },
      { $project: { amount: 1, category: 1 } },
    ]);
    const byAccount = { Freight: 0, Labour: 0, OtherExpense: 0 };
    for (const e of expenses) {
      byAccount[mapExpenseAccount(e.category)] += Number(e.amount) || 0;
    }
    for (const account of Object.keys(byAccount)) {
      const ledgerTotal = await ledgerNet(owner, { sourceType: "Expense", account, startDate, endDate });
      results.push(buildCheck(`Expenses (${account}) vs ledger`, byAccount[account], ledgerTotal));
    }
  }

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    checks: results,
    allOk: results.every((r) => r.ok),
  };
}

module.exports = { integrityCheck };