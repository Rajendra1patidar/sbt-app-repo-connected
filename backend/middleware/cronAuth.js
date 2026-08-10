const crypto = require("crypto");

/**
 * Gates POST /api/cron/run. Deliberately NOT the normal JWT `protect`
 * middleware — this is called by cron-job.org, a machine with no user
 * account, so it needs its own credential: a long random string in
 * CRON_SECRET, sent back as the X-Cron-Secret header.
 *
 * Fails closed: if CRON_SECRET isn't set on the server at all, every
 * request is rejected rather than the check silently passing — a missing
 * env var should never turn into an open endpoint.
 *
 * Uses timingSafeEqual instead of `===` so a mistyped/guessed secret can't
 * be narrowed down via response-time differences (standard practice for
 * comparing secrets, same reasoning as comparing password hashes).
 */
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("cronAuth: CRON_SECRET is not set — refusing all /api/cron requests.");
    return res.status(500).json({ message: "Cron endpoint not configured." });
  }

  const provided = req.headers["x-cron-secret"] || "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(String(provided));

  const matches =
    expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!matches) {
    return res.status(401).json({ message: "Not authorized." });
  }

  next();
}

module.exports = { requireCronSecret };