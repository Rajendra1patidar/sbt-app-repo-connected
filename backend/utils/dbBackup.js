const zlib = require("zlib");
const mongoose = require("mongoose");

// Fields never worth putting in an emailed backup: they're either not
// secrets that matter for a restore (failedAttempts/lockUntil are runtime
// login-throttle state, not data) or are hashes whose only purpose is
// auth and would just be extra attack surface sitting in an inbox forever.
// pinHash/resetTokenHash are bcrypt/sha256 hashes (not plaintext), so
// omitting them is defense-in-depth, not a fix for an active leak — a
// restored owner account just needs its PIN reset once via the existing
// forgot-PIN flow.
const FIELD_STRIPS = {
  users: ["pinHash", "resetTokenHash", "resetTokenExpires", "failedAttempts", "lockUntil"],
};

// Emailed backups only make sense up to whatever the SMTP provider's
// attachment cap is (Gmail/most providers: ~25MB app-attachment limit,
// often lower in practice once base64 + gzip's own overhead is counted).
// This is a guardrail, not a tuned figure — if a real business genuinely
// grows past this, the fix is moving off "email as backup transport"
// entirely, not raising the number.
const MAX_GZIP_BYTES = 15 * 1024 * 1024; // 15MB

function stripFields(doc, fields) {
  if (!fields || !fields.length) return doc;
  const copy = { ...doc };
  for (const f of fields) delete copy[f];
  return copy;
}

/**
 * Dumps every collection in the connected database to one JSON document
 * (collection name -> array of raw documents), gzips it, and returns the
 * buffer plus a small summary for the email body / logs.
 *
 * Uses the native driver's listCollections/find directly rather than
 * importing every Mongoose model by name, so a newly added model is
 * automatically included in tomorrow's backup with zero code changes here.
 *
 * This is a full, unscoped dump (every owner's data, not just one) — the
 * app enforces a single owner account at registration (see
 * utils/ownerAccounts.js), so per-owner scoping a whole-database backup
 * would be a pointless extra layer for what's currently always one
 * business anyway.
 */
async function buildBackupArchive() {
  const db = mongoose.connection.db;
  if (!db) {
    const err = new Error("buildBackupArchive: no active MongoDB connection");
    err.status = 503;
    throw err;
  }

  const collections = await db.listCollections().toArray();
  const dump = {};
  const summary = []; // [{ name, count }]

  for (const { name } of collections) {
    // Mongo's own internal collections (e.g. system.*) never carry app
    // data and would just be noise/possibly-restricted to read.
    if (name.startsWith("system.")) continue;

    const strips = FIELD_STRIPS[name];
    const docs = await db.collection(name).find({}).toArray();
    dump[name] = strips ? docs.map((d) => stripFields(d, strips)) : docs;
    summary.push({ name, count: docs.length });
  }

  const today = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify({ generatedAt: new Date().toISOString(), collections: dump });
  const gzipBuffer = zlib.gzipSync(Buffer.from(json, "utf8"));

  return {
    filename: `sbt-backup-${today}.json.gz`,
    buffer: gzipBuffer,
    sizeBytes: gzipBuffer.length,
    tooLarge: gzipBuffer.length > MAX_GZIP_BYTES,
    summary,
  };
}

module.exports = { buildBackupArchive, MAX_GZIP_BYTES };
