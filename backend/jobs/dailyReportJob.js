const Item = require("../models/Item");
const ledgerService = require("../services/ledgerService");
const { findOwnerUsers } = require("../utils/ownerAccounts");
const { sendTelegramMessage } = require("../utils/telegramClient");

/**
 * Posts a same-day close-out summary to Telegram, meant to land right around
 * closing time. Everything here comes straight from the ledger — the same
 * source of truth the Trial Balance / P&L / Balance Sheet reports use —
 * rather than re-deriving totals from raw Documents/Payments/Expenses like
 * reportsController.summary does, so this can never drift from what those
 * reports say for the same day.
 *
 * Uses its own bot token + chat id (TELEGRAM_REPORT_BOT_TOKEN /
 * TELEGRAM_REPORT_CHAT_ID) — deliberately separate from the error-alert bot,
 * so "server crashed" and "here's today's numbers" aren't in the same feed.
 * If those env vars aren't set, this is a silent no-op (same convention as
 * alertWebhook.js) so a dev/staging deployment without a report bot
 * configured doesn't spam errors every night.
 */
async function runDailyReport() {
  const summary = { checked: 0, sent: 0 };

  const botToken = process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;
  if (!botToken || !chatId) {
    console.log("dailyReportJob: TELEGRAM_REPORT_BOT_TOKEN/CHAT_ID not set — skipping.");
    return summary;
  }

  const today = new Date().toISOString().slice(0, 10); // same YYYY-MM-DD convention used on documents/payments/expenses throughout the app

  const users = await findOwnerUsers();
  for (const user of users) {
    summary.checked += 1;
    try {
      const text = await buildReportText(user._id, today);
      const ok = await sendTelegramMessage(botToken, chatId, text);
      if (ok) summary.sent += 1;
    } catch (err) {
      console.error(`dailyReportJob: failed for owner ${user._id}:`, err.message);
    }
  }

  return summary;
}

async function buildReportText(ownerId, today) {
  const [pnl, cashToday, arOutstanding, lowStockItems] = await Promise.all([
    ledgerService.profitAndLoss(ownerId, { startDate: today, endDate: today }),
    ledgerService.accountBalance(ownerId, "Funds", { startDate: today, endDate: today }),
    ledgerService.accountBalance(ownerId, "AccountsReceivable"), // cumulative — total money owed to you right now, not just today's
    Item.find({ owner: ownerId }).select("name stock lowStock").lean(),
  ]);

  const lowStock = lowStockItems.filter((it) => (it.stock ?? 0) <= (it.lowStock ?? 5));

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const lines = [
    `📊 SBT Daily Report — ${dateLabel}`,
    "",
    `Sales: ₹${fmt(pnl.sales)}`,
    `COGS: ₹${fmt(pnl.cogs)}`,
    `Gross profit: ₹${fmt(pnl.grossProfit)}`,
    `Expenses (freight+labour+other): ₹${fmt(pnl.expenses.total)}`,
    `Net profit today: ₹${fmt(pnl.netProfit)}`,
    "",
    // Funds account: debit = cash in, credit = cash out. Net > 0 means more
    // came in than went out today.
    `Cash movement today: ₹${fmt(cashToday.net)} (in ₹${fmt(cashToday.debit)} / out ₹${fmt(cashToday.credit)})`,
    `Total outstanding (AR): ₹${fmt(arOutstanding.net)}`,
  ];

  if (lowStock.length) {
    lines.push("", `⚠️ Low stock (${lowStock.length}):`);
    for (const it of lowStock.slice(0, 10)) {
      lines.push(`  • ${it.name} — ${it.stock} left`);
    }
    if (lowStock.length > 10) lines.push(`  …and ${lowStock.length - 10} more`);
  }

  return lines.join("\n");
}

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString("en-IN");
}

module.exports = { runDailyReport };