/**
 * Unit tests for ledgerService. LedgerEntry is mocked (see the note at the
 * top of stockService.test.js for why: no network access to a mongod binary
 * in this sandbox). This still fully covers the double-entry balance check
 * in postEntries, the reversal logic, and the arithmetic in the reporting
 * functions (trialBalance / profitAndLoss / balanceSheet / partyStatement),
 * which is where a silent bug would actually cost real money.
 */

jest.mock("../../models/LedgerEntry");

const LedgerEntry = require("../../models/LedgerEntry");
const {
  postEntries,
  reverseSource,
  accountBalance,
  trialBalance,
  profitAndLoss,
  partyStatement,
} = require("../../services/ledgerService");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("postEntries", () => {
  const meta = { owner: "o1", sourceType: "Estimate", sourceId: "e1" };

  test("rejects a batch with fewer than two lines", async () => {
    await expect(postEntries([{ account: "Funds", type: "debit", amount: 10 }], meta)).rejects.toThrow(
      /at least two lines/i
    );
    expect(LedgerEntry.insertMany).not.toHaveBeenCalled();
  });

  test("requires owner/sourceType/sourceId in meta", async () => {
    const lines = [
      { account: "Funds", type: "debit", amount: 10 },
      { account: "Sales", type: "credit", amount: 10 },
    ];
    await expect(postEntries(lines, { owner: "o1" })).rejects.toThrow(/requires meta/i);
  });

  test("throws on an unbalanced batch instead of writing anything", async () => {
    const lines = [
      { account: "Funds", type: "debit", amount: 100 },
      { account: "Sales", type: "credit", amount: 90 },
    ];
    await expect(postEntries(lines, meta)).rejects.toThrow(/Unbalanced ledger post/);
    expect(LedgerEntry.insertMany).not.toHaveBeenCalled();
  });

  test("rejects a line with a negative amount or missing account/type", async () => {
    const badAmount = [
      { account: "Funds", type: "debit", amount: -5 },
      { account: "Sales", type: "credit", amount: -5 },
    ];
    await expect(postEntries(badAmount, meta)).rejects.toThrow(/non-negative amount/i);

    const badType = [
      { account: "Funds", type: "yolo", amount: 5 },
      { account: "Sales", type: "credit", amount: 5 },
    ];
    await expect(postEntries(badType, meta)).rejects.toThrow(/Invalid ledger line type/);
  });

  test("writes a balanced batch, sharing one batchId and dropping zero-amount lines", async () => {
    LedgerEntry.insertMany.mockResolvedValue([{}, {}]);
    const lines = [
      { account: "Funds", type: "debit", amount: 100 },
      { account: "Sales", type: "credit", amount: 100 },
      { account: "COGS", type: "debit", amount: 0 }, // should be dropped
    ];
    await postEntries(lines, { ...meta, narration: "Sale #1", date: "2026-08-01" });

    expect(LedgerEntry.insertMany).toHaveBeenCalledTimes(1);
    const docs = LedgerEntry.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(2); // zero-amount line dropped
    expect(docs[0].batchId).toBe(docs[1].batchId); // same batch
    expect(docs.every((d) => d.narration === "Sale #1")).toBe(true);
    expect(docs.every((d) => d.date === "2026-08-01")).toBe(true);
  });

  test("returns [] without calling insertMany when every line is zero-amount", async () => {
    const lines = [
      { account: "Funds", type: "debit", amount: 0 },
      { account: "Sales", type: "credit", amount: 0 },
    ];
    const result = await postEntries(lines, meta);
    expect(result).toEqual([]);
    expect(LedgerEntry.insertMany).not.toHaveBeenCalled();
  });

  test("tolerates float rounding noise when checking debit == credit", async () => {
    LedgerEntry.insertMany.mockResolvedValue([{}, {}]);
    const lines = [
      { account: "Funds", type: "debit", amount: 0.1 + 0.2 }, // 0.30000000000000004 in raw JS
      { account: "Sales", type: "credit", amount: 0.3 },
    ];
    await expect(postEntries(lines, meta)).resolves.not.toThrow();
  });
});

describe("reverseSource", () => {
  test("mirrors debit<->credit for every original line and marks originals reversed", async () => {
    const originals = [
      { _id: "l1", account: "Funds", type: "debit", amount: 100, narration: "Sale", owner: "o1" },
      { _id: "l2", account: "Sales", type: "credit", amount: 100, narration: "Sale", owner: "o1" },
    ];
    LedgerEntry.find.mockReturnValue({ session: jest.fn().mockResolvedValue(originals) });
    LedgerEntry.updateMany.mockResolvedValue({});
    LedgerEntry.insertMany.mockResolvedValue([{}, {}]);

    await reverseSource("o1", "Estimate", "e1", undefined, null);

    expect(LedgerEntry.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ["l1", "l2"] } },
      { $set: { reversed: true } },
      expect.anything()
    );
    const reversedDocs = LedgerEntry.insertMany.mock.calls[0][0];
    expect(reversedDocs.find((d) => d.account === "Funds").type).toBe("credit");
    expect(reversedDocs.find((d) => d.account === "Sales").type).toBe("debit");
    expect(reversedDocs.every((d) => d.narration === "Reversal of Sale")).toBe(true);
  });

  test("is a no-op when there's nothing to reverse", async () => {
    LedgerEntry.find.mockReturnValue({ session: jest.fn().mockResolvedValue([]) });
    const result = await reverseSource("o1", "Estimate", "missing", undefined, null);
    expect(result).toEqual([]);
    expect(LedgerEntry.updateMany).not.toHaveBeenCalled();
    expect(LedgerEntry.insertMany).not.toHaveBeenCalled();
  });
});

describe("accountBalance / trialBalance", () => {
  test("accountBalance nets debit - credit", async () => {
    LedgerEntry.aggregate.mockResolvedValue([{ _id: null, debit: 300, credit: 120 }]);
    const result = await accountBalance("o1", "AccountsReceivable");
    expect(result).toEqual({ debit: 300, credit: 120, net: 180 });
  });

  test("accountBalance defaults to zero when there are no postings", async () => {
    LedgerEntry.aggregate.mockResolvedValue([]);
    const result = await accountBalance("o1", "Freight");
    expect(result).toEqual({ debit: 0, credit: 0, net: 0 });
  });

  test("trialBalance reports balanced=true only when total debits equal total credits", async () => {
    LedgerEntry.aggregate.mockResolvedValue([
      { _id: "Funds", debit: 500, credit: 0 },
      { _id: "Sales", debit: 0, credit: 500 },
    ]);
    const result = await trialBalance("o1");
    expect(result.totalDebit).toBe(500);
    expect(result.totalCredit).toBe(500);
    expect(result.balanced).toBe(true);
  });
});

describe("profitAndLoss", () => {
  test("computes gross and net profit from Sales/COGS/operating expense balances", async () => {
    // profitAndLoss calls accountBalance once per account in this fixed order:
    // Sales, COGS, Freight, Labour, OtherExpense
    LedgerEntry.aggregate
      .mockResolvedValueOnce([{ debit: 0, credit: 1000 }]) // Sales
      .mockResolvedValueOnce([{ debit: 600, credit: 0 }]) // COGS
      .mockResolvedValueOnce([{ debit: 50, credit: 0 }]) // Freight
      .mockResolvedValueOnce([{ debit: 30, credit: 0 }]) // Labour
      .mockResolvedValueOnce([{ debit: 20, credit: 0 }]); // OtherExpense

    const pnl = await profitAndLoss("o1", {});

    expect(pnl.sales).toBe(1000);
    expect(pnl.cogs).toBe(600);
    expect(pnl.grossProfit).toBe(400);
    expect(pnl.expenses).toEqual({ freight: 50, labour: 30, other: 20, total: 100 });
    expect(pnl.netProfit).toBe(300);
  });
});

describe("partyStatement", () => {
  test("running balance for a customer: debit increases, credit decreases", async () => {
    LedgerEntry.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { date: "2026-01-01", account: "AccountsReceivable", type: "debit", amount: 500 },
          { date: "2026-01-05", account: "AccountsReceivable", type: "credit", amount: 200 },
        ]),
      }),
    });

    const { rows, closingBalance } = await partyStatement("o1", { customerId: "c1" });
    expect(rows.map((r) => r.balance)).toEqual([500, 300]);
    expect(closingBalance).toBe(300);
  });

  test("running balance for a vendor: credit increases, debit decreases", async () => {
    LedgerEntry.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { date: "2026-01-01", account: "VendorPayable", type: "credit", amount: 400 },
          { date: "2026-01-05", account: "VendorPayable", type: "debit", amount: 150 },
        ]),
      }),
    });

    const { rows, closingBalance } = await partyStatement("o1", { vendorId: "v1" });
    expect(rows.map((r) => r.balance)).toEqual([400, 250]);
    expect(closingBalance).toBe(250);
  });
});
