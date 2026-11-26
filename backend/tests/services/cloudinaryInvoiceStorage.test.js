/**
 * Private invoice photos on Cloudinary. fetch is mocked (no network here), so these tests check
 * what we SEND: the right address, the private type, and signatures worked out independently
 * (SHA-1 of the sorted name=value pairs plus the secret) rather than by calling the code under test.
 */
const crypto = require("crypto");
const storage = require("../../services/cloudinaryInvoiceStorage");

const SECRET = "test-secret";
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const NOW_MS = 1_700_000_000_000;
const NOW_S = 1_700_000_000;

const ENV = { CLOUDINARY_CLOUD_NAME: "democloud", CLOUDINARY_API_KEY: "key123", CLOUDINARY_API_SECRET: SECRET };
let saved;

beforeEach(() => {
  saved = { ...process.env };
  Object.assign(process.env, ENV);
  jest.spyOn(Date, "now").mockReturnValue(NOW_MS);
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = jest.fn();
});
afterEach(() => {
  process.env = saved;
  jest.restoreAllMocks();
});

const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("isConfigured", () => {
  test("needs all three Cloudinary settings", () => {
    expect(storage.isConfigured()).toBe(true);
    for (const k of Object.keys(ENV)) {
      const was = process.env[k];
      delete process.env[k];
      expect(storage.isConfigured()).toBe(false);
      process.env[k] = was;
    }
  });
});

describe("upload (private)", () => {
  const okBody = { public_id: "sbt-invoices/owner1/abc123", format: "jpg", type: "authenticated", bytes: 1234 };

  test("posts the file to the right address as a PRIVATE (authenticated) asset in the owner's folder", async () => {
    global.fetch.mockResolvedValue(jsonRes(200, okBody));
    await storage.upload(Buffer.from("img"), { owner: "owner1", filename: "bill.jpg" });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/democloud/image/upload");
    expect(opts.method).toBe("POST");
    const f = opts.body;
    expect(f.get("type")).toBe("authenticated");
    expect(f.get("folder")).toBe("sbt-invoices/owner1");
    expect(f.get("timestamp")).toBe(String(NOW_S));
    expect(f.get("api_key")).toBe("key123");
    expect(f.get("allowed_formats")).toBe("jpg,jpeg,png,webp,gif");
    const file = f.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect(file.size).toBe(3);
    // the API secret is used to sign but must never be sent
    expect([...f.values()].map(String)).not.toContain(SECRET);
  });

  test("signs exactly the documented way: sorted name=value pairs, then the secret, SHA-1", async () => {
    global.fetch.mockResolvedValue(jsonRes(200, okBody));
    await storage.upload(Buffer.from("img"), { owner: "owner1" });
    const expected = sha1(`allowed_formats=jpg,jpeg,png,webp,gif&folder=sbt-invoices/owner1&timestamp=${NOW_S}&type=authenticated${SECRET}`);
    expect(global.fetch.mock.calls[0][1].body.get("signature")).toBe(expected);
  });

  test("returns Cloudinary's public id as fileId, and the real picture type", async () => {
    global.fetch.mockResolvedValue(jsonRes(200, { ...okBody, format: "png" }));
    await expect(storage.upload(Buffer.from("x"), { owner: "o" })).resolves.toEqual({ fileId: okBody.public_id, mimeType: "image/png" });
  });

  test("a photo that came back PUBLIC is deleted again and refused", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { ...okBody, type: "upload" })) // the upload: stored publicly
      .mockResolvedValueOnce(jsonRes(200, { result: "ok" })); // the cleanup
    await expect(storage.upload(Buffer.from("x"), { owner: "o" })).rejects.toThrow(/not keep the photo private/);
    const [url, opts] = global.fetch.mock.calls[1];
    expect(url).toBe("https://api.cloudinary.com/v1_1/democloud/image/destroy");
    expect(opts.body.get("type")).toBe("upload"); // removed using the type it was ACTUALLY stored with
    expect(opts.body.get("public_id")).toBe(okBody.public_id);
  });

  test.each([
    [400, 400, /JPG, PNG or WebP/],
    [401, 502, /Cloudinary key/],
    [403, 502, /Cloudinary key/],
    [500, 502, /problem/],
  ])("Cloudinary answering %i gives the user a %i with a message they can act on", async (cloudStatus, status, msg) => {
    global.fetch.mockResolvedValue(jsonRes(cloudStatus, { error: { message: "internal detail" } }));
    const err = await storage.upload(Buffer.from("x"), { owner: "o" }).catch((e) => e);
    expect(err).toBeInstanceOf(storage.PhotoStorageError);
    expect(err.status).toBe(status);
    expect(err.message).toMatch(msg);
    expect(err.message).not.toMatch(/internal detail/); // Cloudinary's wording stays in the log
    expect(err.expose).toBe(true);
  });

  test("a network failure is a 502 with a clear message", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNRESET"));
    const err = await storage.upload(Buffer.from("x"), { owner: "o" }).catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/Couldn't reach the photo storage/);
  });

  test("a 200 with no public id is treated as a failure, not a saved photo", async () => {
    global.fetch.mockResolvedValue(jsonRes(200, {}));
    await expect(storage.upload(Buffer.from("x"), { owner: "o" })).rejects.toBeInstanceOf(storage.PhotoStorageError);
  });
});

describe("download (signed request, server side only)", () => {
  test("asks for the original with a signed request for an authenticated asset", async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const buf = await storage.download("sbt-invoices/owner1/abc123", "image/png");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect([...buf]).toEqual([1, 2, 3]);

    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://api.cloudinary.com/v1_1/democloud/image/download");
    const q = url.searchParams;
    expect(q.get("public_id")).toBe("sbt-invoices/owner1/abc123");
    expect(q.get("type")).toBe("authenticated");
    expect(q.get("format")).toBe("png");
    expect(q.get("api_key")).toBe("key123");
    expect(q.get("timestamp")).toBe(String(NOW_S));
    expect(q.get("signature")).toBe(sha1(`format=png&public_id=sbt-invoices/owner1/abc123&timestamp=${NOW_S}&type=authenticated${SECRET}`));
    expect(global.fetch.mock.calls[0][0]).not.toContain(SECRET);
  });

  test("an unknown picture type is requested as jpg", async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) });
    await storage.download("id", undefined);
    expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get("format")).toBe("jpg");
  });

  test("a missing file is a 404, anything else a 502, and the signed address is never logged", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const a = await storage.download("id", "image/jpeg").catch((e) => e);
    expect(a.status).toBe(404);
    expect(a.message).toBe("Invoice photo is no longer available");

    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const b = await storage.download("id", "image/jpeg").catch((e) => e);
    expect(b.status).toBe(502);

    const logged = console.error.mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/signature=/);
    expect(logged).not.toMatch(/api\.cloudinary\.com/);
  });

  test("a network failure is a 502", async () => {
    global.fetch.mockRejectedValue(new Error("timeout"));
    expect((await storage.download("id", "image/jpeg").catch((e) => e)).status).toBe(502);
  });
});

describe("destroy (best effort)", () => {
  test("posts a signed, invalidating delete for an authenticated asset", async () => {
    global.fetch.mockResolvedValue(jsonRes(200, { result: "ok" }));
    await expect(storage.destroy("sbt-invoices/o/x")).resolves.toBe(true);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/democloud/image/destroy");
    const f = opts.body;
    expect(f.get("type")).toBe("authenticated");
    expect(f.get("invalidate")).toBe("true");
    expect(f.get("signature")).toBe(sha1(`invalidate=true&public_id=sbt-invoices/o/x&timestamp=${NOW_S}&type=authenticated${SECRET}`));
  });

  test("never throws: a network error, a refusal, or missing settings all just return false", async () => {
    global.fetch.mockRejectedValueOnce(new Error("down"));
    await expect(storage.destroy("id")).resolves.toBe(false);
    global.fetch.mockResolvedValueOnce(jsonRes(401, { error: { message: "bad key" } }));
    await expect(storage.destroy("id")).resolves.toBe(false);
    await expect(storage.destroy("")).resolves.toBe(false);
    delete process.env.CLOUDINARY_API_SECRET;
    await expect(storage.destroy("id")).resolves.toBe(false);
  });

  test("a file that is already gone counts as done", async () => {
    global.fetch.mockResolvedValue(jsonRes(200, { result: "not found" }));
    await expect(storage.destroy("id")).resolves.toBe(true);
  });
});
