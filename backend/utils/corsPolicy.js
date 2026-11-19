// Decides which websites (origins) may call this API from a browser.
//
//   CORS_ORIGIN=https://app.example.com,https://portal.example.com   only those sites
//   CORS_ORIGIN=*                                                    any site (a deliberate choice)
//   (nothing set), development                                       any site, for local work
//   (nothing set), production                                        FRONTEND_URL's site if that is set,
//                                                                    otherwise NO browser site at all
//
// Requests with no Origin header (curl, the cron-job.org pings, GitHub's keep-alive, the
// nightly jobs) are not browsers and are never affected by this.

/** "https://App.example.com/" and "https://app.example.com" are the same site. */
function normalizeOrigin(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  try {
    const origin = new URL(v).origin;
    // "localhost:5173" (no http://) parses as a strange scheme and gives "null": keep what was typed.
    if (origin && origin !== "null") return origin;
  } catch (_) { /* not a URL: fall through */ }
  return v.replace(/\/+$/, "");
}

function buildCorsPolicy(env = process.env) {
  const production = env.NODE_ENV === "production";
  const listed = String(env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const wildcard = listed.includes("*");
  const origins = [...new Set(listed.filter((o) => o !== "*").map(normalizeOrigin).filter(Boolean))];

  if (wildcard) {
    return {
      mode: "open", origins, isAllowed: () => true,
      warning: production ? "CORS_ORIGIN is * : every website may call this API from a browser (your choice). To lock it down, list your app and portal addresses instead." : null,
    };
  }
  if (origins.length > 0) {
    return { mode: "list", origins, isAllowed: (o) => !o || origins.includes(normalizeOrigin(o)), warning: null };
  }
  if (!production) {
    return { mode: "open", origins, isAllowed: () => true, warning: null };
  }
  const fallback = normalizeOrigin(env.FRONTEND_URL);
  if (fallback) {
    return {
      mode: "frontend-only", origins: [fallback], isAllowed: (o) => !o || normalizeOrigin(o) === fallback,
      warning: `CORS_ORIGIN is not set, so only ${fallback} (from FRONTEND_URL) may use this API from a browser. Set CORS_ORIGIN to your app address, and add the customer portal address after a comma.`,
    };
  }
  return {
    mode: "closed", origins, isAllowed: (o) => !o,
    warning: "CORS_ORIGIN is not set, so NO website can use this API from a browser. Set CORS_ORIGIN on Render to your app address (comma-separate the customer portal address too), or to * to allow every site.",
  };
}

module.exports = { buildCorsPolicy, normalizeOrigin };
