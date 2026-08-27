const Notification = require("../models/Notification");
const deadStockService = require("../services/deadStockService");
const eventBus = require("../services/eventBus");
const { findOwnerUsers } = require("../utils/ownerAccounts");

/**
 * Runs deadStockService.computeDeadStock for every owner and turns each
 * newly-flagged item into a notification.
 *
 * Same shape as reorderCheckJob/creditCheckJob: this only surfaces the
 * flag — it never discounts, archives, or otherwise touches the item.
 * De-duped per item the same way too, so an item that stays dead stock
 * doesn't generate a fresh notification every night; reading (or acting on)
 * the existing one is what clears the way for the next alert.
 */
async function runDeadStockCheck() {
  const users = await findOwnerUsers();
  const summary = { checked: 0, notified: 0 };

  for (const user of users) {
    summary.checked += 1;
    try {
      const deadItems = await deadStockService.computeDeadStock(user._id);
      for (const d of deadItems) {
        const alreadyNotified = await Notification.exists({
          owner: user._id,
          type: "stock.dead-stock",
          refId: d.itemId,
          read: false,
        });
        if (alreadyNotified) continue;

        summary.notified += 1;
        eventBus.emit("stock.dead-stock", {
          owner: user._id,
          itemId: d.itemId,
          name: d.name,
          stock: d.stock,
          stockKg: d.stockKg,
          isWeight: d.isWeight,
          value: d.value,
          lastSaleDate: d.lastSaleDate,
        });
      }
    } catch (err) {
      console.error(`deadStockJob: check failed for owner ${user._id}:`, err.message);
    }
  }

  return summary;
}

module.exports = { runDeadStockCheck };
