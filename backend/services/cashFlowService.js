const Document = require("../models/Document");
const Expense = require("../models/Expense");
const ledgerService = require("./ledgerService");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A 30/60/90-day cash position projection built only from what's actually
 * on record — this is not a day-by-day cash-flow model, and it doesn't
 * pretend to be.
 *
 * Inflows: unpaid estimates bucketed by their real dueDate. Already-overdue
 * ones count as "due now" (the conservative read), not spread optimistically
 * across the future. Estimates with no dueDate set are reported separately
 * as "no due date" rather than guessed into a bucket.
 *
 * Outflows: the only forward-looking assumption here is a trailing 90-day
 * average of real Expense records, projected forward at that same rate —
 * a straight average of real history, not a model. Vendor payables have no
 * due-date field anywhere in the schema, so they're reported as a single
 * "outstanding, timing unknown" figure instead of being force-fit into a
 * 30/60/90 bucket that would imply a precision the data doesn't support.
 */
async function computeCashFlowForecast(owner) {
  const today = todayStr();
  const horizon60 = addDays(today, 60);
  const horizon90 = addDays(today, 90);

  const [fundsBalance, receivableBalance, payableBalance, unpaidEstimates, recentExpenses] = await Promise.all([
    ledgerService.accountBalance(owner, "Funds"),
    ledgerService.accountBalance(owner, "AccountsReceivable"),
    ledgerService.accountBalance(owner, "VendorPayable"),
    Document.find({ owner, type: "estimate", deleted: { $ne: true }, status: { $ne: "Paid" } }).select(
      "total amountPaid dueDate"
    ),
    Expense.find({ owner, date: { $gte: addDays(today, -90) } }).select("amount date"),
  ]);

  const currentCash = fundsBalance.net;
  // VendorPayable is a liability account — same sign convention as balanceSheet
  // in ledgerService: credit minus debit, not accountBalance's raw .net.
  const outstandingPayable = round2(payableBalance.credit - payableBalance.debit);

  const buckets = { overdue: 0, next30: 0, next60: 0, next90: 0, beyond90: 0, noDueDate: 0 };
  for (const doc of unpaidEstimates) {
    const outstanding = round2(Number(doc.total || 0) - Number(doc.amountPaid || 0));
    if (outstanding <= 0.009) continue;
    if (!doc.dueDate) {
      buckets.noDueDate = round2(buckets.noDueDate + outstanding);
    } else if (doc.dueDate < today) {
      buckets.overdue = round2(buckets.overdue + outstanding);
    } else if (doc.dueDate <= addDays(today, 30)) {
      buckets.next30 = round2(buckets.next30 + outstanding);
    } else if (doc.dueDate <= horizon60) {
      buckets.next60 = round2(buckets.next60 + outstanding);
    } else if (doc.dueDate <= horizon90) {
      buckets.next90 = round2(buckets.next90 + outstanding);
    } else {
      buckets.beyond90 = round2(buckets.beyond90 + outstanding);
    }
  }

  const totalRecentExpenses = round2(recentExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const avgMonthlyExpense = recentExpenses.length ? round2(totalRecentExpenses / 3) : 0;

  const projected30 = round2(currentCash + buckets.overdue + buckets.next30 - avgMonthlyExpense);
  const projected60 = round2(currentCash + buckets.overdue + buckets.next30 + buckets.next60 - avgMonthlyExpense * 2);
  const projected90 = round2(
    currentCash + buckets.overdue + buckets.next30 + buckets.next60 + buckets.next90 - avgMonthlyExpense * 3
  );

  return {
    asOfDate: today,
    currentCash,
    outstandingReceivable: receivableBalance.net,
    outstandingPayable,
    expectedInflows: { ...buckets },
    avgMonthlyExpense,
    projected: { in30Days: projected30, in60Days: projected60, in90Days: projected90 },
    notes: [
      "Outstanding vendor payables have no due date on record — shown as a single figure, not placed in a 30/60/90 bucket.",
      buckets.noDueDate > 0
        ? `${buckets.noDueDate} in unpaid estimates has no due date set and isn't included in the 30/60/90 projection above.`
        : null,
    ].filter(Boolean),
  };
}

module.exports = { computeCashFlowForecast };
