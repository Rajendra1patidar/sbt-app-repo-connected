// Request bodies were being written to the database as-is (`$set: req.body`).
// The schema already drops fields it doesn't know, but it happily accepts the
// ones that must never come from a client: who owns the record, its id, its
// timestamps, and secrets such as a customer's portal PIN hash. This strips
// those, plus any key that looks like a Mongo operator or a nested path.

const ALWAYS_PROTECTED = ["_id", "id", "owner", "createdAt", "updatedAt", "__v"];

function stripProtected(body, extraProtected = []) {
  const out = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  const blocked = new Set([...ALWAYS_PROTECTED, ...extraProtected]);
  for (const [key, value] of Object.entries(body)) {
    if (blocked.has(key)) continue;
    if (key.startsWith("$") || key.includes(".")) continue;
    out[key] = value;
  }
  return out;
}

module.exports = { stripProtected, ALWAYS_PROTECTED };
