const crypto = require("crypto");
const BankStatementLine = require("../models/BankStatementLine");
const LedgerEntry = require("../models/LedgerEntry");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DATE_WINDOW_DAYS = 3;

function daysBetween(a, b) {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

/**
 * Imports bank statement rows and immediately attempts to auto-match each
 * one against an unreversed "Funds" ledger entry with the same amount and
 * a nearby date.
 *
 * Sign convention matches how the rest of the app already posts to Funds
 * (see paymentController): money in = debit, money out = credit. A row
 * only auto-matches when exactly one unclaimed ledger entry fits both the
 * exact amount and the date window — any ambiguity (several candidates, or
 * none) is left unmatched for manual review rather than guessed at, and a
 * ledger entry already claimed by an earlier row in this same batch can't
 * also be claimed by a later one.
 */
async function importAndMatch(owner, rows) {
  const importBatchId = crypto.randomUUID();

  const cleanRows = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      date: String(r.date || "").slice(0, 10),
      description: String(r.description || "").trim(),
      amount: round2(Number(r.amount)),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(r.amount) && r.amount !== 0);

  if (cleanRows.length === 0) {
    const e = new Error("No valid rows to import — each row needs a date (YYYY-MM-DD) and a non-zero amount");
    e.status = 400;
    throw e;
  }

  const sortedDates = cleanRows.map((r) => r.date).sort();
  const windowStart = new Date(sortedDates[0]);
  windowStart.setDate(windowStart.getDate() - DATE_WINDOW_DAYS);
  const windowEnd = new Date(sortedDates[sortedDates.length - 1]);
  windowEnd.setDate(windowEnd.getDate() + DATE_WINDOW_DAYS);

  const [candidateEntries, claimedIdsRaw] = await Promise.all([
    LedgerEntry.find({
      owner,
      account: "Funds",
      reversed: false,
      date: { $gte: windowStart.toISOString().slice(0, 10), $lte: windowEnd.toISOString().slice(0, 10) },
    }).select("date type amount"),
    BankStatementLine.find({ owner, matched: true, matchedLedgerEntryId: { $ne: null } }).distinct(
      "matchedLedgerEntryId"
    ),
  ]);
  const claimedIds = new Set(claimedIdsRaw.map(String));
  const pool = candidateEntries.filter((e) => !claimedIds.has(String(e._id)));

  const created = [];
  for (const row of cleanRows) {
    const wantType = row.amount > 0 ? "debit" : "credit"; // money in = Dr Funds, money out = Cr Funds
    const wantAmount = round2(Math.abs(row.amount));

    const candidates = pool.filter(
      (e) => e.type === wantType && round2(e.amount) === wantAmount && daysBetween(e.date, row.date) <= DATE_WINDOW_DAYS
    );

    let matched = false;
    let matchedLedgerEntryId = null;
    if (candidates.length === 1) {
      matched = true;
      matchedLedgerEntryId = candidates[0]._id;
      const idx = pool.findIndex((e) => String(e._id) === String(matchedLedgerEntryId));
      if (idx >= 0) pool.splice(idx, 1); // claimed — a later row in this batch can't also take it
    }

    const doc = await BankStatementLine.create({
      owner,
      date: row.date,
      description: row.description,
      amount: row.amount,
      importBatchId,
      matched,
      matchedLedgerEntryId,
      matchedManually: false,
    });
    created.push(doc);
  }

  return {
    importBatchId,
    imported: created.length,
    matched: created.filter((d) => d.matched).length,
    unmatched: created.filter((d) => !d.matched).length,
    lines: created,
  };
}

/** Manually link a bank line to a specific ledger entry — for when auto-match couldn't pick one confidently. */
async function manualMatch(owner, bankLineId, ledgerEntryId) {
  const line = await BankStatementLine.findOne({ _id: bankLineId, owner });
  if (!line) {
    const e = new Error("Bank statement line not found");
    e.status = 404;
    throw e;
  }
  const entry = await LedgerEntry.findOne({ _id: ledgerEntryId, owner, account: "Funds" });
  if (!entry) {
    const e = new Error("Ledger entry not found");
    e.status = 404;
    throw e;
  }

  line.matched = true;
  line.matchedLedgerEntryId = entry._id;
  line.matchedManually = true;
  await line.save();
  return line;
}

/** Clears a match, whether it was automatic or manual — puts the line back to needing review. */
async function unmatch(owner, bankLineId) {
  const line = await BankStatementLine.findOneAndUpdate(
    { _id: bankLineId, owner },
    { $set: { matched: false, matchedLedgerEntryId: null, matchedManually: false } },
    { new: true }
  );
  if (!line) {
    const e = new Error("Bank statement line not found");
    e.status = 404;
    throw e;
  }
  return line;
}

module.exports = { importAndMatch, manualMatch, unmatch };
