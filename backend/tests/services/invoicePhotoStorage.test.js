/**
 * Where each invoice photo lives, and that old Telegram photos keep working untouched.
 */
jest.mock("../../services/telegramStorage");
jest.mock("../../services/cloudinaryInvoiceStorage", () => {
  const real = jest.requireActual("../../services/cloudinaryInvoiceStorage"); // keep the real error class
  return { ...real, isConfigured: jest.fn(), upload: jest.fn(), download: jest.fn(), destroy: jest.fn() };
});

const telegram = require("../../services/telegramStorage");
const cloudinary = require("../../services/cloudinaryInvoiceStorage");
const storage = require("../../services/invoicePhotoStorage");

const BUF = Buffer.from("pic");
let savedEnv;
beforeEach(() => {
  jest.clearAllMocks();
  savedEnv = process.env.INVOICE_PHOTO_STORAGE;
  delete process.env.INVOICE_PHOTO_STORAGE;
  jest.spyOn(console, "error").mockImplementation(() => {});
  cloudinary.isConfigured.mockReturnValue(true);
  cloudinary.upload.mockResolvedValue({ fileId: "sbt-invoices/o1/abc", mimeType: "image/jpeg" });
  cloudinary.download.mockResolvedValue(Buffer.from("pic"));
  cloudinary.destroy.mockResolvedValue(true);
  telegram.uploadFile.mockResolvedValue({ fileId: "tg-file", messageId: 77 });
  telegram.downloadFile.mockResolvedValue(Buffer.from("tg-bytes"));
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.INVOICE_PHOTO_STORAGE; else process.env.INVOICE_PHOTO_STORAGE = savedEnv;
  jest.restoreAllMocks();
});

describe("which provider a stored photo belongs to", () => {
  test("a photo with no provider (saved before Cloudinary) is a Telegram photo", () => {
    expect(storage.providerOf({ fileId: "x", messageId: 1 })).toBe("telegram");
    expect(storage.providerOf(undefined)).toBe("telegram");
    expect(storage.providerOf({ provider: "telegram", fileId: "x" })).toBe("telegram");
    expect(storage.providerOf({ provider: "cloudinary", fileId: "x" })).toBe("cloudinary");
  });
});

describe("upload: new photos", () => {
  test("go to Cloudinary, private, when it is set up", async () => {
    const out = await storage.upload({ owner: "o1", buffer: BUF, filename: "bill.jpg" });
    expect(cloudinary.upload).toHaveBeenCalledWith(BUF, { owner: "o1", filename: "bill.jpg" });
    expect(telegram.uploadFile).not.toHaveBeenCalled();
    expect(out).toEqual({ provider: "cloudinary", fileId: "sbt-invoices/o1/abc", mimeType: "image/jpeg" });
    expect(out).not.toHaveProperty("messageId");
  });

  test("are read back once before being kept", async () => {
    await storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" });
    expect(cloudinary.download).toHaveBeenCalledWith("sbt-invoices/o1/abc", "image/jpeg");
  });

  test("a photo that can't be read back is deleted and refused, never saved", async () => {
    cloudinary.download.mockRejectedValue(new Error("403"));
    const err = await storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" }).catch((e) => e);
    expect(err).toBeInstanceOf(cloudinary.PhotoStorageError);
    expect(err.message).toMatch(/could not read it back/);
    expect(cloudinary.destroy).toHaveBeenCalledWith("sbt-invoices/o1/abc");
    expect(telegram.uploadFile).not.toHaveBeenCalled(); // no silent switch to another store
  });

  test("an empty read-back counts as unreadable too", async () => {
    cloudinary.download.mockResolvedValue(Buffer.alloc(0));
    await expect(storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" })).rejects.toThrow(/could not read it back/);
    expect(cloudinary.destroy).toHaveBeenCalled();
  });

  test("a Cloudinary upload failure is passed on as is, not hidden by falling back to Telegram", async () => {
    const boom = new cloudinary.PhotoStorageError("check the settings", 502);
    cloudinary.upload.mockRejectedValue(boom);
    await expect(storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" })).rejects.toBe(boom);
    expect(telegram.uploadFile).not.toHaveBeenCalled();
  });

  test("go to Telegram when Cloudinary is not set up", async () => {
    cloudinary.isConfigured.mockReturnValue(false);
    const out = await storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" });
    expect(cloudinary.upload).not.toHaveBeenCalled();
    expect(out).toEqual({ provider: "telegram", fileId: "tg-file", messageId: 77, mimeType: "image/jpeg" });
  });

  test("INVOICE_PHOTO_STORAGE=telegram forces the old store even when Cloudinary is set up", async () => {
    process.env.INVOICE_PHOTO_STORAGE = "telegram";
    const out = await storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" });
    expect(cloudinary.upload).not.toHaveBeenCalled();
    expect(out.provider).toBe("telegram");
  });

  test("any other value of the switch changes nothing", async () => {
    process.env.INVOICE_PHOTO_STORAGE = "cloudinary";
    expect((await storage.upload({ owner: "o1", buffer: BUF, filename: "b.jpg" })).provider).toBe("cloudinary");
  });
});

describe("download: old photos keep loading, with no migration", () => {
  test("a record from before this change (no provider) is fetched from Telegram exactly as before", async () => {
    const old = { fileId: "tg-old", messageId: 5, mimeType: "image/jpeg" };
    const out = await storage.download(old);
    expect(telegram.downloadFile).toHaveBeenCalledWith("tg-old");
    expect(cloudinary.download).not.toHaveBeenCalled();
    expect(out.buffer.toString()).toBe("tg-bytes");
    expect(out.mimeType).toBe("image/jpeg");
  });

  test("an old Telegram photo still loads when Cloudinary is not configured, or the switch is on", async () => {
    cloudinary.isConfigured.mockReturnValue(false);
    process.env.INVOICE_PHOTO_STORAGE = "telegram";
    const out = await storage.download({ fileId: "tg-old" });
    expect(out.buffer.toString()).toBe("tg-bytes");
  });

  test("a Cloudinary record is fetched from Cloudinary with its stored picture type", async () => {
    const rec = { provider: "cloudinary", fileId: "sbt-invoices/o1/abc", mimeType: "image/png" };
    const out = await storage.download(rec);
    expect(cloudinary.download).toHaveBeenCalledWith("sbt-invoices/o1/abc", "image/png");
    expect(telegram.downloadFile).not.toHaveBeenCalled();
    expect(out.mimeType).toBe("image/png");
  });

  test("a new photo still opens after the switch is flipped back to telegram (reading follows the record, not the setting)", async () => {
    process.env.INVOICE_PHOTO_STORAGE = "telegram";
    await storage.download({ provider: "cloudinary", fileId: "x", mimeType: "image/jpeg" });
    expect(cloudinary.download).toHaveBeenCalled();
  });
});

describe("remove: each photo is deleted from where it lives", () => {
  test("a Telegram photo deletes its chat message", () => {
    storage.remove({ fileId: "tg", messageId: 9 });
    expect(telegram.deleteFile).toHaveBeenCalledWith(9);
    expect(cloudinary.destroy).not.toHaveBeenCalled();
  });
  test("a Cloudinary photo is destroyed there", () => {
    storage.remove({ provider: "cloudinary", fileId: "sbt-invoices/o1/abc" });
    expect(cloudinary.destroy).toHaveBeenCalledWith("sbt-invoices/o1/abc");
    expect(telegram.deleteFile).not.toHaveBeenCalled();
  });
  test("nothing to remove does nothing", () => {
    storage.remove(undefined);
    storage.remove({});
    expect(telegram.deleteFile).not.toHaveBeenCalled();
    expect(cloudinary.destroy).not.toHaveBeenCalled();
  });
});
