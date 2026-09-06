/**
 * Resizes/re-encodes a photo in the browser before it's uploaded, so a full
 * multi-MB phone camera shot doesn't have to travel over a slow site
 * connection (or eat into the free image-hosting quota) just to record a
 * legible copy of a paper invoice. Caps the longest side at 1600px and
 * re-encodes as JPEG at 0.75 quality — plenty sharp enough to read numbers
 * off a bill, at a fraction of the original size (a 4-5MB photo typically
 * comes out under 300KB).
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.75): Promise<File> {
  // Non-image or already-tiny files (e.g. a screenshot) aren't worth the
  // canvas round-trip — pass them through untouched.
  if (!file.type.startsWith("image/") || file.size < 150 * 1024) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unsupported format (e.g. HEIC on some browsers) — let the server see the original

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file; // compression didn't actually help — keep the original

  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
