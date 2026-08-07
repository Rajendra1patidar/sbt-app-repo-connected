jest.mock("../../models/Document");
jest.mock("../../models/Expense");
jest.mock("../../services/ledgerService");

const Document = require("../../models/Document");
const Expense = require("../../models/Expense");
const ledgerService = require("../../services/ledgerService");
const { computeCashFlowForecast } = require("../../services/cashFlowService");

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  return daysFromToday(-n);
}

function mockSelect(model, value) {
  model.find.mockReturnValue({ select: jest.fn().mockResolvedValue(value) });
}

beforeEach(() => {
  jest.clearAllMocks();
  ledgerService.accountBalance.mockImplementation(async (owner, account) => {
    if (account === "Funds") return { debit: 50000, credit: 20000, net: 30000 };
    if (account === "AccountsReceivable") return { debit: 15000, credit: 5000, net: 10000 };
    if (account === "VendorPayable") return { debit: 2000, credit: 8000, net: -6000 };
    return { debit: 0, credit: 0, net: 0 };
  });
  mockSelect(Expense, []);
});

describe("computeCashFlowForecast", () => {
  test("uses Funds ledger balance directly as current cash", async () => {
    mockSelect(Document, []);
    const result = await computeCashFlowForecast("owner1");
    expect(result.currentCash).toBe(30000);
    expect(result.outstandingReceivable).toBe(10000);
  });

  test("VendorPayable uses credit-minus-debit, matching balanceSheet's liability convention", async () => {
    mockSelect(Document, []);
    const result = await computeCashFlowForecast("owner1");
    expect(result.outstandingPayable).toBe(6000); // 8000 credit - 2000 debit
  });

  test("buckets unpaid estimates by real dueDate — overdue counts as due now, not spread into the future", async () => {
    mockSelect(Document, [
      { total: 5000, amountPaid: 0, dueDate: daysAgo(10) }, // overdue
      { total: 3000, amountPaid: 0, dueDate: daysFromToday(15) }, // next30
      { total: 2000, amountPaid: 0, dueDate: daysFromToday(45) }, // next60
      { total: 1000, amountPaid: 0, dueDate: daysFromToday(80) }, // next90
      { total: 500, amountPaid: 0, dueDate: daysFromToday(200) }, // beyond90
    ]);

    const result = await computeCashFlowForecast("owner1");

    expect(result.expectedInflows.overdue).toBe(5000);
    expect(result.expectedInflows.next30).toBe(3000);
    expect(result.expectedInflows.next60).toBe(2000);
    expect(result.expectedInflows.next90).toBe(1000);
    expect(result.expectedInflows.beyond90).toBe(500);
  });

  test("estimates with no dueDate are reported separately, not guessed into a bucket", async () => {
    mockSelect(Document, [{ total: 4000, amountPaid: 0, dueDate: null }]);

    const result = await computeCashFlowForecast("owner1");

    expect(result.expectedInflows.noDueDate).toBe(4000);
    expect(result.expectedInflows.next30).toBe(0);
    expect(result.notes.some((n) => n.includes("4000"))).toBe(true);
  });

  test("partially-paid estimates only count the remaining outstanding amount", async () => {
    mockSelect(Document, [{ total: 10000, amountPaid: 7000, dueDate: daysFromToday(10) }]);

    const result = await computeCashFlowForecast("owner1");
    expect(result.expectedInflows.next30).toBe(3000);
  });

  test("avgMonthlyExpense is a real trailing-90-day average, not fabricated", async () => {
    mockSelect(Document, []);
    mockSelect(Expense, [{ amount: 9000, date: daysAgo(10) }, { amount: 6000, date: daysAgo(50) }, { amount: 3000, date: daysAgo(85) }]);

    const result = await computeCashFlowForecast("owner1");
    expect(result.avgMonthlyExpense).toBe(6000); // (9000+6000+3000)/3 months
  });

  test("projected cash figures fold in inflows due within the window minus the recurring expense rate", async () => {
    mockSelect(Document, [{ total: 3000, amountPaid: 0, dueDate: daysFromToday(15) }]);
    mockSelect(Expense, [{ amount: 6000, date: daysAgo(10) }]);

    const result = await computeCashFlowForecast("owner1");
    // currentCash 30000 + next30 3000 - avgMonthlyExpense (6000/3=2000) = 31000
    expect(result.projected.in30Days).toBe(31000);
  });
});
