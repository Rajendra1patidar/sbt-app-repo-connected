const crypto = require("crypto");
const { validateUpload, createSignedUpload, StorageConfigError, sign } = require("../../services/storageService");

describe("storageService (Cloudinary)", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test("validateUpload accepts allowed types and rejects the rest", () => {
    expect(validateUpload("image/jpeg", 1000).ok).toBe(true);
    expect(validateUpload("video/mp4", 30 * 1024 * 1024).ok).toBe(true);
    expect(validateUpload("application/pdf", 1000).ok).toBe(false);
    expect(validateUpload("text/html", 1000).ok).toBe(false);
  });

  test("validateUpload enforces size limits", () => {
    expect(validateUpload("image/png", 9 * 1024 * 1024).ok).toBe(false);
    expect(validateUpload("video/webm", 41 * 1024 * 1024).ok).toBe(false);
    expect(validateUpload("image/png", 0).ok).toBe(false);
  });

  test("sign matches Cloudinary's documented scheme (sorted params + secret, sha1)", () => {
    const expected = crypto.createHash("sha1").update("folder=f&timestamp=123" + "sekret").digest("hex");
    expect(sign({ timestamp: 123, folder: "f" }, "sekret")).toBe(expected);
  });

  test("createSignedUpload fails clearly when Cloudinary env is missing", async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    await expect(createSignedUpload({ owner: "o1", contentType: "image/jpeg", size: 1000 })).rejects.toBeInstanceOf(StorageConfigError);
  });

  test("createSignedUpload returns a signed form scoped to the owner's folder", async () => {
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "democloud", CLOUDINARY_API_KEY: "key123", CLOUDINARY_API_SECRET: "sekret" });
    const r = await createSignedUpload({ owner: "owner123", contentType: "video/mp4", size: 5000 });
    expect(r.uploadUrl).toBe("https://api.cloudinary.com/v1_1/democloud/video/upload");
    expect(r.fields.folder).toBe("sbt-portal/owner123");
    expect(r.fields.api_key).toBe("key123");
    expect(r.fields.allowed_formats).toBe("mp4,webm,mov");
    const { api_key, signature, ...signed } = r.fields;
    expect(signature).toBe(sign(signed, "sekret"));
    expect(JSON.stringify(r)).not.toContain("sekret");
  });

  test("createSignedUpload rejects disallowed content before signing", async () => {
    await expect(createSignedUpload({ owner: "o", contentType: "application/zip", size: 10 })).rejects.toMatchObject({ status: 400 });
  });
});
