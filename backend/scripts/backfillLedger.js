/**
 * One-time backfill: posts LedgerEntry rows for every Estimate, Payment,
 * Expense, and embedded Return that existed BEFORE double-entry bookkeeping
 * was added to the app. Without this, Trial Balance / P&L / Balance Sheet
 * would only reflect transactions created after go-live and everything
 * older would simply be missing from the ledger.
 *
 * WHAT THIS DOES, IN ORDER:
 *   1. Opening Stock — one entry per item with stock > 0, posting
 *        Dr Stock / Cr Capital  for (item.stock * item.purchasePrice)
 *      This seeds the Stock ledger account to match today's real inventory
 *      value. There is no historical Purchase data to replay (the Purchase
 *      model is brand new), so this is a single opening balance, not a
 *      transaction-by-transaction reconstruction.
 *   2. Estimates — for every estimate not yet posted, Dr AccountsReceivable /
 *      Cr Sales for its total.
 *   3. Payments — for every payment/refund not yet posted (excluding
 *      method: "Refund", which step 5 handles instead), Dr Funds / Cr
 *      AccountsReceivable (or the mirror image for a refund amount).
 *   4. Paid-at-creation gap-fill — some old estimates were marked "Paid" at
 *      creation time with no separate Payment row at all. For those, this
 *      posts the missing Dr Funds / Cr AccountsReceivable settlement so the
 *      receivable doesn't sit open forever.
 *   5. Returns — for every estimate with embedded returns not yet posted,
 *      reverses the sale (Dr Sales / Cr AccountsReceivable, then Dr
 *      AccountsReceivable / Cr Funds for the refund) using the refund
 *      Payment row that addReturn already created.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   - It does NOT back-post COGS/Stock entries for historical estimate
 *     sales. Item.purchasePrice today is just today's weighted-average cost
 *     — using it to guess the cost of a sale from 3 months ago would produce
 *     a fabricated, likely-wrong margin. Historical P&L will show real Sales
 *     but zero COGS/gross-profit before go-live; true margin tracking only
 *     starts being accurate from the day Purchases start getting recorded.
 *   - It does NOT touch Item.stock or Item.purchasePrice. Those numbers are
 *     already correct from years of live use — this script only writes
 *     ledger/audit rows alongside them, never mutates them.
 *
 * SAFE TO RE-RUN: every step checks for existing LedgerEntry rows with the
 * matching sourceType + sourceId before posting, so running this twice does
 * not double-book anything.
 *
 * Run once, locally, after pulling this update and BEFORE relying on the
 * ledger/reports in production:
 *   cd backend
 *   node scripts/backfillLedger.js
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Document = require("../models/Document");
const Item = require("../models/Item");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const LedgerEntry = require("../models/LedgerEntry");
const ledgerService = require("../services/ledgerService");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

async function alreadyPosted(owner, sourceType, sourceId) {
  const existing = await LedgerEntry.findOne({ owner, sourceType, sourceId });
  return !!existing;
}

// ---- 1. Opening stock ----
async function backfillOpeningStock() {
  const items = await Item.find({});
  let posted = 0;
  let skipped = 0;

  for (const item of items) {
    const stock = Number(item.stock) || 0;
    const cost = Number(item.purchasePrice) || 0;
    const value = round2(stock * cost);
    if (value <= 0) {
      skipped++;
      continue;
    }
    if (await alreadyPosted(item.owner, "Opening", item._id)) {
      skipped++;
      continue;
    }

    await ledgerService.postEntries(
      [
        { account: "Stock", type: "debit", amount: value },
        { account: "Capital", type: "credit", amount: value },
      ],
      {
        owner: item.owner,
        sourceType: "Opening",
        sourceId: item._id,
        date: today(),
        narration: `Opening stock: ${item.name} (${stock} @ ${cost})`,
      }
    );
    posted++;
  }

  console.log(`Opening stock: posted ${posted}, skipped ${skipped} (already posted or zero value)`);
}

// ---- 2. Estimates: Sales / Receivable ----
async function backfillEstimates() {
  const estimates = await Document.find({ type: "estimate" });
  let posted = 0;
  let skipped = 0;

  for (const doc of estimates) {
    if (await alreadyPosted(doc.owner, "Estimate", doc._id)) {
      skipped++;
      continue;
    }
    const total = round2(doc.total);
    if (total <= 0) {
      skipped++;
      continue;
    }

    await ledgerService.postEntries(
      [
        { account: "AccountsReceivable", type: "debit", amount: total, customerId: doc.customerId },
        { account: "Sales", type: "credit", amount: total, customerId: doc.customerId },
      ],
      {
        owner: doc.owner,
        sourceType: "Estimate",
        sourceId: doc._id,
        date: doc.date || today(),
        narration: `Estimate ${doc.number} (backfilled)`,
      }
    );
    posted++;
  }

  console.log(`Estimates: posted ${posted}, skipped ${skipped} (already posted or zero total)`);
}

// ---- 3. Payments: Funds / Receivable (refund-method payments are handled in step 5) ----
async function backfillPayments() {
  const payments = await Payment.find({ method: { $ne: "Refund" } });
  let posted = 0;
  let skipped = 0;

  for (const payment of payments) {
    if (!payment.customerId) {
      skipped++;
      continue;
    }
    if (await alreadyPosted(payment.owner, "Payment", payment._id)) {
      skipped++;
      continue;
    }
    const amt = round2(Math.abs(payment.amount));
    if (amt <= 0) {
      skipped++;
      continue;
    }
    const isRefund = Number(payment.amount) < 0;

    const lines = isRefund
      ? [
          { account: "AccountsReceivable", type: "debit", amount: amt, customerId: payment.customerId },
          { account: "Funds", type: "credit", amount: amt, customerId: payment.customerId },
        ]
      : [
          { account: "Funds", type: "debit", amount: amt, customerId: payment.customerId },
          { account: "AccountsReceivable", type: "credit", amount: amt, customerId: payment.customerId },
        ];

    await ledgerService.postEntries(lines, {
      owner: payment.owner,
      sourceType: "Payment",
      sourceId: payment._id,
      date: payment.date || today(),
      narration: `${isRefund ? "Refund" : "Payment"}${payment.invoiceNumber ? " · " + payment.invoiceNumber : ""} (backfilled)`,
    });
    posted++;
  }

  console.log(`Payments: posted ${posted}, skipped ${skipped} (already posted, no customer, or zero amount)`);
}

// ---- 4. Gap-fill: estimates marked Paid at creation with no matching Payment total ----
async function backfillPaidAtCreationGap() {
  const estimates = await Document.find({ type: "estimate", amountPaid: { $gt: 0 } });
  let posted = 0;
  let skipped = 0;

  for (const doc of estimates) {
    // A Funds line under sourceType "Estimate" only ever comes from this gap-fill step
    // (step 2 only ever posts Receivable/Sales) — so its presence marks this doc as done.
    const alreadyGapFilled = await LedgerEntry.findOne({
      owner: doc.owner,
      sourceType: "Estimate",
      sourceId: doc._id,
      account: "Funds",
    });
    if (alreadyGapFilled) {
      skipped++;
      continue;
    }

    const payments = await Payment.find({ owner: doc.owner, invoiceId: doc._id });
    const settledByPayments = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
    const gap = round2(Number(doc.amountPaid || 0) - settledByPayments);

    if (gap <= 0) {
      skipped++;
      continue;
    }

    await ledgerService.postEntries(
      [
        { account: "Funds", type: "debit", amount: gap, customerId: doc.customerId },
        { account: "AccountsReceivable", type: "credit", amount: gap, customerId: doc.customerId },
      ],
      {
        owner: doc.owner,
        sourceType: "Estimate",
        sourceId: doc._id,
        date: doc.date || today(),
        narration: `Paid at creation, no separate payment record · ${doc.number} (backfilled)`,
      }
    );
    posted++;
  }

  console.log(`Paid-at-creation gap-fill: posted ${posted}, skipped ${skipped} (already filled or no gap)`);
}

// ---- 5. Returns: Sales reversal + refund ----
async function backfillReturns() {
  const estimates = await Document.find({ type: "estimate", "returns.0": { $exists: true } });
  let posted = 0;
  let skipped = 0;

  for (const doc of estimates) {
    if (await alreadyPosted(doc.owner, "Return", doc._id)) {
      skipped++;
      continue;
    }

    const refundTotal = round2((doc.returns || []).reduce((s, r) => s + Number(r.amount || 0), 0));
    if (refundTotal <= 0) {
      skipped++;
      continue;
    }

    const date = (doc.returns[doc.returns.length - 1] || {}).date || doc.date || today();

    await ledgerService.postEntries(
      [
        { account: "Sales", type: "debit", amount: refundTotal, customerId: doc.customerId },
        { account: "AccountsReceivable", type: "credit", amount: refundTotal, customerId: doc.customerId },
      ],
      { owner: doc.owner, sourceType: "Return", sourceId: doc._id, date, narration: `Return against ${doc.number} (backfilled)` }
    );
    await ledgerService.postEntries(
      [
        { account: "AccountsReceivable", type: "debit", amount: refundTotal, customerId: doc.customerId },
        { account: "Funds", type: "credit", amount: refundTotal, customerId: doc.customerId },
      ],
      { owner: doc.owner, sourceType: "Return", sourceId: doc._id, date, narration: `Refund paid · ${doc.number} (backfilled)` }
    );
    posted++;
  }

  console.log(`Returns: posted ${posted}, skipped ${skipped} (already posted or zero refund)`);
}

// ---- 6. Expenses: expense category / Funds ----
function mapExpenseAccount(category) {
  const c = (category || "").toLowerCase();
  if (/freight|transport|delivery|fuel|diesel/.test(c)) return "Freight";
  if (/labour|labor|wage|worker/.test(c)) return "Labour";
  return "OtherExpense";
}

async function backfillExpenses() {
  const expenses = await Expense.find({});
  let posted = 0;
  let skipped = 0;

  for (const expense of expenses) {
    if (await alreadyPosted(expense.owner, "Expense", expense._id)) {
      skipped++;
      continue;
    }
    const amount = round2(expense.amount);
    if (amount <= 0) {
      skipped++;
      continue;
    }

    await ledgerService.postEntries(
      [
        { account: mapExpenseAccount(expense.category), type: "debit", amount },
        { account: "Funds", type: "credit", amount },
      ],
      {
        owner: expense.owner,
        sourceType: "Expense",
        sourceId: expense._id,
        date: expense.date || today(),
        narration: `${expense.category}${expense.vendor ? " · " + expense.vendor : ""} (backfilled)`,
      }
    );
    posted++;
  }

  console.log(`Expenses: posted ${posted}, skipped ${skipped} (already posted or zero amount)`);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to backend/.env or export it before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected:", mongoose.connection.host);

  console.log("\n--- Backfilling ledger from existing data ---");
  await backfillOpeningStock();
  await backfillEstimates();
  await backfillPayments();
  await backfillPaidAtCreationGap();
  await backfillReturns();
  await backfillExpenses();

  console.log("\n--- Verifying: Trial Balance per owner ---");
  const owners = await LedgerEntry.distinct("owner");
  for (const owner of owners) {
    const tb = await ledgerServiceTrialBalanceFor(owner);
    console.log(
      `Owner ${owner}: Dr ${tb.totalDebit} / Cr ${tb.totalCredit} — ${tb.balanced ? "BALANCED ✓" : "NOT BALANCED ✗ (investigate before trusting reports)"}`
    );
  }

  console.log("\nDone. Re-running this script again is safe — already-posted entries are skipped.");
  await mongoose.disconnect();
}

async function ledgerServiceTrialBalanceFor(owner) {
  return ledgerService.trialBalance(owner);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
