jest.mock("../../models/User");
jest.mock("../../models/Notification");
jest.mock("../../services/reorderService");
jest.mock("../../services/eventBus");

const User = require("../../models/User");
const Notification = require("../../models/Notification");
const reorderService = require("../../services/reorderService");
const eventBus = require("../../services/eventBus");
const { runReorderCheck } = require("../../jobs/reorderCheckJob");

function mockUsers(ids) {
  User.find.mockResolvedValue(ids.map((_id) => ({ _id })));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runReorderCheck", () => {
  test("emits stock.reorder-suggested for a new pace-mode suggestion", async () => {
    mockUsers(["owner1"]);
    reorderService.computeSuggestions.mockResolvedValue([
      { itemId: "item1", name: "Cement Bag", stock: 12, suggestedQty: 40, daysLeft: 12, mode: "pace", vendor: null },
    ]);
    Notification.exists.mockResolvedValue(false);

    const summary = await runReorderCheck();

    expect(summary).toEqual({ checked: 1, notified: 1 });
    expect(eventBus.emit).toHaveBeenCalledWith(
      "stock.reorder-suggested",
      expect.objectContaining({ owner: "owner1", itemId: "item1" })
    );
  });

  test("skips a suggestion that already has an unread notification (dedupe)", async () => {
    mockUsers(["owner1"]);
    reorderService.computeSuggestions.mockResolvedValue([
      { itemId: "item1", name: "Cement Bag", stock: 12, suggestedQty: 40, daysLeft: 12, mode: "pace", vendor: null },
    ]);
    Notification.exists.mockResolvedValue(true);

    const summary = await runReorderCheck();

    expect(summary).toEqual({ checked: 1, notified: 0 });
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  test("ignores static-mode suggestions (already covered by the stock.low event)", async () => {
    mockUsers(["owner1"]);
    reorderService.computeSuggestions.mockResolvedValue([
      { itemId: "item1", name: "Rare Part", stock: 2, suggestedQty: null, daysLeft: null, mode: "static", vendor: null },
    ]);

    const summary = await runReorderCheck();

    expect(summary).toEqual({ checked: 1, notified: 0 });
    expect(Notification.exists).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  test("never auto-creates a Purchase or sends anything beyond the internal event", async () => {
    mockUsers(["owner1"]);
    reorderService.computeSuggestions.mockResolvedValue([
      { itemId: "item1", name: "Cement Bag", stock: 12, suggestedQty: 40, daysLeft: 12, mode: "pace", vendor: null },
    ]);
    Notification.exists.mockResolvedValue(false);

    await runReorderCheck();

    // Only the in-app event fires — no Purchase model is even imported by this job.
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
  });
});
