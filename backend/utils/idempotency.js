// A double-click on "Save", a network retry after a slow or dropped response, or
// an offline queue replaying later can submit the same "create estimate" request
// twice. The client sends one Idempotency-Key per save; this makes sure the
// server only ever acts on it once.
//
// Unlike the old 30-second in-memory guard, the keys live in MongoDB
// (models/IdempotencyKey.js, auto-expiring after 7 days), so they survive server
// restarts - which on a free host that sleeps happens all the time - and they
// cover offline replays that arrive hours later.
//
// Usage:
//   const idem = await idempotency.begin(owner, key);
//   if (idem.replay) return res.status(201).json(idem.response);
//   if (idem.inProgress) return res.status(409).json({ ... });
//   try { ...do the work...; await idem.finish(result); }
//   catch (err) { await idem.abort(); throw err; }
//
// If the key store itself has trouble, begin() returns a harmless no-op handle:
// a storage hiccup must never be the reason a sale can't be saved.

const IdempotencyKey = require("../models/IdempotencyKey");

const WAIT_FOR_FIRST_MS = 8000; // how long a concurrent duplicate waits for the first request to finish
const POLL_MS = 250;
const PENDING_STALE_MS = 2 * 60 * 1000; // a "pending" older than this is a crashed request - take it over

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toPlain = (v) => JSON.parse(JSON.stringify(v));

function noopHandle(extra = {}) {
  return {
    replay: false,
    inProgress: false,
    response: null,
    finish: async () => {},
    abort: async () => {},
    ...extra,
  };
}

function activeHandle(owner, key) {
  return noopHandle({
    finish: async (response) => {
      try {
        await IdempotencyKey.updateOne({ owner, key }, { $set: { state: "done", response: toPlain(response) } });
      } catch (err) {
        console.error("idempotency: could not store the result:", err.message);
      }
    },
    abort: async () => {
      try {
        await IdempotencyKey.deleteOne({ owner, key, state: "pending" });
      } catch (err) {
        console.error("idempotency: could not release the key:", err.message);
      }
    },
  });
}

async function tryReserve(owner, key) {
  await IdempotencyKey.create({ owner, key, state: "pending" });
}

async function begin(owner, key) {
  if (!key || typeof key !== "string" || key.length > 200) return noopHandle();
  try {
    await tryReserve(owner, key);
    return activeHandle(owner, key);
  } catch (err) {
    if (!(err && err.code === 11000)) {
      console.error("idempotency: key store unavailable, continuing without it:", err && err.message);
      return noopHandle();
    }
  }

  // The key was used before: either the first attempt finished (replay its
  // result), is still running (wait a moment), or crashed (take the key over).
  try {
    const deadline = Date.now() + WAIT_FOR_FIRST_MS;
    for (;;) {
      const existing = await IdempotencyKey.findOne({ owner, key }).lean();
      if (!existing) break; // released in the meantime - try to reserve again below
      if (existing.state === "done") return noopHandle({ replay: true, response: existing.response });
      const age = Date.now() - new Date(existing.createdAt).getTime();
      if (age > PENDING_STALE_MS) {
        await IdempotencyKey.deleteOne({ owner, key, state: "pending" });
        break;
      }
      if (Date.now() >= deadline) return noopHandle({ inProgress: true });
      await sleep(POLL_MS);
    }
    await tryReserve(owner, key);
    return activeHandle(owner, key);
  } catch (err) {
    if (err && err.code === 11000) return noopHandle({ inProgress: true }); // someone else grabbed it first
    console.error("idempotency: key store unavailable, continuing without it:", err && err.message);
    return noopHandle();
  }
}

module.exports = { begin };
