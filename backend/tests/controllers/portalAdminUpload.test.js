jest.mock("../../models/PortalContent");
jest.mock("../../models/PortalItem");
jest.mock("../../models/Item");

const router = require("../../routes/portalAdminRoutes");
const ctrl = require("../../controllers/portalAdminController");
const { sign } = require("../../services/storageService");

const mockRes = () => {
  const r = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

describe("portal admin: upload-url", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test("the route is registered (POST /upload-url) and points at the controller", () => {
    const layer = router.stack.find((l) => l.route && l.route.path === "/upload-url");
    expect(layer).toBeTruthy();
    expect(layer.route.methods.post).toBe(true);
    expect(layer.route.stack[0].handle).toBe(ctrl.uploadUrl);
  });

  test("staff accounts are refused", async () => {
    const res = mockRes();
    await ctrl.uploadUrl({ role: "staff", userId: "o1", body: { contentType: "image/jpeg", size: 1000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("a file type that isn't allowed gets a clear 400", async () => {
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" });
    const res = mockRes();
    await ctrl.uploadUrl({ role: "owner", userId: "o1", body: { contentType: "application/pdf", size: 1000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/Only JPG, PNG, WebP images/);
  });

  test("missing Cloudinary settings give a 503 that says what to fix", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    const res = mockRes();
    await ctrl.uploadUrl({ role: "owner", userId: "o1", body: { contentType: "image/png", size: 1000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].message).toMatch(/Cloudinary/);
  });

  test("an owner gets a signed upload scoped to their own folder, without the secret", async () => {
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key1", CLOUDINARY_API_SECRET: "topsecret" });
    const res = mockRes();
    await ctrl.uploadUrl({ role: "owner", userId: "owner42", body: { contentType: "video/mp4", size: 5 * 1024 * 1024 } }, res, jest.fn());
    expect(res.status).not.toHaveBeenCalled();
    const out = res.json.mock.calls[0][0];
    expect(out.kind).toBe("video");
    expect(out.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    expect(out.fields.folder).toBe("sbt-portal/owner42");
    const { api_key, signature, ...signed } = out.fields;
    expect(signature).toBe(sign(signed, "topsecret"));
    expect(JSON.stringify(out)).not.toContain("topsecret");
  });
});
