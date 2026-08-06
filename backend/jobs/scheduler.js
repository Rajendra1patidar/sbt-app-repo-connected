const cron = require("node-cron");
const { runReconciliationCheck } = require("./reconciliationJob");

/**
 * Every scheduled/background job starts here — kept separate from server.js
 * so "everything that runs on its own, without a request" is visible in one
 * place, the same way listeners/index.js is for event-driven automation.
 * As more automation is added (reorder-suggestion sweeps, payment-reminder
 * sweeps), each new job gets registered here too.
 *
 * Schedule is configurable per deployment via env var instead of hardcoded,
 * so it can be tuned (or set to run every minute for local testing) without
 * a code change. Defaults to 2:00 AM server time daily — off business hours,
 * before the next day's estimates start posting.
 */
function start() {
  const schedule = process.env.RECONCILIATION_CRON || "0 2 * * *";
  cron.schedule(schedule, async () => {
    console.log("scheduler: running nightly ledger reconciliation check...");
    try {
      const summary = await runReconciliationCheck();
      console.log(
        `scheduler: reconciliation check done — ${summary.checked} owner(s) checked, ${summary.failed} with drift.`
      );
    } catch (err) {
      console.error("scheduler: reconciliation check crashed:", err.message);
    }
  });
  console.log(`scheduler: reconciliation check scheduled (${schedule})`);
}

module.exports = { start };
