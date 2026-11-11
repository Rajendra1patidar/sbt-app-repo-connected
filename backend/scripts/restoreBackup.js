/**
 * Opens an encrypted SBT backup and (only when you ask) puts it back into the
 * database. See BACKUPS.md for the full walk-through.
 *
 *   cd backend
 *   node scripts/restoreBackup.js <file>                       look inside, change NOTHING
 *   node scripts/restoreBackup.js <file> --apply               restore into collections that are empty
 *   node scripts/restoreBackup.js <file> --apply --replace     replace what is there with the backup
 *
 * <file> is the .sbtbackup file from Telegram or Settings > Download backup, or
 * the .zip it arrived in by email (it is unwrapped for you).
 *
 * Options
 *   --only=customers,items   restore just these collections
 *   --confirm=<db name>      skip the typing prompt for --replace (for scripts)
 *
 * Passphrase: BACKUP_PASSPHRASE from backend/.env or the environment, otherwise
 * you are asked for it (typing is hidden). It must be the same passphrase that was
 * set when the backup was made.
 *
 * Safety rules built in:
 *   - Without --apply nothing is written, ever.
 *   - A collection that already has records is skipped unless you add --replace.
 *   - --replace first saves the current records of those collections to a
 *     restore-safety-*.json file next to where you ran the command, then asks you
 *     to type the database name before it touches anything.
 *   - Logins (the users collection) are never wiped. An account already in the
 *     database is left exactly as it is. An account missing from the database is
 *     added with a temporary PIN that is printed once, because PIN hashes are
 *     deliberately not stored in backups.
 */
require("dotenv").config();
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const readline = require("readline");

const { decryptBackup, isEncryptedBackup } = require("../utils/backupCrypto");
const { readZip } = require("../utils/zip");
const { getEJSON } = require("../utils/dbBackup");

const CHUNK = 500;

/** Accepts the .sbtbackup file itself or the .zip that wraps it in the weekly email. */
function unwrapBackupFile(fileBuffer) {
  if (isEncryptedBackup(fileBuffer)) return fileBuffer;
  const looksLikeZip = fileBuffer.length > 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b; // "PK"
  if (looksLikeZip) {
    const entries = readZip(fileBuffer);
    const inner = entries.find((e) => e.name.endsWith(".sbtbackup")) || entries[0];
    if (inner && isEncryptedBackup(inner.data)) return inner.data;
  }
  const err = new Error("That file is not an SBT backup (expected a .sbtbackup file, or the .zip it came in by email).");
  err.code = "NOT_A_BACKUP";
  throw err;
}

/** Decrypts and parses a backup file into { format, version, generatedAt, collections }. */
function readBackup(fileBuffer, passphrase) {
  const encrypted = unwrapBackupFile(fileBuffer);
  const gz = decryptBackup(encrypted, passphrase);
  const text = zlib.gunzipSync(gz).toString("utf8");
  const payload = getEJSON().parse(text, { relaxed: true });
  if (!payload || payload.format !== "sbt-backup" || !payload.collections || typeof payload.collections !== "object") {
    throw new Error("The backup opened, but its contents are not in the expected format.");
  }
  return payload;
}

function parseArgs(argv) {
  const args = { file: null, apply: false, replace: false, only: null, confirm: null };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a === "--replace") args.replace = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--confirm=")) args.confirm = a.slice(10);
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else if (!args.file) args.file = a;
  }
  return args;
}

function tempPin() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Puts the backup into `db` (a MongoDB native-driver Db). Returns a report; never
 * prints. `io.log` receives progress lines, `io.hashPin` makes the temporary PIN
 * hashes. Kept free of prompts and process.exit so it can be tested.
 */
async function restoreInto(db, payload, { replace = false, only = null } = {}, io = {}) {
  const log = io.log || (() => {});
  const hashPin = io.hashPin || (async (pin) => require("bcryptjs").hash(pin, 10));
  const wanted = only && only.length ? new Set(only) : null;
  const report = { restored: [], skipped: [], tempPins: [], failed: [] };

  for (const [name, docs] of Object.entries(payload.collections)) {
    if (wanted && !wanted.has(name)) continue;
    const coll = db.collection(name);
    const rows = Array.isArray(docs) ? docs : [];

    try {
      // Logins are merged, never replaced (see the header comment).
      if (name === "users") {
        const existing = await coll.find({}).toArray();
        const have = new Set(existing.map((u) => String(u._id)));
        const missing = rows.filter((u) => !have.has(String(u._id)));
        for (const user of missing) {
          const pin = tempPin();
          await coll.insertOne({ ...user, pinHash: await hashPin(pin), failedAttempts: 0, lockUntil: null, tokenVersion: 0 });
          report.tempPins.push({ email: user.email, pin });
        }
        report.restored.push({ name, count: missing.length, note: `${rows.length - missing.length} login(s) already existed and were kept` });
        continue;
      }

      const current = await coll.countDocuments({});
      if (current > 0 && !replace) {
        report.skipped.push({ name, count: current });
        log(`  ${name}: skipped (the database already has ${current} record(s); add --replace to overwrite)`);
        continue;
      }
      if (current > 0) await coll.deleteMany({});

      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await coll.insertMany(chunk, { ordered: false });
        inserted += chunk.length;
      }
      report.restored.push({ name, count: inserted });
      log(`  ${name}: restored ${inserted} record(s)`);
    } catch (err) {
      report.failed.push({ name, error: err.message });
      log(`  ${name}: FAILED - ${err.message}`);
    }
  }
  return report;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const write = rl._writeToOutput;
    rl._writeToOutput = function (text) {
      if (!muted) write.call(rl, text);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

function table(rows) {
  const width = Math.max(10, ...rows.map((r) => r[0].length));
  return rows.map((r) => `  ${r[0].padEnd(width)}  ${String(r[1]).padStart(8)}  ${String(r[2]).padStart(8)}`).join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.log("Usage: node scripts/restoreBackup.js <backup file> [--apply] [--replace] [--only=a,b] [--confirm=<db name>]");
    console.log("Run it without --apply first: that only looks inside the backup and changes nothing.");
    process.exit(1);
  }
  if (args.replace && !args.apply) {
    console.error("--replace only makes sense together with --apply.");
    process.exit(1);
  }
  if (!fs.existsSync(args.file)) {
    console.error(`File not found: ${args.file}`);
    process.exit(1);
  }

  let passphrase = process.env.BACKUP_PASSPHRASE || "";
  if (!passphrase) passphrase = await ask("Backup passphrase: ", { hidden: true });

  let payload;
  try {
    payload = readBackup(fs.readFileSync(args.file), passphrase);
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }

  const names = Object.keys(payload.collections).filter((n) => !args.only || args.only.includes(n));
  console.log(`\nBackup made ${payload.generatedAt}. Collections inside:\n`);

  // Counting what is in the database needs a connection, but a dry run should work
  // even without one, so a missing MONGODB_URI only means the "now" column is empty.
  const uri = process.env.MONGODB_URI;
  const mongoose = require("mongoose");
  let db = null;
  if (uri) {
    try {
      await mongoose.connect(uri);
      db = mongoose.connection.db;
    } catch (err) {
      if (args.apply) {
        console.error(`Could not connect to the database: ${err.message}`);
        process.exit(1);
      }
      console.log(`(Could not connect to the database to count what is there now: ${err.message})\n`);
    }
  } else if (args.apply) {
    console.error("MONGODB_URI is not set. Add it to backend/.env (or export it) before using --apply.");
    process.exit(1);
  }

  const rows = [["collection", "backup", "database"]];
  for (const n of names) {
    const inBackup = Array.isArray(payload.collections[n]) ? payload.collections[n].length : 0;
    rows.push([n, inBackup, db ? await db.collection(n).countDocuments({}) : "?"]);
  }
  console.log(table(rows));

  if (!args.apply) {
    console.log("\nNothing was changed. To restore, run the same command with --apply (see BACKUPS.md).");
    if (db) await mongoose.disconnect();
    return;
  }

  const dbName = db.databaseName;
  if (args.replace) {
    const typed = args.confirm !== null ? args.confirm : await ask(`\nThis REPLACES the records in database "${dbName}". Type its name to continue: `);
    if (typed.trim() !== dbName) {
      console.error("That did not match the database name. Nothing was changed.");
      await mongoose.disconnect();
      process.exit(1);
    }

    // Only after the go-ahead: keep a copy of what is about to be replaced, in case the backup is not what you wanted.
    const touched = names.filter((n) => n !== "users");
    const safety = {};
    for (const n of touched) safety[n] = await db.collection(n).find({}).toArray();
    const safetyFile = `restore-safety-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(safetyFile, getEJSON().stringify(safety, { relaxed: true }));
    console.log(`\nSaved what is in the database right now to ${safetyFile} (keep it until you are happy with the result).`);
  }

  console.log("\nRestoring...");
  const report = await restoreInto(db, payload, { replace: args.replace, only: args.only }, { log: (l) => console.log(l) });

  for (const r of report.restored.filter((x) => x.name === "users")) {
    console.log(`  users: added ${r.count} login(s)${r.note ? `; ${r.note}` : ""}`);
  }
  if (report.tempPins.length) {
    console.log("\nTemporary PINs (shown once; sign in with the email and this PIN, then change it in Settings):");
    for (const t of report.tempPins) console.log(`  ${t.email}   ${t.pin}`);
  }
  if (report.skipped.length) {
    console.log(`\n${report.skipped.length} collection(s) were skipped because they already have records. Use --replace if you really want them overwritten.`);
  }
  if (report.failed.length) {
    console.log(`\n${report.failed.length} collection(s) FAILED. Fix the cause and run the same command again.`);
  }
  console.log("\nDone. Restart the app on Render so it rebuilds its database indexes.");
  await mongoose.disconnect();
  if (report.failed.length) process.exit(2);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { readBackup, unwrapBackupFile, restoreInto, parseArgs };
