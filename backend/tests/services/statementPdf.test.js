const { buildStatementPdf } = require("../../services/statementPdf");

function sample(n) {
  let balance = 0, billed = 0, paid = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const debit = i % 3 !== 2;
    const amount = debit ? 12000 + i * 1375.5 : 20000 + i * 500;
    balance += debit ? amount : -amount;
    if (debit) billed += amount; else paid += amount;
    rows.push({
      date: new Date(Date.UTC(2026, 6, 1 + i)),
      narration: debit ? `Estimate #${100 + i}` : "Payment received (UPI)",
      type: debit ? "debit" : "credit",
      amount,
      balance: Math.round(balance * 100) / 100,
    });
  }
  return { rows, closingBalance: Math.round(balance * 100) / 100, totalDebit: billed, totalCredit: paid };
}

const base = { orgName: "SHREE BALAJI TRADERS", address: "Padlya Mataji", customerName: "Ramesh Kumar", customerPhone: "9876543210" };
const pageCount = (buf) => (buf.toString("latin1").match(/\/Type \/Page(?!s)/g) || []).length;

describe("statement PDF", () => {
  test("makes a real PDF in English", async () => {
    const buf = await buildStatementPdf({ ...base, statement: sample(10), lang: "en" });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
    expect(pageCount(buf)).toBe(1);
  });

  test("makes a Hindi PDF, including a Hindi customer name", async () => {
    const buf = await buildStatementPdf({ ...base, customerName: "रमेश कुमार", statement: sample(10), lang: "hi" });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  test("a long statement runs onto more pages, every page keeps its table", async () => {
    const buf = await buildStatementPdf({ ...base, statement: sample(80), lang: "en" });
    expect(pageCount(buf)).toBeGreaterThanOrEqual(3);
  });

  test("a customer with no transactions still gets a PDF", async () => {
    const buf = await buildStatementPdf({ ...base, statement: { rows: [], closingBalance: 0, totalDebit: 0, totalCredit: 0 }, lang: "en" });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("odd input does not crash it (missing shop name, missing phone, text-only date)", async () => {
    const statement = { rows: [{ date: "not a date", narration: "", type: "credit", amount: 10, balance: -10 }], closingBalance: -10, totalDebit: 0, totalCredit: 10 };
    const buf = await buildStatementPdf({ customerName: "A", statement, lang: "hi" });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
