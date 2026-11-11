/**
 * Tests for the backup builder. Mongoose is replaced by a small fake database
 * (same reasoning as the other tests: no real MongoDB here), and the real
 * encryption and ZIP code are used, so the file produced is really opened again
 * with the passphrase to prove what is inside it.
 */

jest.mock("mongoose", () => ({
  connection: {},
  mongo: {},
}));
jest.mock("bson", () => ({
  EJSON: { stringify: (value) => JSON.stringify(value), parse: (text) => JSON.parse(text) },
}));

const zlib = require("zlib");
const mongoose = require("mongoose");
const { buildEncryptedBackup, wrapForEmail } = require("../../utils/dbBackup");
const { decryptBackup } = require("../../utils/backupCrypto");
const { readZip } = require("../../utils/zip");

const PASS = "test-passphrase-123";

function fakeDb(collections, { views = [] } = {}) {
  const listCollections = jest.fn(() => ({
    toArray: async () => [
      ...Object.keys(collections).map((name) => ({ name, type: "collection" })),
      ...views.map((name) => ({ name, type: "view" })),
    ],
  }));
  return {
    listCollections,
    collection: (name) => ({
      find: () => ({ toArray: async () => (collections[name] || []).map((d) => ({ ...d })) }),
    }),
  };
}

function open(backup) {
  return JSON.parse(zlib.gunzipSync(decryptBackup(backup.buffer, PASS)).toString("utf8"));
}

beforeEach(() => {
  mongoose.connection.db = null;
});

describe("buildEncryptedBackup", () => {
  test("produces an encrypted file that opens to every collection with its records", async () => {
    mongoose.connection.db = fakeDb({
      customers: [{ _id: "c1", name: "Ramesh Patel" }, { _id: "c2", name: "Mehta Constructions" }],
      items: [{ _id: "i1", name: "PPC cement" }],
      expenses: [],
    });

    const backup = await buildEncryptedBackup(PASS);

    expect(backup.filename).toMatch(/^sbt-backup-\d{4}-\d{2}-\d{2}\.sbtbackup$/);
    expect(backup.totalDocs).toBe(3);
    expect(backup.sizeBytes).toBe(backup.buffer.length);
    expect(backup.summary).toEqual([
      { name: "customers", count: 2 },
      { name: "items", count: 1 },
      { name: "expenses", count: 0 },
    ]);
    expect(backup.buffer.toString("latin1")).not.toContain("Ramesh");

    const payload = open(backup);
    expect(payload.format).toBe("sbt-backup");
    expect(payload.version).toBe(1);
    expect(payload.collections.customers).toHaveLength(2);
    expect(payload.collections.customers[0].name).toBe("Ramesh Patel");
    expect(payload.collections.expenses).toEqual([]);
  });

  test("leaves PIN hashes and login-throttle state out of the users collection", async () => {
    mongoose.connection.db = fakeDb({
      users: [
        {
          _id: "u1",
          email: "owner@example.com",
          pinHash: "$2a$10$abcdef",
          resetTokenHash: "tokenhash",
          failedAttempts: 2,
          lockUntil: null,
          role: "owner",
        },
      ],
    });

    const payload = open(await buildEncryptedBackup(PASS));
    const user = payload.collections.users[0];

    expect(user.email).toBe("owner@example.com");
    expect(user.role).toBe("owner");
    expect(user.pinHash).toBeUndefined();
    expect(user.resetTokenHash).toBeUndefined();
    expect(user.failedAttempts).toBeUndefined();
  });

  test("skips bookkeeping collections, system collections and views", async () => {
    mongoose.connection.db = fakeDb(
      {
        customers: [{ _id: "c1" }],
        jobruns: [{ _id: "j1" }],
        idempotencykeys: [{ _id: "k1" }],
        "system.indexes": [{ _id: "s1" }],
      },
      { views: ["some_view"] }
    );

    const backup = await buildEncryptedBackup(PASS);

    expect(backup.summary.map((c) => c.name)).toEqual(["customers"]);
    expect(Object.keys(open(backup).collections)).toEqual(["customers"]);
  });

  test("fails clearly when there is no database connection", async () => {
    let error;
    try {
      await buildEncryptedBackup(PASS);
    } catch (e) {
      error = e;
    }
    expect(error.status).toBe(503);
    expect(error.message).toContain("no active MongoDB connection");
  });

  test("two overlapping requests share one read of the database", async () => {
    const db = fakeDb({ customers: [{ _id: "c1" }] });
    mongoose.connection.db = db;

    const [a, b] = await Promise.all([buildEncryptedBackup(PASS), buildEncryptedBackup(PASS)]);

    expect(db.listCollections).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);

    // and a later request reads again (the lock is released)
    await buildEncryptedBackup(PASS);
    expect(db.listCollections).toHaveBeenCalledTimes(2);
  });

  test("refuses to build without a usable passphrase", async () => {
    mongoose.connection.db = fakeDb({ customers: [] });
    let error;
    try {
      await buildEncryptedBackup("");
    } catch (e) {
      error = e;
    }
    expect(error.message).toContain("BACKUP_PASSPHRASE");
  });
});

describe("wrapForEmail", () => {
  test("puts the encrypted file inside a plain .zip (Brevo accepts .zip but not an unknown extension)", async () => {
    mongoose.connection.db = fakeDb({ customers: [{ _id: "c1" }] });
    const backup = await buildEncryptedBackup(PASS);

    const wrapped = wrapForEmail(backup);

    expect(wrapped.filename).toBe(`${backup.filename}.zip`);
    const entries = readZip(wrapped.buffer);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe(backup.filename);
    expect(entries[0].data.equals(backup.buffer)).toBe(true);
  });
});
