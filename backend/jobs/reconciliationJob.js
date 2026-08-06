const User = require("../models/User");
const reconciliationService = require("../services/reconciliationService");
const eventBus = require("../services/eventBus");
const { sendErrorAlert } = require("../utils/alertWebhook");

/**
 * Runs reconciliationService.integrityCheck (previously only callable
 * on-demand from the "Ledger Integrity Check" screen) for every owner in the
 * system, and raises an alert for any owner whose books have drifted. This
 * is what makes the ledger self-auditing: a mismatch gets caught overnight
 * instead of whenever someone happens to notice a wrong number on screen.
 *
 * Checks full history (no date range) for each owner — for a small-business
 * dataset this is cheap, and it means a drift introduced weeks ago that
 * nobody has looked at recently still gets caught, not just recent activity.
 */
async function runReconciliationCheck() {
  const users = await User.find({}, { _id: 1 });
  const summary = { checked: 0, failed: 0 };

  for (const user of users) {
    summary.checked += 1;
    try {
      const result = await reconciliationService.integrityCheck(user._id);
      if (!result.allOk) {
        summary.failed += 1;
        const failedChecks = result.checks.filter((c) => !c.ok);
        const detail = failedChecks
          .map((c) => `${c.check}: source ${c.sourceTotal} vs ledger ${c.ledgerTotal} (diff ${c.diff})`)
          .join("; ");

        // Fire-and-forget best-effort ping to whatever chat webhook is
        // configured — same channel that's already used for production
        // error alerts, so there's only one place to go check.
        await sendErrorAlert({
          message: `Ledger reconciliation drift for owner ${user._id}: ${detail}`,
          method: "CRON",
          path: "reconciliationJob",
          status: 200,
          userId: String(user._id),
        });

        eventBus.emit("reconciliation.failed", {
          owner: user._id,
          failedCount: failedChecks.length,
          detail,
        });
      }
    } catch (err) {
      // A single owner's check erroring (e.g. a bad aggregation on
      // malformed data) must not stop the rest of the owners from being
      // checked, and still deserves an alert of its own.
      console.error(`reconciliationJob: check failed for owner ${user._id}:`, err.message);
      await sendErrorAlert({
        message: `Reconciliation job itself errored for owner ${user._id}: ${err.message}`,
        method: "CRON",
        path: "reconciliationJob",
        status: 500,
        userId: String(user._id),
      });
    }
  }

  return summary;
}

module.exports = { runReconciliationCheck };
