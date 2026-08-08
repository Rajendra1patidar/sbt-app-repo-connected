const Notification = require("../models/Notification");
const creditService = require("../services/creditService");
const eventBus = require("../services/eventBus");
const { findOwnerUsers } = require("../utils/ownerAccounts");

/**
 * Runs creditService.computeCreditView for every owner and turns any
 * customer in the worst risk tier ("risk") into a notification.
 *
 * Same shape as reorderCheckJob: surfaces the flag, never changes anything
 * — a customer's creditLimit is untouched here, same as it is in
 * creditService itself. De-duped per customer the same way too, so a
 * persistently risky customer doesn't generate a fresh notification every
 * morning while the last one is still unread.
 */
async function runCreditCheck() {
  const users = await findOwnerUsers();
  const summary = { checked: 0, notified: 0 };

  for (const user of users) {
    summary.checked += 1;
    try {
      const view = await creditService.computeCreditView(user._id);
      for (const c of view) {
        if (c.risk !== "risk") continue;

        const alreadyNotified = await Notification.exists({
          owner: user._id,
          type: "customer.credit-risk",
          refId: c.customerId,
          read: false,
        });
        if (alreadyNotified) continue;

        summary.notified += 1;
        eventBus.emit("customer.credit-risk", {
          owner: user._id,
          customerId: c.customerId,
          name: c.name,
          overdue: c.overdue,
          oldestDaysPastDue: c.oldestDaysPastDue,
        });
      }
    } catch (err) {
      console.error(`creditCheckJob: check failed for owner ${user._id}:`, err.message);
    }
  }

  return summary;
}

module.exports = { runCreditCheck };
