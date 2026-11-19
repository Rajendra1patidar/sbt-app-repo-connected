const { buildCorsPolicy, normalizeOrigin } = require("../../utils/corsPolicy");

const prod = (extra = {}) => buildCorsPolicy({ NODE_ENV: "production", ...extra });

describe("normalizeOrigin", () => {
  test("treats a trailing slash, a path and upper-case letters as the same site", () => {
    expect(normalizeOrigin("https://App.Example.com/")).toBe("https://app.example.com");
    expect(normalizeOrigin("https://app.example.com/some/page")).toBe("https://app.example.com");
  });
  test("keeps a host typed without http:// instead of turning it into 'null'", () => {
    expect(normalizeOrigin("localhost:5173")).toBe("localhost:5173");
  });
  test("empty in, empty out", () => {
    expect(normalizeOrigin("")).toBe("");
    expect(normalizeOrigin(undefined)).toBe("");
  });
});

describe("buildCorsPolicy", () => {
  test("a listed origin is allowed, anything else is not, and no-origin requests always pass", () => {
    const p = prod({ CORS_ORIGIN: "https://app.example.com, https://portal.example.com/" });
    expect(p.mode).toBe("list");
    expect(p.warning).toBeNull();
    expect(p.isAllowed("https://app.example.com")).toBe(true);
    expect(p.isAllowed("https://portal.example.com")).toBe(true);
    expect(p.isAllowed("https://evil.example.net")).toBe(false);
    expect(p.isAllowed(undefined)).toBe(true);
  });

  test("production with nothing set is closed to every browser site but still allows curl and cron pings", () => {
    const p = prod();
    expect(p.mode).toBe("closed");
    expect(p.warning).toMatch(/CORS_ORIGIN/);
    expect(p.isAllowed("https://app.example.com")).toBe(false);
    expect(p.isAllowed(undefined)).toBe(true);
  });

  test("production with nothing set but FRONTEND_URL allows just that site", () => {
    const p = prod({ FRONTEND_URL: "https://app.example.com/" });
    expect(p.mode).toBe("frontend-only");
    expect(p.isAllowed("https://app.example.com")).toBe(true);
    expect(p.isAllowed("https://portal.example.com")).toBe(false);
  });

  test("* opens it to every site on purpose, with a log line saying so", () => {
    const p = prod({ CORS_ORIGIN: "*" });
    expect(p.mode).toBe("open");
    expect(p.isAllowed("https://anything.example.org")).toBe(true);
    expect(p.warning).toMatch(/\*/);
  });

  test("development with nothing set stays open so local work is not blocked", () => {
    const p = buildCorsPolicy({ NODE_ENV: "development" });
    expect(p.mode).toBe("open");
    expect(p.isAllowed("http://localhost:5173")).toBe(true);
    expect(p.warning).toBeNull();
  });
});
