/**
 * Tests for the restore script: opening a backup (the .sbtbackup file and the
 * .zip it arrives in by email), and putting it into a database. The database is
 * a small in-memory fake with the few driver calls the script uses.
 */

jest.mock("dotenv", () => ({ config: () => {} }));
jest.mock("mongoose", () => ({ connection: {}, mongo: {} }));
jest.mock("bson", () => ({
  EJSON: { stringify: (v) => JSON.stringify(v), parse: (text) => JSON.parse(text) },
}));

const zlib = require("zlib");
const { encryptBackup } = require("../../utils/backupCrypto");
const { buildZip } = require("../../utils/zip");
const { readBackup, unwrapBackupFile, restoreInto, parseArgs } = require("../../scripts/restoreBackup");

const PASS = "test-passphrase-123";

function makeBackupFile(collections) {
  const payload = { format: "sbt-backup", version: 1, generatedAt: "2026-11-08T14:31:00.000Z", collections };
  return encryptBackup(zlib.gzipSync(Buffer.from(JSON.stringify(payload))), PASS);
}

function fakeDb(initial = {}, { failInsertOn = [] } = {}) {
  const data = {};
  for (const [name, docs] of Object.entries(initial)) data[name] = docs.map((d) => ({ ...d }));
  return {
    data,
    collection: (name) => ({
      countDocuments: async () => (data[name] || []).length,
      find: () => ({ toArray: async () => (data[name] || []).map((d) => ({ ...d })) }),
      deleteMany: async () => {
        data[name] = [];
      },
      insertMany: async (docs) => {
        if (failInsertOn.includes(name)) throw new Error("duplicate key");
        data[name] = [...(data[name] || []), ...docs.map((d) => ({ ...d }))];
      },
      insertOne: async (doc) => {
        data[name] = [...(data[name] || []), { ...doc }];
      },
    }),
  };
}

const hashPin = async (pin) => `hashed:${pin}`;

describe("readBackup", () => {
  const collections = { customers: [{ _id: "c1", name: "Ramesh Patel" }], items: [] };

  test("opens a .sbtbackup file with the right passphrase", () => {
    const payload = readBackup(makeBackupFile(collections), PASS);
    expect(payload.generatedAt).toBe("2026-11-08T14:31:00.000Z");
    expect(payload.collections.customers[0].name).toBe("Ramesh Patel");
  });

  test("opens the .zip the weekly email arrives in", () => {
    const file = makeBackupFile(collections);
    const emailed = buildZip([{ name: "sbt-backup-2026-11-08.sbtbackup", data: file }]);

    expect(unwrapBackupFile(emailed).equals(file)).toBe(true);
    expect(readBackup(emailed, PASS).collections.customers).toHaveLength(1);
  });

  test("a wrong passphrase is reported clearly", () => {
    let error;
    try {
      readBackup(makeBackupFile(collections), "not the passphrase");
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("BAD_PASSPHRASE");
  });

  test("a file that is not a backup is reported clearly", () => {
    let error;
    try {
      readBackup(Buffer.from("some other file entirely"), PASS);
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("NOT_A_BACKUP");

    // a zip with something else inside it
    const wrongZip = buildZip([{ name: "notes.txt", data: Buffer.from("hello") }]);
    expect(() => readBackup(wrongZip, PASS)).toThrow("not an SBT backup");
  });

  test("rejects a backup whose contents are not in the expected shape", () => {
    const odd = encryptBackup(zlib.gzipSync(Buffer.from(JSON.stringify({ hello: "world" }))), PASS);
    expect(() => readBackup(odd, PASS)).toThrow("not in the expected format");
  });
});

describe("restoreInto", () => {
  const payload = {
    collections: {
      customers: [{ _id: "c1", name: "Ramesh Patel" }, { _id: "c2", name: "Mehta Constructions" }],
      items: [{ _id: "i1", name: "PPC cement" }],
    },
  };

  test("restores into empty collections", async () => {
    const db = fakeDb();

    const report = await restoreInto(db, payload, {}, { hashPin });

    expect(db.data.customers).toHaveLength(2);
    expect(db.data.items).toHaveLength(1);
    expect(report.restored).toEqual([
      { name: "customers", count: 2 },
      { name: "items", count: 1 },
    ]);
    expect(report.skipped).toEqual([]);
    expect(report.failed).toEqual([]);
  });

  test("never touches a collection that already has records, unless replace is asked for", async () => {
    const db = fakeDb({ customers: [{ _id: "x1", name: "Existing customer" }] });

    const report = await restoreInto(db, payload, {}, { hashPin });

    expect(db.data.customers).toEqual([{ _id: "x1", name: "Existing customer" }]);
    expect(report.skipped).toEqual([{ name: "customers", count: 1 }]);
    expect(db.data.items).toHaveLength(1); // the empty one was restored
  });

  test("replace swaps the current records for the backup's", async () => {
    const db = fakeDb({ customers: [{ _id: "x1", name: "Existing customer" }] });

    const report = await restoreInto(db, payload, { replace: true }, { hashPin });

    expect(db.data.customers.map((c) => c._id)).toEqual(["c1", "c2"]);
    expect(report.skipped).toEqual([]);
  });

  test("restores large collections in chunks without losing any record", async () => {
    const many = Array.from({ length: 1234 }, (_, i) => ({ _id: `d${i}` }));
    const db = fakeDb();

    const report = await restoreInto(db, { collections: { invoices: many } }, {}, { hashPin });

    expect(db.data.invoices).toHaveLength(1234);
    expect(report.restored[0].count).toBe(1234);
  });

  test("only restores the collections asked for", async () => {
    const db = fakeDb();

    await restoreInto(db, payload, { only: ["items"] }, { hashPin });

    expect(db.data.items).toHaveLength(1);
    expect(db.data.customers).toBeUndefined();
  });

  test("one collection failing is reported and the others still restore", async () => {
    const db = fakeDb({}, { failInsertOn: ["customers"] });

    const report = await restoreInto(db, payload, {}, { hashPin });

    expect(report.failed).toEqual([{ name: "customers", error: "duplicate key" }]);
    expect(db.data.items).toHaveLength(1);
  });

  describe("logins (users)", () => {
    const withUsers = {
      collections: {
        users: [
          { _id: "u1", email: "owner@example.com", role: "owner", tokenVersion: 4 },
          { _id: "u2", email: "staff@example.com", role: "staff" },
        ],
      },
    };

    test("an account that already exists is left exactly as it is", async () => {
      const db = fakeDb({ users: [{ _id: "u1", email: "owner@example.com", pinHash: "existing-hash" }] });

      const report = await restoreInto(db, withUsers, { replace: true }, { hashPin });

      const owner = db.data.users.find((u) => u._id === "u1");
      expect(owner.pinHash).toBe("existing-hash");
      expect(db.data.users).toHaveLength(2);
      expect(report.restored[0].note).toContain("1 login(s) already existed");
    });

    test("a missing account is added with a temporary PIN that is handed back once", async () => {
      const db = fakeDb();

      const report = await restoreInto(db, withUsers, {}, { hashPin });

      expect(db.data.users).toHaveLength(2);
      expect(report.tempPins).toHaveLength(2);
      const ownerPin = report.tempPins.find((t) => t.email === "owner@example.com");
      expect(ownerPin.pin).toMatch(/^\d{6}$/);
      const stored = db.data.users.find((u) => u._id === "u1");
      expect(stored.pinHash).toBe(`hashed:${ownerPin.pin}`);
      expect(stored.tokenVersion).toBe(0); // old sign-in tokens stop working
      expect(stored.failedAttempts).toBe(0);
    });

    test("users are never wiped, even with replace", async () => {
      const db = fakeDb({ users: [{ _id: "u9", email: "someone@example.com", pinHash: "keep-me" }] });

      await restoreInto(db, withUsers, { replace: true }, { hashPin });

      expect(db.data.users.find((u) => u._id === "u9").pinHash).toBe("keep-me");
    });
  });
});

describe("parseArgs", () => {
  test("reads the file name and the options", () => {
    expect(parseArgs(["backup.sbtbackup", "--apply", "--replace", "--only=a,b", "--confirm=sbt"])).toEqual({
      file: "backup.sbtbackup",
      apply: true,
      replace: true,
      only: ["a", "b"],
      confirm: "sbt",
    });
  });

  test("defaults to a dry run", () => {
    const args = parseArgs(["backup.sbtbackup"]);
    expect(args.apply).toBe(false);
    expect(args.replace).toBe(false);
    expect(args.only).toBeNull();
  });

  test("an unknown option is an error rather than being ignored", () => {
    expect(() => parseArgs(["backup.sbtbackup", "--aply"])).toThrow("Unknown option --aply");
  });
});
