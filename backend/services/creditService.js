const Document = require("../models/Document");
const Payment = require("../models/Payment");
const Customer = require("../models/Customer");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// How many of a customer's most recent settled payments feed the
// payment-speed average — recent behaviour matters more than ancient
// history, and this keeps the calculation cheap regardless of how many
// years of payments have piled up.
const LOOKBACK_PAYMENTS = 20;

/**
 * Computes a credit-risk view per customer: current outstanding + overdue
 * amount (same bucket logic as reportsController.arAging), plus a real
 * payment-speed average derived from actual Payment dates against each
 * invoice's dueDate — not a guess.
 *
 * Deliberately never writes anything. Customer.creditLimit is already
 * documented as a "soft limit, warning only" field the owner sets by hand —
 * this only adds a *suggested* adjustment on top of that, exactly the same
 * suggest-don't-act pattern as the reorder engine. Nothing here changes a
 * customer's actual credit limit.
 */
async function computeCreditView(owner) {
  const [unpaidEstimates, customers, payments] = await Promise.all([
    Document.find({ owner, type: "estimate", deleted: { $ne: true }, status: { $ne: "Paid" } }).select(
      "customerId total amountPaid dueDate"
    ),
    Customer.find({ owner }).select("name phone creditLimit"),
    Payment.find({ owner, hidden: { $ne: true }, type: { $ne: "refund" }, invoiceId: { $ne: null } })
      .select("customerId date invoiceId")
      .sort({ date: -1 })
      .limit(2000), // per-owner cap — plenty for small-business payment volume
  ]);

  // dueDate is needed for every invoice a recent payment touched, including
  // ones that are now fully paid (and so wouldn't appear in unpaidEstimates).
  const invoiceIds = [...new Set(payments.map((p) => String(p.invoiceId)))];
  const invoices = invoiceIds.length
    ? await Document.find({ owner, _id: { $in: invoiceIds } }).select("dueDate")
    : [];
  const invoiceMap = new Map(invoices.map((d) => [String(d._id), d]));
  const customerMap = new Map(customers.map((c) => [String(c._id), c]));

  const today = new Date();
  const outstandingByCustomer = new Map(); // customerId -> { outstanding, overdue, oldestDaysPastDue }
  for (const doc of unpaidEstimates) {
    const outstanding = round2(Number(doc.total || 0) - Number(doc.amountPaid || 0));
    if (outstanding <= 0.009) continue;
    const key = String(doc.customerId || "unknown");
    const entry = outstandingByCustomer.get(key) || { outstanding: 0, overdue: 0, oldestDaysPastDue: 0 };
    entry.outstanding = round2(entry.outstanding + outstanding);
    if (doc.dueDate) {
      const daysPastDue = Math.floor((today - new Date(doc.dueDate)) / 86400000);
      if (daysPastDue > 0) {
        entry.overdue = round2(entry.overdue + outstanding);
        entry.oldestDaysPastDue = Math.max(entry.oldestDaysPastDue, daysPastDue);
      }
    }
    outstandingByCustomer.set(key, entry);
  }

  // payment speed: days between an invoice's dueDate and when it was
  // actually paid (negative = paid early, positive = paid late)
  const speedByCustomer = new Map();
  for (const p of payments) {
    const inv = invoiceMap.get(String(p.invoiceId));
    if (!inv || !inv.dueDate || !p.customerId) continue;
    const key = String(p.customerId);
    const arr = speedByCustomer.get(key) || [];
    if (arr.length < LOOKBACK_PAYMENTS) {
      arr.push(Math.floor((new Date(p.date) - new Date(inv.dueDate)) / 86400000));
    }
    speedByCustomer.set(key, arr);
  }

  const results = [];
  for (const [id, customer] of customerMap) {
    const info = outstandingByCustomer.get(id) || { outstanding: 0, overdue: 0, oldestDaysPastDue: 0 };
    const speeds = speedByCustomer.get(id) || [];
    const avgDaysLate = speeds.length ? round2(speeds.reduce((s, d) => s + d, 0) / speeds.length) : null;
    const onTimeRatio = speeds.length ? round2(1 - speeds.filter((d) => d > 0).length / speeds.length) : null;

    if (info.outstanding <= 0 && speeds.length === 0) continue; // nothing to say about this customer yet

    // Simple, explainable rules rather than a black-box score — the owner
    // can see exactly why a customer landed where they did.
    let risk = "good";
    if (info.oldestDaysPastDue > 60 || (onTimeRatio != null && onTimeRatio < 0.5)) risk = "risk";
    else if (info.oldestDaysPastDue > 30 || (onTimeRatio != null && onTimeRatio < 0.8)) risk = "watch";

    let suggestedCreditLimit = null;
    if (customer.creditLimit != null) {
      if (risk === "risk") suggestedCreditLimit = Math.max(0, round2(customer.creditLimit * 0.5));
      else if (risk === "good" && onTimeRatio === 1 && info.overdue === 0) {
        suggestedCreditLimit = round2(customer.creditLimit * 1.25);
      }
    }

    results.push({
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      creditLimit: customer.creditLimit ?? null,
      outstanding: info.outstanding,
      overdue: info.overdue,
      oldestDaysPastDue: info.oldestDaysPastDue,
      avgDaysLate,
      onTimeRatio,
      risk,
      suggestedCreditLimit,
    });
  }

  const riskOrder = { risk: 0, watch: 1, good: 2 };
  results.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk] || b.overdue - a.overdue);

  return results;
}

module.exports = { computeCreditView };
