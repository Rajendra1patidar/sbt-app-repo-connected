const mongoose = require("mongoose");
const { sendAlert } = require("./alertWebhook");

// Once per server run: running without transactions means a crash halfway
// through a sale could leave stock, ledger and document out of step. That is
// fine on a laptop, but on the live database it deserves to be noticed.
let warnedNoTransactions = false;
function warnNoTransactions() {
  if (warnedNoTransactions) return;
  warnedNoTransactions = true;
  console.warn("WARNING: MongoDB transactions are not available - multi-step writes are NOT atomic.");
  if (process.env.NODE_ENV === "production") {
    sendAlert("⚠️ SBT backend: the database is running WITHOUT transactions, so sales/stock/ledger writes are not atomic. Use a replica-set database (MongoDB Atlas has one on every tier).");
  }
}

// Runs fn(session) inside a real MongoDB transaction, so a multi-step write
// (stock deduction + ledger postings + document save, for example) commits or
// rolls back as one unit instead of possibly leaving the DB half-updated if
// something throws partway through.
//
// Falls back to running fn(null) with no session on deployments where
// transactions aren't available (a standalone/non-replica-set MongoDB, which
// is common in local dev) — same atomicity isn't possible there, but every
// call site already tolerates session === null, so the app keeps working
// rather than hard-failing on local setups.
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTransactionsUnsupported(err)) {
      warnNoTransactions();
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

function isTransactionsUnsupported(err) {
  const msg = String((err && err.message) || "");
  return (
    msg.includes("Transaction numbers are only allowed") ||
    msg.includes("This MongoDB deployment does not support") ||
    msg.includes("IllegalOperation") ||
    err?.code === 20
  );
}

module.exports = { withTransaction };
