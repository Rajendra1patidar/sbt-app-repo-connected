import { api } from "./api";

const MAX_IMAGE_EDGE = 1600;

/** Shrinks big phone photos (often 4–8 MB) to ~1600px JPEG before upload. Falls back to the original on any problem. */
async function compressImage(file: File): Promise<File | Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Cloudinary serves a smaller, phone-friendly version when asked: f_auto = best format, q_auto = smart quality. */
export function optimizeUrl(url: string, kind: "image" | "video"): string {
  const t = kind === "image" ? "f_auto,q_auto,w_1200" : "f_auto,q_auto,w_720";
  return url.replace("/upload/", `/upload/${t}/`);
}

/** Uploads one image/video to Cloudinary via a server-signed request and returns its public https URL. */
export async function uploadPortalFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const body = await compressImage(file);
  const contentType = body instanceof File ? body.type : "image/jpeg";
  const { uploadUrl, fields, kind } = await api.portalAdmin.uploadUrl({ contentType, size: body.size });

  const form = new FormData();
  Object.entries(fields as Record<string, string | number>).forEach(([k, v]) => form.append(k, String(v)));
  form.append("file", body);

  const secureUrl = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let res: any = {};
      try { res = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) resolve(res.secure_url);
      else reject(new Error(res?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your internet connection and try again."));
    xhr.send(form);
  });
  return optimizeUrl(secureUrl, kind);
}
