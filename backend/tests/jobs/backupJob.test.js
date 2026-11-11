/**
 * Unit tests for backupJob. The database dump, Telegram, email and the alert
 * channel are replaced by mocks (no real services in this sandbox), but the real
 * passphrase checks run, so what is under test here is the job's own decisions:
 * never send without a passphrase, Telegram every night, email once a week and
 * whenever Telegram could not take the file, and say so loudly when nothing got out.
 */

jest.mock("../../utils/dbBackup", () => ({
  buildEncryptedBackup: jest.fn(),
  wrapForEmail: jest.fn(),
  MAX_TELEGRAM_BYTES: 49 * 1024 * 1024,
  MAX_EMAIL_BYTES: 12 * 1024 * 1024,
}));
jest.mock("../../utils/telegramClient", () => ({ sendTelegramDocument: jest.fn() }));
jest.mock("../../utils/mailer", () => ({ sendMail: jest.fn() }));
jest.mock("../../utils/alertWebhook", () => ({
  sendAlert: jest.fn(async () => {}),
  sendErrorAlert: jest.fn(async () => {}),
}));

const { buildEncryptedBackup, wrapForEmail } = require("../../utils/dbBackup");
const { sendTelegramDocument } = require("../../utils/telegramClient");
const { sendMail } = require("../../utils/mailer");
const { sendAlert } = require("../../utils/alertWebhook");
const { runBackupJob, isEmailDay, describeDestinations } = require("../../jobs/backupJob");

function mockBackup(overrides = {}) {
  return {
    filename: "sbt-backup-2026-11-08.sbtbackup",
    buffer: Buffer.from("encrypted-bytes"),
    sizeBytes: 2048,
    summary: [
      { name: "customers", count: 5 },
      { name: "items", count: 0 },
    ],
    totalDocs: 5,
    generatedAt: "2026-11-08T09:00:00.000Z",
    ...overrides,
  };
}

// 09:00 UTC = 14:30 IST. 8 Nov 2026 is a Sunday (the default email day); 9 Nov a Monday.
const A_SUNDAY = new Date("2026-11-08T09:00:00Z");
const A_MONDAY = new Date("2026-11-09T09:00:00Z");

beforeAll(() => {
  // the code under test logs what it does; keep the test output readable
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

const ORIGINAL_ENV = process.env;

function setEnv(extra = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    BACKUP_PASSPHRASE: "test-passphrase-123",
    TELEGRAM_REPORT_BOT_TOKEN: "bot-token",
    TELEGRAM_REPORT_CHAT_ID: "chat-id",
    ...extra,
  };
  for (const key of ["BACKUP_EMAIL_TO", "BACKUP_DAYS_OF_WEEK", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    if (!(key in extra)) delete process.env[key];
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  setEnv();
  buildEncryptedBackup.mockResolvedValue(mockBackup());
  wrapForEmail.mockImplementation((b) => ({ filename: `${b.filename}.zip`, buffer: Buffer.from("zipped-encrypted") }));
  sendTelegramDocument.mockResolvedValue({ ok: true, messageId: 1 });
  sendMail.mockResolvedValue({});
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("runBackupJob: passphrase and destinations", () => {
  test("without BACKUP_PASSPHRASE nothing is built or sent, and it is reported as a failure with an alert", async () => {
    delete process.env.BACKUP_PASSPHRASE;

    const result = await runBackupJob({ now: A_SUNDAY });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("BACKUP_PASSPHRASE is not set");
    expect(buildEncryptedBackup).not.toHaveBeenCalled();
    expect(sendTelegramDocument).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("BACKUP_PASSPHRASE");
  });

  test("a too-short passphrase is refused the same way", async () => {
    process.env.BACKUP_PASSPHRASE = "short";
    const result = await runBackupJob({ now: A_SUNDAY });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("too short");
    expect(buildEncryptedBackup).not.toHaveBeenCalled();
  });

  test("with neither Telegram nor an email address it fails loudly instead of doing nothing", async () => {
    setEnv();
    delete process.env.TELEGRAM_REPORT_BOT_TOKEN;
    delete process.env.TELEGRAM_REPORT_CHAT_ID;

    const result = await runBackupJob({ now: A_SUNDAY });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no place to send backups");
    expect(buildEncryptedBackup).not.toHaveBeenCalled();
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("the alert chat is used when the daily-report chat is not set", async () => {
    setEnv({ TELEGRAM_BOT_TOKEN: "alert-bot", TELEGRAM_CHAT_ID: "alert-chat" });
    delete process.env.TELEGRAM_REPORT_BOT_TOKEN;
    delete process.env.TELEGRAM_REPORT_CHAT_ID;

    await runBackupJob({ now: A_MONDAY });

    expect(sendTelegramDocument.mock.calls[0][0]).toBe("alert-bot");
    expect(sendTelegramDocument.mock.calls[0][1]).toBe("alert-chat");
  });
});

describe("runBackupJob: Telegram every night", () => {
  test("sends the encrypted file to Telegram with a caption", async () => {
    const result = await runBackupJob({ now: A_MONDAY });

    expect(sendTelegramDocument).toHaveBeenCalledTimes(1);
    const [token, chat, buffer, filename, caption] = sendTelegramDocument.mock.calls[0];
    expect(token).toBe("bot-token");
    expect(chat).toBe("chat-id");
    expect(buffer.equals(Buffer.from("encrypted-bytes"))).toBe(true);
    expect(filename).toBe("sbt-backup-2026-11-08.sbtbackup");
    expect(caption).toContain("encrypted");
    expect(caption).toContain("BACKUP_PASSPHRASE");

    expect(result.delivered).toEqual(["telegram"]);
    expect(result.ok).toBeUndefined();
    expect(result.sizeBytes).toBe(2048);
    expect(result.totalDocs).toBe(5);
    expect(result.summary).toContain("telegram");
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  test("a Telegram failure with no email set up is a failed backup, with an alert that says why", async () => {
    sendTelegramDocument.mockResolvedValue({ ok: false, error: "Bad Request: chat not found" });

    const result = await runBackupJob({ now: A_MONDAY });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("chat not found");
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("NOT delivered");
  });

  test("a backup over Telegram's 50 MB limit is not attempted", async () => {
    buildEncryptedBackup.mockResolvedValue(mockBackup({ sizeBytes: 50 * 1024 * 1024 }));

    const result = await runBackupJob({ now: A_MONDAY });

    expect(sendTelegramDocument).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("50 MB");
  });

  test("a failure to read the database is reported, not thrown", async () => {
    buildEncryptedBackup.mockRejectedValue(new Error("connection lost"));

    const result = await runBackupJob({ now: A_MONDAY });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection lost");
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendTelegramDocument).not.toHaveBeenCalled();
  });
});

describe("runBackupJob: weekly email", () => {
  beforeEach(() => setEnv({ BACKUP_EMAIL_TO: "owner@example.com" }));

  test("on the weekly day (Sunday) the encrypted .zip is emailed as well", async () => {
    const result = await runBackupJob({ now: A_SUNDAY });

    expect(result.delivered).toEqual(["telegram", "email"]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("owner@example.com");
    expect(mail.attachments).toEqual([
      expect.objectContaining({ filename: "sbt-backup-2026-11-08.sbtbackup.zip", contentType: "application/zip" }),
    ]);
    expect(mail.text).toContain("customers: 5");
    expect(mail.text).not.toContain("items: 0");
    expect(mail.text).toContain("encrypted");
  });

  test("on other days no email goes out while Telegram works", async () => {
    await runBackupJob({ now: A_MONDAY });
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("BACKUP_DAYS_OF_WEEK moves the email day", async () => {
    setEnv({ BACKUP_EMAIL_TO: "owner@example.com", BACKUP_DAYS_OF_WEEK: "1" });

    await runBackupJob({ now: A_SUNDAY });
    expect(sendMail).not.toHaveBeenCalled();

    await runBackupJob({ now: A_MONDAY });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("when Telegram fails, the email goes out as the fallback even on a non-email day", async () => {
    sendTelegramDocument.mockResolvedValue({ ok: false, error: "Too Many Requests" });

    const result = await runBackupJob({ now: A_MONDAY });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(result.ok).toBeUndefined();
    expect(result.delivered).toEqual(["email"]);
    expect(result.warnings[0]).toContain("Too Many Requests");
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("still delivered by email");
  });

  test("force sends the email copy even on a non-email day", async () => {
    const result = await runBackupJob({ now: A_MONDAY, force: true });
    expect(result.delivered).toEqual(["telegram", "email"]);
  });

  test("an email that cannot be sent is a warning when Telegram worked, and a failure when it did not", async () => {
    sendMail.mockRejectedValue(new Error("Brevo API error (401): invalid key"));

    const withTelegram = await runBackupJob({ now: A_SUNDAY });
    expect(withTelegram.ok).toBeUndefined();
    expect(withTelegram.delivered).toEqual(["telegram"]);
    expect(withTelegram.warnings[0]).toContain("invalid key");

    sendTelegramDocument.mockResolvedValue({ ok: false, error: "down" });
    const withoutTelegram = await runBackupJob({ now: A_SUNDAY });
    expect(withoutTelegram.ok).toBe(false);
  });

  test("an attachment too big for email is not sent", async () => {
    wrapForEmail.mockReturnValue({ filename: "x.zip", buffer: Buffer.alloc(13 * 1024 * 1024) });

    const result = await runBackupJob({ now: A_SUNDAY });

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.delivered).toEqual(["telegram"]);
    expect(result.warnings[0]).toContain("too large");
  });
});

describe("runBackupJob: email only (no Telegram)", () => {
  beforeEach(() => {
    setEnv({ BACKUP_EMAIL_TO: "owner@example.com" });
    delete process.env.TELEGRAM_REPORT_BOT_TOKEN;
    delete process.env.TELEGRAM_REPORT_CHAT_ID;
  });

  test("skips quietly on a non-email day, without even reading the database", async () => {
    const result = await runBackupJob({ now: A_MONDAY });

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("weekly email is not due");
    expect(buildEncryptedBackup).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  test("emails on the weekly day", async () => {
    const result = await runBackupJob({ now: A_SUNDAY });
    expect(result.delivered).toEqual(["email"]);
    expect(sendTelegramDocument).not.toHaveBeenCalled();
  });
});

describe("isEmailDay / describeDestinations", () => {
  test("Sunday by default, India time", () => {
    expect(isEmailDay(A_SUNDAY)).toBe(true);
    expect(isEmailDay(A_MONDAY)).toBe(false);
    // 19:00 UTC on Saturday is already Sunday morning in India
    expect(isEmailDay(new Date("2026-11-07T19:00:00Z"))).toBe(true);
  });

  test("reports where backups will go", () => {
    setEnv({ BACKUP_EMAIL_TO: "owner@example.com", BACKUP_DAYS_OF_WEEK: "0,3" });
    expect(describeDestinations()).toEqual({ telegram: true, email: true, emailDays: ["Sunday", "Wednesday"] });

    setEnv();
    delete process.env.TELEGRAM_REPORT_CHAT_ID;
    expect(describeDestinations()).toEqual({ telegram: false, email: false, emailDays: ["Sunday"] });
  });

  test("ignores nonsense in BACKUP_DAYS_OF_WEEK and falls back to Sunday", () => {
    setEnv({ BACKUP_DAYS_OF_WEEK: "abc,9" });
    expect(describeDestinations().emailDays).toEqual(["Sunday"]);
  });
});
