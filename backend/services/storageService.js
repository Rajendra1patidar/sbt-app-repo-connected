const crypto = require("crypto");

// Customer-portal media is stored on Cloudinary (free plan, no card needed).
// The browser uploads straight to Cloudinary using a signature minted here, so large
// videos never pass through this server and the API secret never reaches the browser.
const MB = 1024 * 1024;
const TYPES = {
  "image/jpeg": { kind: "image", max: 8 * MB },
  "image/png": { kind: "image", max: 8 * MB },
  "image/webp": { kind: "image", max: 8 * MB },
  "video/mp4": { kind: "video", max: 40 * MB },
  "video/webm": { kind: "video", max: 40 * MB },
  "video/quicktime": { kind: "video", max: 40 * MB },
};
const FORMATS = { image: "jpg,jpeg,png,webp", video: "mp4,webm,mov" };

class StorageConfigError extends Error {}

function validateUpload(contentType, size) {
  const t = TYPES[contentType];
  if (!t) return { ok: false, message: "Only JPG, PNG, WebP images and MP4, WebM, MOV videos are allowed" };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: "File is empty" };
  if (size > t.max) return { ok: false, message: `${t.kind === "image" ? "Images" : "Videos"} can be at most ${t.max / MB} MB` };
  return { ok: true, ...t };
}

// Cloudinary signature: sha1 of the signed params, sorted by name, joined as k=v&k=v, plus the API secret.
function sign(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(base + secret).digest("hex");
}

/** Returns { uploadUrl, fields, kind } — the browser POSTs `fields` + the file to `uploadUrl`. */
async function createSignedUpload({ owner, contentType, size }) {
  const v = validateUpload(contentType, size);
  if (!v.ok) {
    const e = new Error(v.message);
    e.status = 400;
    throw e;
  }
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) throw new StorageConfigError("Media upload isn't set up on the server yet (missing Cloudinary settings).");

  const signed = { allowed_formats: FORMATS[v.kind], folder: `sbt-portal/${owner}`, timestamp: Math.floor(Date.now() / 1000) };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/${v.kind}/upload`,
    fields: { ...signed, api_key: key, signature: sign(signed, secret) },
    kind: v.kind,
  };
}

module.exports = { validateUpload, createSignedUpload, StorageConfigError, TYPES, sign };
