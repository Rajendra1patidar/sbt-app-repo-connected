/**
 * Invoice photo handlers in purchaseController (shared by /api/purchases and /api/orders):
 * attach, replace, remove, view, and what happens to a photo when its purchase is deleted.
 * Models and storage are mocked; services/invoicePhotoStorage has its own tests.
 */
jest.mock("../../models/Purchase");
jest.mock("../../models/Item");
jest.mock("../../models/Vendor");
jest.mock("../../utils/yearLock", () => ({ assertYearNotLocked: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/ledgerService");
jest.mock("../../services/stockService");
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn() }));
jest.mock("../../utils/withTransaction", () => ({ withTransaction: (fn) => fn(null) }));
jest.mock("../../services/invoicePhotoStorage");

const Purchase = require("../../models/Purchase");
const ledgerService = require("../../services/ledgerService");
const storage = require("../../services/invoicePhotoStorage");
const controller = require("../../controllers/purchaseController");

const fakeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() });
const fakeDoc = (over = {}) => ({ _id: "p1", owner: "owner1", date: "2026-08-03", qty: 1, rate: 5, save: jest.fn().mockResolvedValue(undefined), ...over });
const file = { buffer: Buffer.from("jpegbytes"), originalname: "bill.jpg" };
const req = (over = {}) => ({ userId: "owner1", actorId: "owner1", params: { id: "p1" }, file, ...over });

const NEW_PHOTO = { provider: "cloudinary", fileId: "sbt-invoices/owner1/new", mimeType: "image/jpeg" };
const OLD_TELEGRAM = { fileId: "tg-old", messageId: 41, mimeType: "image/jpeg", uploadedAt: new Date("2026-01-01") };

beforeEach(() => {
  jest.clearAllMocks();
  storage.upload.mockResolvedValue({ ...NEW_PHOTO });
  storage.download.mockResolvedValue({ buffer: Buffer.from("PIXELS"), mimeType: "image/png" });
});

describe("attachInvoice", () => {
  test("400 when no picture was sent, and nothing is stored", async () => {
    const res = fakeRes();
    await controller.attachInvoice(req({ file: undefined }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  test("404 for an order that is not this owner's, and nothing is stored", async () => {
    Purchase.findOne.mockResolvedValue(null);
    const res = fakeRes();
    await controller.attachInvoice(req(), res, jest.fn());
    expect(Purchase.findOne).toHaveBeenCalledWith({ _id: "p1", owner: "owner1" });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  test("stores the new photo (private, Cloudinary) on the record and returns it", async () => {
    const doc = fakeDoc();
    Purchase.findOne.mockResolvedValue(doc);
    const res = fakeRes();
    await controller.attachInvoice(req(), res, jest.fn());

    expect(storage.upload).toHaveBeenCalledWith({ owner: "owner1", buffer: file.buffer, filename: "bill.jpg" });
    expect(doc.invoiceImage).toMatchObject(NEW_PHOTO);
    expect(doc.invoiceImage.uploadedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(doc);
    expect(storage.remove).not.toHaveBeenCalled(); // nothing was there before
  });

  test("replacing an OLD TELEGRAM photo deletes that Telegram message, after the new one is saved", async () => {
    const doc = fakeDoc({ invoiceImage: { ...OLD_TELEGRAM } });
    Purchase.findOne.mockResolvedValue(doc);
    const order = [];
    doc.save.mockImplementation(async () => { order.push("save"); });
    storage.remove.mockImplementation(() => { order.push("remove"); });

    await controller.attachInvoice(req(), fakeRes(), jest.fn());
    expect(storage.remove).toHaveBeenCalledWith({ provider: undefined, fileId: "tg-old", messageId: 41 });
    expect(order).toEqual(["save", "remove"]);
    expect(doc.invoiceImage.provider).toBe("cloudinary"); // the record now points at the new home
  });

  test("replacing a Cloudinary photo removes the previous Cloudinary file", async () => {
    const doc = fakeDoc({ invoiceImage: { provider: "cloudinary", fileId: "sbt-invoices/owner1/prev", mimeType: "image/jpeg" } });
    Purchase.findOne.mockResolvedValue(doc);
    await controller.attachInvoice(req(), fakeRes(), jest.fn());
    expect(storage.remove).toHaveBeenCalledWith({ provider: "cloudinary", fileId: "sbt-invoices/owner1/prev", messageId: undefined });
  });

  test("if the record can't be saved, the NEW file is removed and the old photo is kept", async () => {
    const doc = fakeDoc({ invoiceImage: { ...OLD_TELEGRAM } });
    doc.save.mockRejectedValue(new Error("db down"));
    Purchase.findOne.mockResolvedValue(doc);
    const next = jest.fn();
    await controller.attachInvoice(req(), fakeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "db down" }));
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(expect.objectContaining({ fileId: NEW_PHOTO.fileId })); // cleaned up the new one
    expect(storage.remove).not.toHaveBeenCalledWith(expect.objectContaining({ fileId: "tg-old" })); // never the old one
  });

  test("if the upload fails, nothing is saved and the old photo is untouched", async () => {
    const doc = fakeDoc({ invoiceImage: { ...OLD_TELEGRAM } });
    Purchase.findOne.mockResolvedValue(doc);
    const boom = Object.assign(new Error("storage down"), { status: 502 });
    storage.upload.mockRejectedValue(boom);
    const next = jest.fn();
    await controller.attachInvoice(req(), fakeRes(), next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(doc.save).not.toHaveBeenCalled();
    expect(doc.invoiceImage.fileId).toBe("tg-old");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  test("a missing file name falls back to invoice.jpg", async () => {
    Purchase.findOne.mockResolvedValue(fakeDoc());
    await controller.attachInvoice(req({ file: { buffer: file.buffer } }), fakeRes(), jest.fn());
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ filename: "invoice.jpg" }));
  });
});

describe("removeInvoice", () => {
  test("clears the photo from the record, then deletes it from where it lives", async () => {
    const doc = fakeDoc({ invoiceImage: { ...NEW_PHOTO } });
    Purchase.findOne.mockResolvedValue(doc);
    const res = fakeRes();
    await controller.removeInvoice(req({ file: undefined }), res, jest.fn());
    expect(doc.invoiceImage).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith({ provider: "cloudinary", fileId: NEW_PHOTO.fileId, messageId: undefined });
    expect(res.json).toHaveBeenCalledWith(doc);
  });

  test("an old Telegram photo is removed through its message id", async () => {
    Purchase.findOne.mockResolvedValue(fakeDoc({ invoiceImage: { ...OLD_TELEGRAM } }));
    await controller.removeInvoice(req({ file: undefined }), fakeRes(), jest.fn());
    expect(storage.remove).toHaveBeenCalledWith({ provider: undefined, fileId: "tg-old", messageId: 41 });
  });

  test("nothing to remove: unchanged, nothing deleted anywhere", async () => {
    const doc = fakeDoc();
    Purchase.findOne.mockResolvedValue(doc);
    const res = fakeRes();
    await controller.removeInvoice(req({ file: undefined }), res, jest.fn());
    expect(doc.save).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(doc);
  });

  test("404 for someone else's order", async () => {
    Purchase.findOne.mockResolvedValue(null);
    const res = fakeRes();
    await controller.removeInvoice(req({ file: undefined }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("getInvoiceImage", () => {
  test("sends the photo's bytes with its picture type, cached privately", async () => {
    Purchase.findOne.mockResolvedValue(fakeDoc({ invoiceImage: { ...NEW_PHOTO } }));
    const res = fakeRes();
    await controller.getInvoiceImage(req({ file: undefined }), res, jest.fn());
    expect(storage.download).toHaveBeenCalledWith(expect.objectContaining(NEW_PHOTO));
    expect(res.set).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, max-age=86400");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("PIXELS"));
  });

  test("an OLD record with no provider is handed to the storage unchanged, so it loads from Telegram", async () => {
    Purchase.findOne.mockResolvedValue(fakeDoc({ invoiceImage: { ...OLD_TELEGRAM } }));
    await controller.getInvoiceImage(req({ file: undefined }), fakeRes(), jest.fn());
    const passed = storage.download.mock.calls[0][0];
    expect(passed.fileId).toBe("tg-old");
    expect(passed.provider).toBeUndefined();
  });

  test("404 when the order has no photo or isn't this owner's", async () => {
    Purchase.findOne.mockResolvedValue(fakeDoc());
    const a = fakeRes();
    await controller.getInvoiceImage(req({ file: undefined }), a, jest.fn());
    expect(a.status).toHaveBeenCalledWith(404);
    Purchase.findOne.mockResolvedValue(null);
    const b = fakeRes();
    await controller.getInvoiceImage(req({ file: undefined }), b, jest.fn());
    expect(b.status).toHaveBeenCalledWith(404);
    expect(storage.download).not.toHaveBeenCalled();
  });

  test("a storage failure goes to the error handler (with its status), not a crash", async () => {
    Purchase.findOne.mockResolvedValue(fakeDoc({ invoiceImage: { ...NEW_PHOTO } }));
    const gone = Object.assign(new Error("Invoice photo is no longer available"), { status: 404 });
    storage.download.mockRejectedValue(gone);
    const next = jest.fn();
    await controller.getInvoiceImage(req({ file: undefined }), fakeRes(), next);
    expect(next).toHaveBeenCalledWith(gone);
  });
});

describe("deleting an order/purchase", () => {
  beforeEach(() => { ledgerService.reverseSource.mockResolvedValue(undefined); });
  const del = async (doc) => {
    Purchase.findOne.mockResolvedValue(doc);
    Purchase.findOneAndDelete.mockResolvedValue(doc);
    const res = fakeRes();
    await controller.remove(req({ file: undefined }), res, jest.fn());
    return res;
  };

  test("takes its private Cloudinary photo with it", async () => {
    await del(fakeDoc({ source: "order", invoiceImage: { ...NEW_PHOTO } }));
    expect(storage.remove).toHaveBeenCalledWith(expect.objectContaining(NEW_PHOTO));
  });

  test("leaves an old Telegram photo where it always was (behaviour unchanged)", async () => {
    await del(fakeDoc({ source: "manual", invoiceImage: { ...OLD_TELEGRAM } }));
    expect(storage.remove).not.toHaveBeenCalled();
  });

  test("no photo: nothing to clean up, delete still succeeds", async () => {
    const res = await del(fakeDoc({ source: "order" }));
    expect(storage.remove).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: "Deleted", id: "p1" });
  });
});
