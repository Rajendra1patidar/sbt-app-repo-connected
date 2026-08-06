const User = require("../models/User");
const Notification = require("../models/Notification");
const reorderService = require("../services/reorderService");
const eventBus = require("../services/eventBus");

/**
 * Runs reorderService.computeSuggestions for every owner and turns any
 * pace-based suggestion into a notification.
 *
 * Deliberately stops there: no draft Purchase is created and no WhatsApp
 * message is sent automatically — this only surfaces the recommendation,
 * same as the existing Inventory screen, just without anyone needing to
 * open the app to see it. Placing the order is still a manual, deliberate
 * action.
 *
 * De-duped per item: if an unread reorder notification for this item
 * already exists, it's skipped rather than piling up a fresh one every
 * night the item stays low — reading (or acting on) the existing one is
 * what clears the way for the next alert.
 */
async function runReorderCheck() {
  const users = await User.find({}, { _id: 1 });
  const summary = { checked: 0, notified: 0 };

  for (const user of users) {
    summary.checked += 1;
    try {
      const suggestions = await reorderService.computeSuggestions(user._id);
      for (const s of suggestions) {
        if (s.mode !== "pace") continue; // static-alert items already surface via the stock.low event on estimate creation

        const alreadyNotified = await Notification.exists({
          owner: user._id,
          type: "stock.reorder-suggested",
          refId: s.itemId,
          read: false,
        });
        if (alreadyNotified) continue;

        summary.notified += 1;
        eventBus.emit("stock.reorder-suggested", {
          owner: user._id,
          itemId: s.itemId,
          name: s.name,
          stock: s.stock,
          suggestedQty: s.suggestedQty,
          daysLeft: s.daysLeft,
          vendor: s.vendor,
        });
      }
    } catch (err) {
      console.error(`reorderCheckJob: check failed for owner ${user._id}:`, err.message);
    }
  }

  return summary;
}

module.exports = { runReorderCheck };
