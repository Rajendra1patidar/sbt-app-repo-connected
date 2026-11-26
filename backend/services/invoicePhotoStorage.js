/**
 * One place that knows where each vendor invoice photo lives, so the controllers don't have to.
 *
 *   NEW photos  -> Cloudinary, private (services/cloudinaryInvoiceStorage.js)
 *   OLD photos  -> still Telegram (services/telegramStorage.js), read exactly as before
 *
 * Each photo remembers its own home in `invoiceImage.provider`. A photo saved before this existed
 * has no `provider` at all, and that means Telegram, so there is nothing to migrate: old photos keep
 * loading from Telegram for as long as the Telegram message exists.
 *
 * `invoiceImage.fileId` stays the one id the app uses to say "this order has a photo" (the frontend
 * only checks that it is set). For Cloudinary it holds Cloudinary's public id.
 *
 * Which store a NEW photo goes to:
 *   - Cloudinary, when the three CLOUDINARY_* settings are present (they already are if portal
 *     uploads work);
 *   - Telegram otherwise;
 *   - Telegram always, if INVOICE_PHOTO_STORAGE=telegram is set. That is the "go back to how it was"
 *     switch: set it on Render and new photos use Telegram again immediately, no deploy.
 */
const telegramStorage = require("./telegramStorage");
const cloudinary = require("./cloudinaryInvoiceStorage");

const providerOf = (invoiceImage) => (invoiceImage && invoiceImage.provider === "cloudinary" ? "cloudinary" : "telegram");

function newPhotosGoToCloudinary() {
  return process.env.INVOICE_PHOTO_STORAGE !== "telegram" && cloudinary.isConfigured();
}

/** Saves a new photo. Returns the fields to store in `invoiceImage` (without uploadedAt). */
async function upload({ owner, buffer, filename }) {
  if (!newPhotosGoToCloudinary()) {
    const saved = await telegramStorage.uploadFile(buffer, filename);
    // Telegram serves every photo back as JPEG whatever was uploaded.
    return { provider: "telegram", fileId: saved.fileId, messageId: saved.messageId, mimeType: "image/jpeg" };
  }

  const saved = await cloudinary.upload(buffer, { owner, filename });

  // Never keep a photo we can't read back. If this check fails, the photo is removed and the upload
  // is refused with a clear message, instead of saving a record that would show a broken thumbnail
  // forever. (If it ever fails for a reason that isn't a real problem, set INVOICE_PHOTO_STORAGE=telegram.)
  try {
    const back = await cloudinary.download(saved.fileId, saved.mimeType);
    if (!back || back.length === 0) throw new Error("empty file");
  } catch (err) {
    console.error("invoicePhotoStorage: uploaded photo could not be read back:", err.message);
    await cloudinary.destroy(saved.fileId);
    throw new cloudinary.PhotoStorageError("The photo was not saved: the photo storage could not read it back. Try again.");
  }
  return { provider: "cloudinary", fileId: saved.fileId, mimeType: saved.mimeType };
}

/** Fetches a stored photo from wherever it lives. Returns { buffer, mimeType }. */
async function download(invoiceImage) {
  if (providerOf(invoiceImage) === "cloudinary") {
    const buffer = await cloudinary.download(invoiceImage.fileId, invoiceImage.mimeType);
    return { buffer, mimeType: invoiceImage.mimeType || "image/jpeg" };
  }
  const buffer = await telegramStorage.downloadFile(invoiceImage.fileId);
  return { buffer, mimeType: invoiceImage.mimeType || "image/jpeg" };
}

/** Deletes a stored photo from wherever it lives. Best effort: callers don't wait for it. */
function remove(invoiceImage) {
  if (!invoiceImage || !invoiceImage.fileId) return;
  if (providerOf(invoiceImage) === "cloudinary") {
    cloudinary.destroy(invoiceImage.fileId); // never throws
  } else {
    telegramStorage.deleteFile(invoiceImage.messageId);
  }
}

module.exports = { upload, download, remove, providerOf, newPhotosGoToCloudinary };
