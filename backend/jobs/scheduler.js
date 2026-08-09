const cron = require("node-cron");
const { runReconciliationCheck } = require("./reconciliationJob");
const { runReorderCheck } = require("./reorderCheckJob");
const { runCreditCheck } = require("./creditCheckJob");
const { runDailyReport } = require("./dailyReportJob");

/**
 * Every scheduled/background job starts here — kept separate from server.js
 * so "everything that runs on its own, without a request" is visible in one
 * place, the same way listeners/index.js is for event-driven automation.
 * As more automation is added (payment-reminder sweeps, etc.), each new job
 * gets registered here too.
 *
 * Schedules are configurable per deployment via env vars instead of
 * hardcoded, so they can be tuned (or set to run every minute for local
 * testing) without a code change.
 */
function start() {
  const reconciliationSchedule = process.env.RECONCILIATION_CRON || "0 2 * * *"; // 2 AM — off business hours
  cron.schedule(reconciliationSchedule, async () => {
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
  console.log(`scheduler: reconciliation check scheduled (${reconciliationSchedule})`);

  const reorderSchedule = process.env.REORDER_CHECK_CRON || "0 7 * * *"; // 7 AM — start of the business day
  cron.schedule(reorderSchedule, async () => {
    console.log("scheduler: running daily reorder check...");
    try {
      const summary = await runReorderCheck();
      console.log(
        `scheduler: reorder check done — ${summary.checked} owner(s) checked, ${summary.notified} new notification(s).`
      );
    } catch (err) {
      console.error("scheduler: reorder check crashed:", err.message);
    }
  });
  console.log(`scheduler: reorder check scheduled (${reorderSchedule})`);

  const creditSchedule = process.env.CREDIT_CHECK_CRON || "0 8 * * *"; // 8 AM — after reorder, still start of day
  cron.schedule(creditSchedule, async () => {
    console.log("scheduler: running daily customer credit-risk check...");
    try {
      const summary = await runCreditCheck();
      console.log(
        `scheduler: credit-risk check done — ${summary.checked} owner(s) checked, ${summary.notified} new notification(s).`
      );
    } catch (err) {
      console.error("scheduler: credit-risk check crashed:", err.message);
    }
  });
  console.log(`scheduler: credit-risk check scheduled (${creditSchedule})`);

  // 8 PM IST — shortly after a 7 PM store close. Timezone is passed explicitly
  // here (unlike the jobs above) because Render's servers run UTC by default;
  // without it this would fire at 8 PM UTC (1:30 AM IST) instead.
  const dailyReportSchedule = process.env.DAILY_REPORT_CRON || "0 20 * * *";
  cron.schedule(
    dailyReportSchedule,
    async () => {
      console.log("scheduler: running daily report...");
      try {
        const summary = await runDailyReport();
        console.log(`scheduler: daily report done — ${summary.checked} owner(s) checked, ${summary.sent} sent.`);
      } catch (err) {
        console.error("scheduler: daily report crashed:", err.message);
      }
    },
    { timezone: "Asia/Kolkata" }
  );
  console.log(`scheduler: daily report scheduled (${dailyReportSchedule}, Asia/Kolkata)`);
}

module.exports = { start };