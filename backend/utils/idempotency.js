// A double-click on "Save", or a network retry after a slow/dropped response,
// can otherwise submit the same "create estimate" request twice and produce
// two identical documents (two stock deductions, two ledger posts). This is a
// lightweight in-process guard against exactly that: if the same owner sends
// the same idempotency key again within the window, we return the first
// response instead of creating a second document.
//
// In-memory + single-process is a deliberate scope limit: it stops the
// overwhelmingly common case (accidental double-submit from one browser tab)
// without needing a new collection or a distributed cache for a small
// business app running on one server instance.

const WINDOW_MS = 30 * 1000;
const cache = new Map(); // key -> { response, expiresAt }

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

/** Returns the cached response for this key if it's still within the window, else null. */
function getCached(owner, key) {
  if (!key) return null;
  cleanup();
  const entry = cache.get(`${owner}:${key}`);
  return entry ? entry.response : null;
}

/** Remembers `response` against this key for WINDOW_MS. */
function remember(owner, key, response) {
  if (!key) return;
  cache.set(`${owner}:${key}`, { response, expiresAt: Date.now() + WINDOW_MS });
}

module.exports = { getCached, remember };
