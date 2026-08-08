jest.mock("../../models/BankStatementLine");
jest.mock("../../models/LedgerEntry");

const BankStatementLine = require("../../models/BankStatementLine");
const LedgerEntry = require("../../models/LedgerEntry");
const { importAndMatch, manualMatch, unmatch } = require("../../services/bankReconciliationService");

function mockLedgerFind(entries) {
  LedgerEntry.find.mockReturnValue({ select: jest.fn().mockResolvedValue(entries) });
}
function mockNoOtherClaims() {
  BankStatementLine.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue([]) });
}
function fakeCreatedDoc(fields) {
  return { ...fields, _id: `line-${Math.random()}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNoOtherClaims();
  BankStatementLine.create.mockImplementation(async (doc) => fakeCreatedDoc(doc));
});

describe("importAndMatch", () => {
  test("rejects an import with no valid rows", async () => {
    await expect(importAndMatch("owner1", [{ date: "not-a-date", amount: 100 }])).rejects.toMatchObject({ status: 400 });
    await expect(importAndMatch("owner1", [])).rejects.toMatchObject({ status: 400 });
  });

  test("auto-matches a deposit to the one Funds debit entry with the same amount and a nearby date", async () => {
    mockLedgerFind([{ _id: "entry1", date: "2026-08-05", type: "debit", amount: 5000 }]);

    const result = await importAndMatch("owner1", [{ date: "2026-08-06", description: "UPI credit", amount: 5000 }]);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(BankStatementLine.create).toHaveBeenCalledWith(
      expect.objectContaining({ matched: true, matchedLedgerEntryId: "entry1" })
    );
  });

  test("a withdrawal matches against a Funds credit entry, not a debit", async () => {
    mockLedgerFind([
      { _id: "debitEntry", date: "2026-08-05", type: "debit", amount: 2000 },
      { _id: "creditEntry", date: "2026-08-05", type: "credit", amount: 2000 },
    ]);

    const result = await importAndMatch("owner1", [{ date: "2026-08-06", description: "Vendor payment", amount: -2000 }]);

    expect(result.matched).toBe(1);
    expect(BankStatementLine.create).toHaveBeenCalledWith(
      expect.objectContaining({ matchedLedgerEntryId: "creditEntry" })
    );
  });

  test("leaves a line unmatched when no candidate exists", async () => {
    mockLedgerFind([]);
    const result = await importAndMatch("owner1", [{ date: "2026-08-06", description: "Unknown", amount: 750 }]);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(1);
  });

  test("leaves a line unmatched when the date is outside the window even if the amount matches", async () => {
    mockLedgerFind([{ _id: "entry1", date: "2026-07-01", type: "debit", amount: 1000 }]); // >3 days from bank date
    const result = await importAndMatch("owner1", [{ date: "2026-08-06", description: "x", amount: 1000 }]);
    expect(result.matched).toBe(0);
  });

  test("leaves a line unmatched when two candidates tie — never guesses", async () => {
    mockLedgerFind([
      { _id: "entryA", date: "2026-08-05", type: "debit", amount: 1000 },
      { _id: "entryB", date: "2026-08-06", type: "debit", amount: 1000 },
    ]);
    const result = await importAndMatch("owner1", [{ date: "2026-08-06", description: "x", amount: 1000 }]);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(1);
  });

  test("two bank lines with the same amount each claim a different ledger entry, not the same one twice", async () => {
    // Dates are spread far enough apart that each bank row is unambiguous on
    // its own (only one entry falls in its date window) — this checks that
    // rows don't cross-claim, not the ambiguous-tie case (covered above).
    mockLedgerFind([
      { _id: "entry1", date: "2026-08-03", type: "debit", amount: 1000 },
      { _id: "entry2", date: "2026-08-09", type: "debit", amount: 1000 },
    ]);

    const result = await importAndMatch("owner1", [
      { date: "2026-08-03", description: "first", amount: 1000 },
      { date: "2026-08-09", description: "second", amount: 1000 },
    ]);

    expect(result.matched).toBe(2);
    const calledWith = BankStatementLine.create.mock.calls.map((c) => c[0].matchedLedgerEntryId);
    expect(new Set(calledWith)).toEqual(new Set(["entry1", "entry2"]));
  });

  test("a ledger entry already claimed by the first row in a batch isn't also claimed by a later one", async () => {
    // Only one real candidate exists — two bank rows pointing at it should
    // result in exactly one match, not both claiming the same entry.
    mockLedgerFind([{ _id: "onlyEntry", date: "2026-08-06", type: "debit", amount: 1000 }]);

    const result = await importAndMatch("owner1", [
      { date: "2026-08-06", description: "first", amount: 1000 },
      { date: "2026-08-06", description: "second", amount: 1000 },
    ]);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(1);
  });

  test("skips rows with no amount or a zero amount", async () => {
    mockLedgerFind([]);
    const result = await importAndMatch("owner1", [
      { date: "2026-08-06", amount: 0 },
      { date: "2026-08-06", amount: "not-a-number" },
      { date: "2026-08-06", amount: 500 },
    ]);
    expect(result.imported).toBe(1);
  });
});

describe("manualMatch", () => {
  test("links a bank line to a specific Funds ledger entry", async () => {
    const line = { save: jest.fn().mockResolvedValue(undefined) };
    BankStatementLine.findOne.mockResolvedValue(line);
    LedgerEntry.findOne.mockResolvedValue({ _id: "entry1" });

    const result = await manualMatch("owner1", "line1", "entry1");

    expect(result.matched).toBe(true);
    expect(result.matchedManually).toBe(true);
    expect(line.save).toHaveBeenCalled();
  });

  test("404s when the bank line doesn't exist", async () => {
    BankStatementLine.findOne.mockResolvedValue(null);
    await expect(manualMatch("owner1", "nope", "entry1")).rejects.toMatchObject({ status: 404 });
  });

  test("404s when the ledger entry doesn't exist or isn't a Funds entry", async () => {
    BankStatementLine.findOne.mockResolvedValue({ save: jest.fn() });
    LedgerEntry.findOne.mockResolvedValue(null);
    await expect(manualMatch("owner1", "line1", "nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("unmatch", () => {
  test("clears the match fields", async () => {
    BankStatementLine.findOneAndUpdate.mockResolvedValue({ matched: false, matchedLedgerEntryId: null });
    const result = await unmatch("owner1", "line1");
    expect(result.matched).toBe(false);
    expect(BankStatementLine.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "line1", owner: "owner1" },
      { $set: { matched: false, matchedLedgerEntryId: null, matchedManually: false } },
      { new: true }
    );
  });

  test("404s when nothing matches", async () => {
    BankStatementLine.findOneAndUpdate.mockResolvedValue(null);
    await expect(unmatch("owner1", "nope")).rejects.toMatchObject({ status: 404 });
  });
});
