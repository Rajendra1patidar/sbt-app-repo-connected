const Expense = require("../models/Expense");
const crudController = require("./crudController");
const ledgerService = require("../services/ledgerService");

const base = crudController(Expense);

// Free-text expense categories get mapped onto the three expense accounts the
// ledger actually tracks. Anything not recognized as freight/transport or
// labour/wages falls back to OtherExpense — nothing gets lost, it just isn't
// broken out on its own P&L line.
function mapExpenseAccount(category) {
  const c = (category || "").toLowerCase();
  if (/freight|transport|delivery|fuel|diesel/.test(c)) return "Freight";
  if (/labour|labor|wage|worker/.test(c)) return "Labour";
  return "OtherExpense";
}

base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const amount = Number(v.amount);
    const date = v.date || new Date().toISOString().slice(0, 10);
    const doc = await Expense.create({
      owner: req.userId,
      category: v.category,
      vendor: v.vendor,
      amount,
      date,
    });

    if (amount > 0) {
      const account = mapExpenseAccount(v.category);
      await ledgerService.postEntries(
        [
          { account, type: "debit", amount },
          { account: "Funds", type: "credit", amount },
        ],
        { owner: req.userId, sourceType: "Expense", sourceId: doc._id, date, narration: `${v.category}${v.vendor ? " · " + v.vendor : ""}` }
      );
    }

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

base.remove = async (req, res, next) => {
  try {
    const doc = await Expense.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });
    await ledgerService.reverseSource(req.userId, "Expense", doc._id, "Expense entry removed");
    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
};

// The generic crudController.update() (plain findOneAndUpdate) is intentionally
// NOT used here: it would silently change amount/category without touching the
// ledger entries this expense already posted, leaving the old amount posted
// forever. There's no reverse-and-repost logic for expenses yet, so block edits
// at the API level and force delete + recreate instead until that's built.
base.update = async (req, res) => {
  res.status(405).json({ message: "Editing an expense isn't supported yet — delete it and record a new one instead, so the ledger stays in sync." });
};

// exported so reconciliationService checks expenses against the same account
// each one was actually posted to, instead of guessing the mapping again
base.mapExpenseAccount = mapExpenseAccount;

module.exports = base;
