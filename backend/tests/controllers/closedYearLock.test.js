/**
 * Once a financial year is closed, nothing may be added to or removed from it -
 * not just estimates (which already worked that way) but payments, expenses and
 * stock adjustments too. The check itself is tested in tests/utils/yearLock.test.js;
 * here it is forced to refuse, and each controller must stop BEFORE writing.
 */
jest.mock("../../utils/yearLock", () => ({ assertYearNotLocked: jest.fn() }));
jest.mock("../../models/Payment");
jest.mock("../../models/Document");
jest.mock("../../models/Expense");
jest.mock("../../models/StockAdjustment");
jest.mock("../../services/ledgerService");
jest.mock("../../services/stockService");
jest.mock("../../services/eventBus");
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn() }));
jest.mock("../../utils/withTransaction", () => ({ withTransaction: (fn) => fn(null) }));

const { assertYearNotLocked } = require("../../utils/yearLock");
const Payment = require("../../models/Payment");
const Expense = require("../../models/Expense");
const paymentController = require("../../controllers/paymentController");
const expenseController = require("../../controllers/expenseController");
const stockAdjustmentController = require("../../controllers/stockAdjustmentController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const closedYear = () => Object.assign(new Error("This falls in a closed financial year"), { status: 400 });

beforeEach(() => {
  jest.clearAllMocks();
  assertYearNotLocked.mockResolvedValue(undefined);
});

describe("payments", () => {
  test("recording a payment dated in a closed year is refused and nothing is saved", async () => {
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    const res = fakeRes();
    await paymentController.create({ userId: "owner1", body: { amount: 500, date: "2025-12-01", customerId: "c1" } }, res, jest.fn());
    expect(assertYearNotLocked).toHaveBeenCalledWith("owner1", "2025-12-01");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Payment.create).not.toHaveBeenCalled();
  });

  test("a payment with no date is checked against today", async () => {
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    await paymentController.create({ userId: "owner1", body: { amount: 500, customerId: "c1" } }, fakeRes(), jest.fn());
    expect(assertYearNotLocked).toHaveBeenCalledWith("owner1", new Date().toISOString().slice(0, 10));
  });

  test("deleting a payment dated in a closed year is refused", async () => {
    Payment.findOne.mockResolvedValue({ _id: "p1", date: "2025-12-01" });
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    const res = fakeRes();
    await paymentController.remove({ userId: "owner1", params: { id: "p1" } }, res, jest.fn());
    expect(assertYearNotLocked).toHaveBeenCalledWith("owner1", "2025-12-01");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Payment.findOneAndDelete).not.toHaveBeenCalled();
  });
});

describe("expenses", () => {
  test("an expense dated in a closed year is refused and nothing is saved", async () => {
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    const next = jest.fn();
    await expenseController.create({ userId: "owner1", body: { category: "Fuel", amount: 800, date: "2025-11-15" } }, fakeRes(), next);
    expect(assertYearNotLocked).toHaveBeenCalledWith("owner1", "2025-11-15");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(Expense.create).not.toHaveBeenCalled();
  });

  test("deleting an expense dated in a closed year is refused", async () => {
    Expense.findOne.mockResolvedValue({ _id: "e1", date: "2025-11-15" });
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    const next = jest.fn();
    await expenseController.remove({ userId: "owner1", params: { id: "e1" } }, fakeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(Expense.findOneAndDelete).not.toHaveBeenCalled();
  });
});

describe("stock adjustments", () => {
  test("a stock take dated in a closed year is refused", async () => {
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    const next = jest.fn();
    await stockAdjustmentController.create({ userId: "owner1", body: { itemId: "i1", newStock: 10, date: "2025-10-01" } }, fakeRes(), next);
    expect(assertYearNotLocked).toHaveBeenCalledWith("owner1", "2025-10-01");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  test("a bulk stock take dated in a closed year is refused before any line is processed", async () => {
    assertYearNotLocked.mockRejectedValueOnce(closedYear());
    const next = jest.fn();
    await stockAdjustmentController.bulk({ userId: "owner1", body: { lines: [{ itemId: "i1", newStock: 3 }], date: "2025-10-01" } }, fakeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
});
