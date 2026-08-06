jest.mock("../../models/User");
jest.mock("../../models/Notification");
jest.mock("../../services/creditService");
jest.mock("../../services/eventBus");

const User = require("../../models/User");
const Notification = require("../../models/Notification");
const creditService = require("../../services/creditService");
const eventBus = require("../../services/eventBus");
const { runCreditCheck } = require("../../jobs/creditCheckJob");

function mockUsers(ids) {
  User.find.mockResolvedValue(ids.map((_id) => ({ _id })));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runCreditCheck", () => {
  test("emits customer.credit-risk for a customer in the worst tier", async () => {
    mockUsers(["owner1"]);
    creditService.computeCreditView.mockResolvedValue([
      { customerId: "cust1", name: "Rakesh", risk: "risk", overdue: 10000, oldestDaysPastDue: 75 },
    ]);
    Notification.exists.mockResolvedValue(false);

    const summary = await runCreditCheck();

    expect(summary).toEqual({ checked: 1, notified: 1 });
    expect(eventBus.emit).toHaveBeenCalledWith(
      "customer.credit-risk",
      expect.objectContaining({ owner: "owner1", customerId: "cust1" })
    );
  });

  test("ignores customers in 'good' or 'watch' tiers", async () => {
    mockUsers(["owner1"]);
    creditService.computeCreditView.mockResolvedValue([
      { customerId: "cust1", name: "Good Customer", risk: "good", overdue: 0, oldestDaysPastDue: 0 },
      { customerId: "cust2", name: "Watch Customer", risk: "watch", overdue: 500, oldestDaysPastDue: 35 },
    ]);

    const summary = await runCreditCheck();

    expect(summary).toEqual({ checked: 1, notified: 0 });
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  test("dedupes against an existing unread notification for the same customer", async () => {
    mockUsers(["owner1"]);
    creditService.computeCreditView.mockResolvedValue([
      { customerId: "cust1", name: "Rakesh", risk: "risk", overdue: 10000, oldestDaysPastDue: 75 },
    ]);
    Notification.exists.mockResolvedValue(true);

    const summary = await runCreditCheck();

    expect(summary).toEqual({ checked: 1, notified: 0 });
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  test("one owner's check throwing does not stop the rest", async () => {
    mockUsers(["owner1", "owner2"]);
    creditService.computeCreditView.mockImplementation(async (owner) => {
      if (owner === "owner1") throw new Error("boom");
      return [];
    });

    const summary = await runCreditCheck();

    expect(summary.checked).toBe(2);
    expect(creditService.computeCreditView).toHaveBeenCalledWith("owner2");
  });
});
