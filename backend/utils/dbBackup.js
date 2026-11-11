const mongoose = require("mongoose");
const zlib = require("zlib");
const { buildZip } = require("./zip");
const { encryptBackup } = require("./backupCrypto");
const { istDay } = require("./istDate");

// Fields never worth putting in a backup: runtime login-throttle state and
// reset tokens are not data anyone wants back, and PIN hashes are the one thing
// that would let somebody sign in to the live app if a backup AND its
// passphrase both leaked. A restored account gets a fresh temporary PIN from the
// restore script instead (see scripts/restoreBackup.js).
const FIELD_STRIPS = {
  users: ["pinHash", "resetTokenHash", "resetTokenExpires", "failedAttempts", "lockUntil"],
};

// Bookkeeping collections that describe the live server, not the business:
// restoring them would only confuse the once-a-day guard or replay old save keys.
const SKIPPED_COLLECTIONS = new Set(["jobruns", "idempotencykeys"]);

// What each delivery channel can carry. Telegram bots may upload up to 50 MB.
// Brevo allows 20 MB per email including content, and base64 adds about a third,
// so 12 MB of attachment leaves comfortable headroom.
const MAX_TELEGRAM_BYTES = 49 * 1024 * 1024;
const MAX_EMAIL_BYTES = 12 * 1024 * 1024;

function stripFields(doc, fields) {
  const copy = { ...doc };
  for (const f of fields) delete copy[f];
  return copy;
}

// Extended JSON keeps database types intact (ObjectId stays an ObjectId, a Date
// stays a Date), which is what makes the restore exact instead of "strings everywhere".
function getEJSON() {
  try {
    return require("bson").EJSON;
  } catch (_) {
    /* fall through to the copy that ships inside the driver */
  }
  const viaDriver = mongoose.mongo && mongoose.mongo.BSON && mongoose.mongo.BSON.EJSON;
  if (viaDriver) return viaDriver;
  throw new Error("dbBackup: no Extended JSON serializer found (the bson package is missing)");
}

/**
 * Reads every collection through the native driver (so a newly added model is
 * in tomorrow's backup with no code change here) and writes one JSON document:
 *   { format: "sbt-backup", version: 1, generatedAt, collections: { name: [docs] } }
 * Each collection is serialized as soon as it is read and then released, so the
 * server never holds the whole database as objects at once (the free Render
 * instance has 512 MB).
 */
async function dumpDatabase() {
  const db = mongoose.connection.db;
  if (!db) {
    const err = new Error("buildEncryptedBackup: no active MongoDB connection");
    err.status = 503;
    throw err;
  }
  const EJSON = getEJSON();
  const collections = await db.listCollections().toArray();
  const generatedAt = new Date().toISOString();
  const parts = [];
  const summary = []; // [{ name, count }]

  for (const { name, type } of collections) {
    if (name.startsWith("system.") || SKIPPED_COLLECTIONS.has(name)) continue;
    if (type && type !== "collection") continue; // views hold no data of their own

    let docs = await db.collection(name).find({}).toArray();
    const count = docs.length;
    const strips = FIELD_STRIPS[name];
    if (strips) docs = docs.map((d) => stripFields(d, strips));
    parts.push(`${JSON.stringify(name)}:${EJSON.stringify(docs, { relaxed: true })}`);
    summary.push({ name, count });
  }

  const text = `{"format":"sbt-backup","version":1,"generatedAt":${JSON.stringify(generatedAt)},"collections":{${parts.join(",")}}}`;
  return { json: Buffer.from(text, "utf8"), summary, generatedAt };
}

let inFlight = null;

async function build(passphrase) {
  const { json, summary, generatedAt } = await dumpDatabase();
  const encrypted = encryptBackup(zlib.gzipSync(json), passphrase);
  return {
    filename: `sbt-backup-${istDay(new Date(generatedAt))}.sbtbackup`,
    buffer: encrypted,
    sizeBytes: encrypted.length,
    summary,
    totalDocs: summary.reduce((sum, c) => sum + c.count, 0),
    generatedAt,
  };
}

/**
 * Builds the encrypted backup file (gzip, then AES-256-GCM; see backupCrypto.js).
 * If the nightly job and an owner's "Download backup" tap overlap, they share the
 * one build in progress rather than reading the database twice.
 */
function buildEncryptedBackup(passphrase) {
  if (!inFlight) {
    inFlight = build(passphrase).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Brevo only accepts a short list of attachment types (".zip" is on it, an
 * unknown extension is not), so the emailed copy is the same encrypted file
 * inside a plain ZIP wrapper. The restore script unwraps it automatically.
 */
function wrapForEmail(backup) {
  return {
    filename: `${backup.filename}.zip`,
    buffer: buildZip([{ name: backup.filename, data: backup.buffer }]),
  };
}

module.exports = { buildEncryptedBackup, wrapForEmail, getEJSON, MAX_TELEGRAM_BYTES, MAX_EMAIL_BYTES, SKIPPED_COLLECTIONS, FIELD_STRIPS };
