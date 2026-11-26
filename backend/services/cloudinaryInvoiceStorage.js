/**
 * Stores vendor invoice photos on Cloudinary as PRIVATE ("authenticated") files.
 *
 * Private means there is no public link at all. Cloudinary refuses every request for the file unless
 * it carries a signature made with the API secret, and only this server has that secret. The browser
 * never sees a Cloudinary address for these photos: it asks our own authenticated route, which
 * fetches the file from here and hands over the bytes (same as the Telegram photos always worked).
 *
 * Differences from services/storageService.js: that one is for the customer portal's PUBLIC photos
 * and videos, uploaded straight from the browser. This one is private and goes through the server.
 *
 * Signing uses the same method storageService.js uses for portal uploads (sorted name=value pairs
 * joined with &, then the API secret, SHA-1), which is the one Cloudinary documents.
 *
 * Uses Node's built-in fetch/FormData/Blob; no extra package.
 */
const { sign } = require("./storageService");

const TYPE = "authenticated"; // not "upload" (public). Never change this without reading the note above.
const TIMEOUT_MS = 25000;
const FORMATS = "jpg,jpeg,png,webp,gif"; // what every browser can show

const MIME_BY_FORMAT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const FORMAT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** An error whose message is safe to show the user; `status` is what the API answers with. */
class PhotoStorageError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "PhotoStorageError";
    this.status = status;
    this.expose = true; // written for the user, so the error handler shows it even on a 5xx
  }
}

function config() {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  return { cloud, key, secret };
}

function isConfigured() {
  const { cloud, key, secret } = config();
  return Boolean(cloud && key && secret);
}

const apiUrl = (cloud, action) => `https://api.cloudinary.com/v1_1/${cloud}/image/${action}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Adds the key and signature to the signed params and returns them as strings. */
function signedFields(params, key, secret) {
  const fields = { ...params, api_key: key, signature: sign(params, secret) };
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)]));
}

/**
 * Removes a file. Best effort: never throws, because a file left behind costs nothing and callers
 * must not fail an upload or a delete over cleanup. `type` defaults to ours; pass the real one when
 * cleaning up something Cloudinary stored differently than asked.
 */
async function destroy(publicId, type = TYPE) {
  if (!publicId || !isConfigured()) return false;
  const { cloud, key, secret } = config();
  try {
    const fields = signedFields({ invalidate: "true", public_id: publicId, timestamp: nowSeconds(), type }, key, secret);
    const res = await fetch(apiUrl(cloud, "destroy"), {
      method: "POST",
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || (data && data.result && data.result !== "ok" && data.result !== "not found")) {
      console.error("cloudinaryInvoiceStorage: destroy failed:", res.status, data && (data.error?.message || data.result));
      return false;
    }
    return true;
  } catch (err) {
    console.error("cloudinaryInvoiceStorage: destroy network error:", err.message);
    return false;
  }
}

/** Uploads a photo privately. Returns { fileId (Cloudinary's public id), mimeType }. */
async function upload(buffer, { owner, filename = "invoice.jpg" }) {
  const { cloud, key, secret } = config();
  const params = { allowed_formats: FORMATS, folder: `sbt-invoices/${owner}`, timestamp: nowSeconds(), type: TYPE };

  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  for (const [k, v] of Object.entries(signedFields(params, key, secret))) form.append(k, v);

  let res, data;
  try {
    res = await fetch(apiUrl(cloud, "upload"), { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    data = await res.json().catch(() => null);
  } catch (err) {
    console.error("cloudinaryInvoiceStorage: upload network error:", err.message);
    throw new PhotoStorageError("Couldn't reach the photo storage. Check the connection and try again.");
  }

  if (!res.ok || !data || !data.public_id) {
    const reason = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    console.error("cloudinaryInvoiceStorage: upload failed:", res.status, reason);
    if (res.status === 400) throw new PhotoStorageError("That photo couldn't be saved. Use a JPG, PNG or WebP picture.", 400);
    if (res.status === 401 || res.status === 403) {
      throw new PhotoStorageError("The photo storage refused the server's Cloudinary key. Check the Cloudinary settings on the server.");
    }
    throw new PhotoStorageError("The photo storage had a problem. Try again in a moment.");
  }

  // The whole point is privacy: a photo that ended up public must not be kept.
  if (data.type && data.type !== TYPE) {
    console.error(`cloudinaryInvoiceStorage: stored as "${data.type}" instead of "${TYPE}", removing it`);
    await destroy(data.public_id, data.type);
    throw new PhotoStorageError("The photo storage did not keep the photo private, so it was not saved.");
  }

  return { fileId: data.public_id, mimeType: MIME_BY_FORMAT[String(data.format || "").toLowerCase()] || "image/jpeg" };
}

/** Fetches a private photo's bytes, using a signed request that only this server can make. */
async function download(publicId, mimeType) {
  const { cloud, key, secret } = config();
  const params = { format: FORMAT_BY_MIME[mimeType] || "jpg", public_id: publicId, timestamp: nowSeconds(), type: TYPE };
  const url = `${apiUrl(cloud, "download")}?${new URLSearchParams(signedFields(params, key, secret))}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error("cloudinaryInvoiceStorage: download network error:", err.message);
    throw new PhotoStorageError("Couldn't reach the photo storage. Check the connection and try again.");
  }
  if (!res.ok) {
    // Deliberately not logging the URL: it carries a signature.
    console.error("cloudinaryInvoiceStorage: download failed:", res.status);
    throw new PhotoStorageError("Invoice photo is no longer available", res.status === 404 ? 404 : 502);
  }
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { isConfigured, upload, download, destroy, PhotoStorageError, TYPE };
