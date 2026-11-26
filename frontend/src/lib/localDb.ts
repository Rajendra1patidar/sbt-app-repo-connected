/**
 * A small key-value store for data this device keeps for the app (the saved copy of your data,
 * and the work waiting to sync). It uses the browser's IndexedDB, which has far more room than
 * localStorage (about 5 MB, shared with everything else and easy to fill), and falls back to
 * localStorage in a browser where IndexedDB is not available.
 *
 * Values are stored as TEXT (JSON), exactly what localStorage used to hold. That is deliberate:
 *   - moving old data across is a plain copy that can be checked by comparing the two strings;
 *   - there are no surprises from IndexedDB's own object-copying rules (it throws on a function
 *     where JSON would quietly drop it).
 *
 * The rules this file keeps, because the queue of unsynced work will live here:
 *   1. ONE store per page load. The first call decides IndexedDB or localStorage and sticks with
 *      it, so a page never writes half its data to each.
 *   2. Operations run one at a time, in the order they were asked for (set, then delete, means deleted).
 *   3. `update` reads and writes inside ONE IndexedDB transaction, and transactions on the same
 *      store never overlap, even across two open tabs. So two tabs changing the same list can't
 *      overwrite each other with stale copies.
 *   4. A write counts as done only once the transaction has COMMITTED.
 *   5. Old localStorage data is imported (copied, checked, and only then deleted) every time the
 *      app starts, so anything an older open tab wrote late is picked up on the next start.
 */

const DB_NAME = "sbt-offline";
const STORE = "kv";

/** Each key, and the localStorage name the same data used before this existed. */
export const KV_KEYS = {
  dataCache: "sbt_data_cache",
  queue: "sbt_offline_queue",
  failed: "sbt_offline_failed",
  idRemap: "sbt_offline_id_remap",
} as const;
export type KvKey = keyof typeof KV_KEYS;

interface Backend {
  name: "indexeddb" | "localstorage";
  get(key: KvKey): Promise<string | null>;
  set(key: KvKey, text: string, opts?: { durable?: boolean }): Promise<void>;
  update(key: KvKey, fn: (current: string | null) => string, opts?: { durable?: boolean }): Promise<string>;
  del(key: KvKey): Promise<void>;
}

// ---- IndexedDB ----

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading, or the browser closing the connection: let go, reopen on next use.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error("Could not open the database"));
    req.onblocked = () => reject(new Error("Opening the database was blocked"));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function txOptions(durable?: boolean): any {
  // "strict" waits for the data to reach the disk (used for the queue of unsynced work).
  // Browsers that don't know the option ignore it.
  return durable ? { durability: "strict" } : undefined;
}

const idbBackend: Backend = {
  name: "indexeddb",

  async get(key) {
    const db = await openDb();
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      tx.oncomplete = () => resolve(typeof req.result === "string" ? req.result : null);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Read failed"));
    });
  },

  async set(key, text, opts) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = (db as any).transaction(STORE, "readwrite", txOptions(opts?.durable)) as IDBTransaction;
      tx.objectStore(STORE).put(text, key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Write failed"));
    });
  },

  async update(key, fn, opts) {
    const db = await openDb();
    return new Promise<string>((resolve, reject) => {
      const tx = (db as any).transaction(STORE, "readwrite", txOptions(opts?.durable)) as IDBTransaction;
      const store = tx.objectStore(STORE);
      let next = "";
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          next = fn(typeof read.result === "string" ? read.result : null);
          store.put(next, key); // same transaction as the read: nobody can slip in between
        } catch (e) {
          try { tx.abort(); } catch { /* already finished */ }
          reject(e);
        }
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Write failed"));
    });
  },

  async del(key) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Delete failed"));
    });
  },
};

// ---- localStorage fallback: exactly how the app stored these before ----

const lsBackend: Backend = {
  name: "localstorage",
  async get(key) {
    return window.localStorage.getItem(KV_KEYS[key]);
  },
  async set(key, text) {
    window.localStorage.setItem(KV_KEYS[key], text); // throws when full: the caller sees the failure
  },
  async update(key, fn) {
    const next = fn(window.localStorage.getItem(KV_KEYS[key]));
    window.localStorage.setItem(KV_KEYS[key], next);
    return next;
  },
  async del(key) {
    window.localStorage.removeItem(KV_KEYS[key]);
  },
};

// ---- choosing the store, and running operations in order ----

let chosen: Promise<Backend> | null = null;

/** Decided once per page load. IndexedDB if it opens, otherwise localStorage. */
function backend(): Promise<Backend> {
  if (!chosen) {
    chosen = openDb().then(() => idbBackend, () => lsBackend);
  }
  return chosen;
}

let tail: Promise<unknown> = Promise.resolve();

/** Runs `op` after every earlier operation has finished (whether it worked or not). */
function inOrder<T>(op: (b: Backend) => Promise<T>): Promise<T> {
  const run = tail.then(() => backend()).then(op);
  tail = run.catch(() => undefined);
  return run;
}

/** Which store this page is using (for the notes and for tests). */
export function activeStore(): Promise<"indexeddb" | "localstorage"> {
  return backend().then((b) => b.name);
}

/** Start opening the database early so the first read doesn't wait for it. Never throws. */
export function warmUpLocalDb() {
  void backend();
}

export const kvGet = (key: KvKey): Promise<string | null> => inOrder((b) => b.get(key));
export const kvSet = (key: KvKey, text: string, opts?: { durable?: boolean }): Promise<void> => inOrder((b) => b.set(key, text, opts));
export const kvUpdate = (key: KvKey, fn: (current: string | null) => string, opts?: { durable?: boolean }): Promise<string> =>
  inOrder((b) => b.update(key, fn, opts));

/** Deletes the value, and any old localStorage copy of it too. */
export function kvDelete(key: KvKey): Promise<void> {
  return inOrder(async (b) => {
    await b.del(key);
    try { window.localStorage.removeItem(KV_KEYS[key]); } catch { /* ignore */ }
  });
}

// ---- moving old localStorage data across ----

export type ImportResult =
  | "nothing-to-import" // no old copy found (or this page is using localStorage anyway)
  | "imported" // copied, checked, and the old copy deleted
  | "kept-old-copy" // could not confirm the copy, so the old data was left exactly where it was
  | "unreadable"; // the old data isn't valid JSON: left alone

/**
 * Copies the old localStorage value for `key` into IndexedDB, checks the copy by reading it back,
 * and ONLY THEN deletes the old one. `merge` decides what to store when IndexedDB already has a
 * value (it gets the old text and what is there now, and returns the text to keep). Safe to run on
 * every start: with nothing old to import it does nothing, and a failure leaves the old data intact.
 */
export function importLegacy(key: KvKey, merge: (legacyText: string, currentText: string | null) => string): Promise<ImportResult> {
  return inOrder(async (b): Promise<ImportResult> => {
    if (b.name !== "indexeddb") return "nothing-to-import";

    let legacy: string | null = null;
    try { legacy = window.localStorage.getItem(KV_KEYS[key]); } catch { return "nothing-to-import"; }
    if (legacy === null) return "nothing-to-import";

    try { JSON.parse(legacy); } catch {
      console.warn(`localDb: old "${KV_KEYS[key]}" is not valid JSON, leaving it alone`);
      return "unreadable";
    }

    try {
      const written = await b.update(key, (current) => merge(legacy as string, current), { durable: true });
      const readBack = await b.get(key);
      if (readBack !== written) throw new Error("the copy did not read back the same");
    } catch (err: any) {
      console.warn(`localDb: could not move "${KV_KEYS[key]}" to IndexedDB, keeping the old copy:`, err?.message || err);
      return "kept-old-copy";
    }

    // Safe to delete only now: the data is in IndexedDB and has been read back.
    try { window.localStorage.removeItem(KV_KEYS[key]); } catch { /* ignore */ }
    return "imported";
  });
}
