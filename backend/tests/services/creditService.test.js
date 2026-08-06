jest.mock("../../models/Document");
jest.mock("../../models/Payment");
jest.mock("../../models/Customer");

const Document = require("../../models/Document");
const Payment = require("../../models/Payment");
const Customer = require("../../models/Customer");
const { computeCreditView } = require("../../services/creditService");

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function mockFind(model, methodChainsToArray) {
  // Document.find(...).select(...) — chainable mock returning an array.
  model.find.mockReturnValue({ select: jest.fn().mockResolvedValue(methodChainsToArray) });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("computeCreditView", () => {
  test("a customer with a badly overdue bill and no payment history is flagged risk", async () => {
    mockFind(Document, [
      { customerId: "cust1", total: 10000, amountPaid: 0, dueDate: daysAgo(75) },
    ]);
    Customer.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "cust1", name: "Rakesh", phone: "999", creditLimit: 20000 }]) });
    Payment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }),
    });

    const result = await computeCreditView("owner1");

    expect(result).toHaveLength(1);
    expect(result[0].risk).toBe("risk");
    expect(result[0].overdue).toBe(10000);
    expect(result[0].suggestedCreditLimit).toBe(10000); // half of 20000
  });

  test("a customer who always pays on time and isn't overdue is 'good', with no suggested change unless raising", async () => {
    Customer.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "cust1", name: "Priya", phone: "999", creditLimit: 10000 }]) });
    const payments = [
      { customerId: "cust1", invoiceId: "inv1", date: daysAgo(15) },
      { customerId: "cust1", invoiceId: "inv2", date: daysAgo(50) },
    ];
    Payment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(payments) }) }),
    });
    Document.find.mockImplementation((query) => {
      if (query._id) {
        // second call: fetching dueDates for invoices touched by recent payments.
        // dueDate is AFTER the payment date in both cases -> paid ahead of time.
        return { select: jest.fn().mockResolvedValue([
          { _id: "inv1", dueDate: daysAgo(10) }, // paid 5 days before due
          { _id: "inv2", dueDate: daysAgo(45) }, // paid 5 days before due
        ]) };
      }
      return { select: jest.fn().mockResolvedValue([]) }; // unpaid estimates query — nothing outstanding
    });

    const result = await computeCreditView("owner1");

    expect(result).toHaveLength(1);
    expect(result[0].risk).toBe("good");
    expect(result[0].onTimeRatio).toBe(1);
    expect(result[0].suggestedCreditLimit).toBe(12500); // 10000 * 1.25 — paid early every time, no overdue
  });

  test("never touches Customer.creditLimit — this is read-only", async () => {
    const customerDoc = { _id: "cust1", name: "Rakesh", phone: "999", creditLimit: 20000 };
    mockFind(Document, [{ customerId: "cust1", total: 10000, amountPaid: 0, dueDate: daysAgo(75) }]);
    Customer.find.mockReturnValue({ select: jest.fn().mockResolvedValue([customerDoc]) });
    Payment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }),
    });

    await computeCreditView("owner1");

    expect(customerDoc.creditLimit).toBe(20000); // unchanged
  });

  test("a customer with no outstanding balance and no payment history is omitted", async () => {
    mockFind(Document, []);
    Customer.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "cust1", name: "New Customer", phone: "", creditLimit: null }]) });
    Payment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }),
    });

    const result = await computeCreditView("owner1");
    expect(result).toHaveLength(0);
  });
});
