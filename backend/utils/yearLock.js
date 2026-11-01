const FinancialYear = require("../models/FinancialYear");

// Throws a 400 if `date` falls inside a financial year that has been closed.
// Closing a year snapshots opening balances for the next one, so adding,
// editing or removing anything dated inside it afterwards would make that
// snapshot wrong. Used by estimates/challans AND now by payments, expenses,
// purchases and stock adjustments, so the lock can't be sidestepped by posting
// a different kind of entry into a closed year. No-ops when there is no date.
async function assertYearNotLocked(owner, date, session) {
  if (!date) return;
  const fy = await FinancialYear.findOne({
    owner,
    closed: true,
    startDate: { $lte: date },
    endDate: { $gte: date },
  }).session(session || null);
  if (fy) {
    const err = new Error(
      `This falls in the financial year ${fy.startDate} to ${fy.endDate}, which is closed and can't be modified.`
    );
    err.status = 400;
    throw err;
  }
}

module.exports = { assertYearNotLocked };
