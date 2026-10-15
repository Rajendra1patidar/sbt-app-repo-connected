const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Verifies the JWT, then resolves the logged-in account to the data scope
 * every controller already filters by.
 *
 * decoded.id is whichever account actually logged in. For an "owner"
 * account that IS the data scope (unchanged from before). For a "staff"
 * account, the data they should see belongs to the owner they work for —
 * so req.userId is set to that owner's id instead, meaning every existing
 * controller (all already written as `{ owner: req.userId }`) works
 * correctly for a staff login without a single line of them changing.
 *
 * req.actorId is who's actually logged in (for audit trails / approval
 * records — "who requested this"), and req.role is "owner" or "staff",
 * for routes that need to gate an action to the owner only.
 */
// Every API call used to cost one User.findById just to learn role/ownerId — 19 extra
// reads per app load. Those two fields almost never change, so remember them briefly.
// Staff deletion calls invalidateAuthCache so a removed staff login stops working
// immediately instead of after the TTL.
const AUTH_CACHE_TTL_MS = 60 * 1000;
const AUTH_CACHE_MAX = 500;
const authCache = new Map(); // accountId -> { role, ownerId, expires }

function invalidateAuthCache(accountId) {
  if (accountId) authCache.delete(String(accountId));
  else authCache.clear();
}

async function resolveAccount(id) {
  const key = String(id);
  const hit = authCache.get(key);
  if (hit && hit.expires > Date.now()) return hit;

  const account = await User.findById(id).select("role ownerId");
  if (!account) {
    authCache.delete(key);
    return null;
  }
  if (authCache.size >= AUTH_CACHE_MAX) authCache.delete(authCache.keys().next().value);
  const entry = { role: account.role || "owner", ownerId: account.ownerId ? account.ownerId : null, expires: Date.now() + AUTH_CACHE_TTL_MS };
  authCache.set(key, entry);
  return entry;
}

async function protect(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const account = await resolveAccount(decoded.id);
    if (!account) {
      return res.status(401).json({ message: "Not authorized, account not found" });
    }

    req.actorId = String(decoded.id);
    req.role = account.role;
    req.userId = req.role === "staff" && account.ownerId ? account.ownerId : String(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token invalid or expired" });
  }
}

module.exports = { protect, invalidateAuthCache };
