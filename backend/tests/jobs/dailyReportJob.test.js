/**
 * Unit tests for dailyReportJob, focused on the error-alerting fix: a failed
 * Telegram send previously vanished silently (sendTelegramMessage never
 * throws — it just returns false), so a broken report bot looked identical
 * to a normal night from the outside. Mocks Item, ledgerService,
 * ownerAccounts, telegramClient, and alertWebhook directly (same reasoning
 * as tests/jobs/reconciliationJob.test.js — no real MongoDB in this sandbox).
 */

jest.mock("../../models/Item");
jest.mock("../../services/ledgerService");
jest.mock("../../utils/ownerAccounts");
jest.mock("../../utils/telegramClient");
jest.mock("../../utils/alertWebhook");

const Item = require("../../models/Item");
const ledgerService = require("../../services/ledgerService");
const { findOwnerUsers } = require("../../utils/ownerAccounts");
const { sendTelegramMessage } = require("../../utils/telegramClient");
const { sendErrorAlert } = require("../../utils/alertWebhook");
const { runDailyReport } = require("../../jobs/dailyReportJob");

function mockLedgerDefaults() {
  ledgerService.profitAndLoss.mockResolvedValue({
    sales: 0,
    cogs: 0,
    grossProfit: 0,
    expenses: { total: 0 },
    netProfit: 0,
  });
  ledgerService.accountBalance.mockResolvedValue({ net: 0, debit: 0, credit: 0 });
  Item.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEGRAM_REPORT_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_REPORT_CHAT_ID = "test-chat";
  mockLedgerDefaults();
});

afterEach(() => {
  delete process.env.TELEGRAM_REPORT_BOT_TOKEN;
  delete process.env.TELEGRAM_REPORT_CHAT_ID;
});

describe("runDailyReport", () => {
  test("no-ops without alerting when the report bot isn't configured", async () => {
    delete process.env.TELEGRAM_REPORT_BOT_TOKEN;
    findOwnerUsers.mockResolvedValue([{ _id: "owner1" }]);

    const summary = await runDailyReport();

    expect(summary).toEqual({ checked: 0, sent: 0 });
    expect(sendErrorAlert).not.toHaveBeenCalled();
  });

  test("counts a successful send and never alerts", async () => {
    findOwnerUsers.mockResolvedValue([{ _id: "owner1" }]);
    sendTelegramMessage.mockResolvedValue(true);

    const summary = await runDailyReport();

    expect(summary).toEqual({ checked: 1, sent: 1 });
    expect(sendErrorAlert).not.toHaveBeenCalled();
  });

  test("alerts when Telegram send returns false (Bug 3 fix — previously silent)", async () => {
    findOwnerUsers.mockResolvedValue([{ _id: "owner1" }]);
    sendTelegramMessage.mockResolvedValue(false);

    const summary = await runDailyReport();

    expect(summary).toEqual({ checked: 1, sent: 0 });
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
    expect(sendErrorAlert.mock.calls[0][0].message).toContain("owner1");
    expect(sendErrorAlert.mock.calls[0][0].path).toBe("jobs/dailyReportJob");
  });

  test("alerts when building the report throws, and keeps going for the next owner", async () => {
    findOwnerUsers.mockResolvedValue([{ _id: "owner1" }, { _id: "owner2" }]);
    sendTelegramMessage.mockResolvedValue(true);
    ledgerService.profitAndLoss.mockImplementationOnce(() => {
      throw new Error("ledger exploded");
    });

    const summary = await runDailyReport();

    expect(summary).toEqual({ checked: 2, sent: 1 }); // owner1 failed, owner2 succeeded
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
    expect(sendErrorAlert.mock.calls[0][0].message).toContain("owner1");
    expect(sendErrorAlert.mock.calls[0][0].message).toContain("ledger exploded");
  });
});
