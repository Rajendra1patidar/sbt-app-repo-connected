const { randomUUID } = require("crypto");
const LedgerEntry = require("../models/LedgerEntry");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const ASSET_ACCOUNTS = ["Funds", "AccountsReceivable", "Stock"];
const LIABILITY_ACCOUNTS = ["VendorPayable"];
const INCOME_ACCOUNTS = ["Sales"];
const EXPENSE_ACCOUNTS = ["COGS", "Freight", "Labour", "OtherExpense"];
const EQUITY_ACCOUNTS = ["Capital"];

/**
 * Posts one balanced batch of ledger lines. Every call must have
 * sum(debit lines) === sum(credit lines), or it throws instead of writing
 * anything — this is the one place in the app that enforces double-entry.
 *
 * lines: [{ account, type: 'debit'|'credit', amount, customerId?, vendorId? }]
 * meta: { owner, sourceType, sourceId, narration, date }
 */
async function postEntries(lines, meta) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("A ledger batch needs at least two lines (one debit, one credit)");
  }
  if (!meta || !meta.owner || !meta.sourceType || !meta.sourceId) {
    throw new Error("postEntries requires meta.owner, meta.sourceType, meta.sourceId");
  }

  let debitTotal = 0;
  let creditTotal = 0;
  for (const l of lines) {
    if (!l.account || !l.type || !(Number(l.amount) >= 0)) {
      throw new Error("Every ledger line needs account, type, and a non-negative amount");
    }
    if (l.type === "debit") debitTotal += Number(l.amount);
    else if (l.type === "credit") creditTotal += Number(l.amount);
    else throw new Error(`Invalid ledger line type: ${l.type}`);
  }

  if (round2(debitTotal) !== round2(creditTotal)) {
    throw new Error(
      `Unbalanced ledger post for ${meta.sourceType} ${meta.sourceId}: Dr ${round2(debitTotal)} != Cr ${round2(creditTotal)}`
    );
  }

  const batchId = randomUUID();
  const date = meta.date || new Date().toISOString().slice(0, 10);

  const docs = lines
    .filter((l) => Number(l.amount) > 0) // zero-amount lines are pointless and break nothing by being dropped
    .map((l) => ({
      owner: meta.owner,
      date,
      account: l.account,
      type: l.type,
      amount: round2(l.amount),
      sourceType: meta.sourceType,
      sourceId: meta.sourceId,
      customerId: l.customerId || undefined,
      vendorId: l.vendorId || undefined,
      narration: meta.narration || "",
      batchId,
    }));

  if (!docs.length) return [];
  return LedgerEntry.insertMany(docs);
}

/**
 * Reverses every entry ever posted for a given source document (e.g. a
 * Payment that's being deleted, or an Estimate being edited after the fact).
 * Writes the mirror-image entries rather than deleting history, so the
 * ledger stays a complete audit trail.
 */
async function reverseSource(owner, sourceType, sourceId, narration) {
  const original = await LedgerEntry.find({ owner, sourceType, sourceId, reversed: { $ne: true } });
  if (!original.length) return [];

  const batchId = randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const reversedDocs = original.map((e) => ({
    owner,
    date,
    account: e.account,
    type: e.type === "debit" ? "credit" : "debit",
    amount: e.amount,
    sourceType,
    sourceId,
    customerId: e.customerId,
    vendorId: e.vendorId,
    narration: narration || `Reversal of ${e.narration}`,
    batchId,
  }));

  await LedgerEntry.updateMany({ _id: { $in: original.map((e) => e._id) } }, { $set: { reversed: true } });
  return LedgerEntry.insertMany(reversedDocs);
}

/** Net balance of one account, optionally scoped to a date range (inclusive). */
async function accountBalance(owner, account, { startDate, endDate } = {}) {
  const match = { owner, account };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = startDate;
    if (endDate) match.date.$lte = endDate;
  }
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
  return { debit: round2(debit), credit: round2(credit), net: round2(debit - credit) };
}

/** Trial Balance: every account's debit/credit totals, and whether they balance overall. */
async function trialBalance(owner, { startDate, endDate } = {}) {
  const match = { owner };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = startDate;
    if (endDate) match.date.$lte = endDate;
  }
  const rows = await LedgerEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$account",
        debit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
        credit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const accounts = rows.map((r) => ({ account: r._id, debit: round2(r.debit), credit: round2(r.credit) }));
  const totalDebit = round2(accounts.reduce((s, a) => s + a.debit, 0));
  const totalCredit = round2(accounts.reduce((s, a) => s + a.credit, 0));

  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/** Profit & Loss for a date range: Sales - COGS - operating expenses. */
async function profitAndLoss(owner, { startDate, endDate } = {}) {
  const balances = {};
  for (const acc of [...INCOME_ACCOUNTS, ...EXPENSE_ACCOUNTS]) {
    balances[acc] = await accountBalance(owner, acc, { startDate, endDate });
  }

  const sales = balances.Sales.credit - balances.Sales.debit; // debit side would be a sales reversal (return)
  const cogs = balances.COGS.debit - balances.COGS.credit;
  const freight = balances.Freight.debit - balances.Freight.credit;
  const labour = balances.Labour.debit - balances.Labour.credit;
  const other = balances.OtherExpense.debit - balances.OtherExpense.credit;

  const grossProfit = round2(sales - cogs);
  const totalOperatingExpense = round2(freight + labour + other);
  const netProfit = round2(grossProfit - totalOperatingExpense);

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    sales: round2(sales),
    cogs: round2(cogs),
    grossProfit,
    expenses: { freight: round2(freight), labour: round2(labour), other: round2(other), total: totalOperatingExpense },
    netProfit,
  };
}

/** Balance Sheet as of a date: Assets = Liabilities + Capital (+ retained P&L). */
async function balanceSheet(owner, { asOfDate } = {}) {
  const opts = asOfDate ? { endDate: asOfDate } : {};

  const funds = await accountBalance(owner, "Funds", opts);
  const receivable = await accountBalance(owner, "AccountsReceivable", opts);
  const stock = await accountBalance(owner, "Stock", opts);
  const payable = await accountBalance(owner, "VendorPayable", opts);
  const capital = await accountBalance(owner, "Capital", opts);

  const assetsTotal = round2(funds.net + receivable.net + stock.net);
  const liabilitiesTotal = round2(payable.credit - payable.debit);

  // Retained profit = net profit since inception up to asOfDate, folded into Capital
  // so the balance sheet closes without a separate "Retained Earnings" account.
  const pnl = await profitAndLoss(owner, asOfDate ? { endDate: asOfDate } : {});
  const capitalNet = round2(capital.credit - capital.debit + pnl.netProfit);

  return {
    asOfDate: asOfDate || null,
    assets: { funds: funds.net, accountsReceivable: receivable.net, stock: stock.net, total: assetsTotal },
    liabilities: { vendorPayable: liabilitiesTotal, total: liabilitiesTotal },
    capital: { total: capitalNet },
    balanced: assetsTotal === round2(liabilitiesTotal + capitalNet),
  };
}

/** Running-balance statement for one customer or one vendor. */
async function partyStatement(owner, { customerId, vendorId }) {
  const match = { owner };
  if (customerId) match.customerId = customerId;
  if (vendorId) match.vendorId = vendorId;

  const entries = await LedgerEntry.find(match).sort({ date: 1, createdAt: 1 }).lean();

  let running = 0;
  const rows = entries.map((e) => {
    // For a customer (Receivable): debit increases what they owe, credit decreases it.
    // For a vendor (Payable): credit increases what you owe, debit decreases it.
    const delta = vendorId
      ? (e.type === "credit" ? e.amount : -e.amount)
      : (e.type === "debit" ? e.amount : -e.amount);
    running = round2(running + delta);
    return {
      date: e.date,
      account: e.account,
      type: e.type,
      amount: e.amount,
      narration: e.narration,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      balance: running,
    };
  });

  return { rows, closingBalance: running };
}

/** All ledger postings in a date range, chronological — the Day Book. */
async function dayBook(owner, { startDate, endDate } = {}) {
  const match = { owner };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = startDate;
    if (endDate) match.date.$lte = endDate;
  }
  return LedgerEntry.find(match).sort({ date: 1, batchId: 1 }).lean();
}

module.exports = {
  postEntries,
  reverseSource,
  accountBalance,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  partyStatement,
  dayBook,
  ASSET_ACCOUNTS,
  LIABILITY_ACCOUNTS,
  INCOME_ACCOUNTS,
  EXPENSE_ACCOUNTS,
  EQUITY_ACCOUNTS,
};
