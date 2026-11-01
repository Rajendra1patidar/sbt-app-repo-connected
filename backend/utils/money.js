// One place that knows how an estimate's total is built. The app form computes
// the same number on the phone for display; the server computes it again and
// treats ITS number as the truth, so a stale offline payload, a buggy client or
// a tampered request can never put a total in the books that disagrees with the
// bill's own lines.
//
// Mirrors the form exactly (see DocumentModal.tsx): round(sum of qty*rate),
// minus round(sum of line discounts), plus freight, labour and - for OLD bills
// only - the previousDue that was folded into them before that practice ended.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function computeEstimateTotals({ lines, freightCost, labourCost, previousDue } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const gross = round2(list.reduce((s, l) => s + Number((l && l.qty) || 0) * Number((l && l.rate) || 0), 0));
  const discount = round2(list.reduce((s, l) => s + Number((l && l.discountAmount) || 0), 0));
  const itemsSubtotal = round2(gross - discount);
  const total = round2(
    itemsSubtotal + Number(freightCost || 0) + Number(labourCost || 0) + Number(previousDue || 0)
  );
  return { gross, discount, itemsSubtotal, total };
}

/** True when two totals differ by more than the ₹1 we tolerate for rounding. */
function totalsDiffer(a, b, tolerance = 1) {
  return Math.abs(round2(a) - round2(b)) > tolerance;
}

module.exports = { round2, computeEstimateTotals, totalsDiffer };
