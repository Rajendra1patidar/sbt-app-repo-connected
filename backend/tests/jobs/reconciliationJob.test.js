/**
 * Unit tests for reconciliationJob. Mocks User, reconciliationService,
 * alertWebhook, and eventBus directly (same reasoning as
 * tests/services/stockService.test.js — no real MongoDB available in this
 * sandbox), so what's under test here is the job's own orchestration logic:
 * looping every owner, deciding when to alert, and not letting one owner's
 * failure stop the rest.
 */

jest.mock("../../models/User");
jest.mock("../../services/reconciliationService");
jest.mock("../../utils/alertWebhook");
jest.mock("../../services/eventBus");

const User = require("../../models/User");
const reconciliationService = require("../../services/reconciliationService");
const { sendErrorAlert } = require("../../utils/alertWebhook");
const eventBus = require("../../services/eventBus");
const { runReconciliationCheck } = require("../../jobs/reconciliationJob");

function mockUsers(ids) {
  User.find.mockResolvedValue(ids.map((_id) => ({ _id })));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runReconciliationCheck", () => {
  test("does nothing when every owner's books balance", async () => {
    mockUsers(["owner1", "owner2"]);
    reconciliationService.integrityCheck.mockResolvedValue({ allOk: true, checks: [] });

    const summary = await runReconciliationCheck();

    expect(summary).toEqual({ checked: 2, failed: 0 });
    expect(sendErrorAlert).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  test("alerts and emits an event for an owner with drift, without affecting others", async () => {
    mockUsers(["owner1", "owner2"]);
    reconciliationService.integrityCheck.mockImplementation(async (owner) => {
      if (owner === "owner1") {
        return {
          allOk: false,
          checks: [
            { check: "Purchases vs Stock ledger", sourceTotal: 100, ledgerTotal: 90, diff: 10, ok: false },
            { check: "Estimates vs Sales ledger", sourceTotal: 50, ledgerTotal: 50, diff: 0, ok: true },
          ],
        };
      }
      return { allOk: true, checks: [] };
    });

    const summary = await runReconciliationCheck();

    expect(summary).toEqual({ checked: 2, failed: 1 });
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
    expect(sendErrorAlert.mock.calls[0][0].message).toContain("owner1");
    expect(eventBus.emit).toHaveBeenCalledWith(
      "reconciliation.failed",
      expect.objectContaining({ owner: "owner1", failedCount: 1 })
    );
  });

  test("one owner's check throwing does not stop the rest and still alerts", async () => {
    mockUsers(["owner1", "owner2"]);
    reconciliationService.integrityCheck.mockImplementation(async (owner) => {
      if (owner === "owner1") throw new Error("aggregation exploded");
      return { allOk: true, checks: [] };
    });

    const summary = await runReconciliationCheck();

    expect(summary.checked).toBe(2);
    expect(reconciliationService.integrityCheck).toHaveBeenCalledWith("owner2");
    expect(sendErrorAlert).toHaveBeenCalledTimes(1);
    expect(sendErrorAlert.mock.calls[0][0].message).toContain("aggregation exploded");
  });
});
