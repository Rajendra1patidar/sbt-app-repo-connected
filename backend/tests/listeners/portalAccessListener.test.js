const handlers = {};
jest.mock("../../services/eventBus", () => ({ on: (name, fn) => { handlers[name] = fn; }, emit: jest.fn() }));
jest.mock("../../services/notificationService", () => ({ notify: jest.fn(async () => {}) }));
jest.mock("../../utils/telegramClient", () => ({ sendTelegramMessage: jest.fn(async () => {}) }));

const notificationService = require("../../services/notificationService");
const { sendTelegramMessage } = require("../../utils/telegramClient");
const { registerListeners } = require("../../listeners");

describe("portal access request listener", () => {
  const saved = { ...process.env };
  beforeAll(() => registerListeners());
  afterEach(() => { process.env = { ...saved }; jest.clearAllMocks(); });

  test("puts the request in the app's bell and tells the owner on Telegram", async () => {
    process.env.TELEGRAM_REPORT_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_REPORT_CHAT_ID = "12345";
    await handlers["portal.access-requested"]({ owner: "o1", requestId: "r1", name: "Ramesh Kumar", phone: "9876543210", note: "cement" });

    expect(notificationService.notify).toHaveBeenCalledWith("o1", expect.objectContaining({ type: "portal.access-requested", title: "Portal access request: Ramesh Kumar", refId: "r1" }));
    expect(notificationService.notify.mock.calls[0][1].body).toMatch(/9876543210/);
    const [token, chat, text] = sendTelegramMessage.mock.calls[0];
    expect([token, chat]).toEqual(["bot-token", "12345"]);
    expect(text).toMatch(/Ramesh Kumar/);
    expect(text).toMatch(/9876543210/);
    expect(text).toMatch(/Customer Portal > Requests/);
  });
});
