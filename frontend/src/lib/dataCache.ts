/**
 * A snapshot of the last successful fetchAll(), so opening the app with no
 * signal shows the last-synced data instead of the hard error screen (see
 * InvoiceApp.tsx's `loadError` block). This is deliberately read-only and
 * best-effort:
 *   - No write ever goes through this cache — the offline queue
 *     (offlineQueue.ts / offlineSync.ts) is the only thing that lets you
 *     change data while offline, and only for Challans, Payments, and
 *     Stock Takes.
 *   - It's a full-state snapshot, not a sync engine — no conflict
 *     resolution, no partial updates. It exists purely so a screen the
 *     user already had synced isn't blank/erroring just because they
 *     opened the app (or refreshed) while offline.
 *
 * It is kept in IndexedDB (lib/localDb.ts), not localStorage: the snapshot can be several
 * megabytes, and in localStorage it competed for the same ~5 MB as the queue of unsynced
 * work. A copy saved by an older version is moved across the first time the app starts.
 * Because IndexedDB is asynchronous, saving and loading return promises.
 */

import { currentAccountId } from "./account";
import { kvGet, kvSet, importLegacy, warmUpLocalDb } from "./localDb";

// Keep this to the data views actually render when offline — leaving out
// reorderSuggestions/notifications/deadStock (derived, cheap to regenerate,
// and not worth the extra bytes in an already-large blob).
const CACHED_FIELDS = [
  "settings", "customers", "items", "orders", "estimates", "challans",
  "expenses", "payments", "labourSessions", "labourWorkers", "contractors", "scoreRules",
  "vendors", "purchases", "godowns", "role",
] as const;

export interface DataCacheSnapshot {
  savedAt: string;
  accountId?: string;
  data: Record<string, any>;
}

// Signed in already (the usual start): open the database now, so by the time the first load asks
// for the saved copy it is not still waiting for the database to open.
if (typeof window !== "undefined" && currentAccountId()) warmUpLocalDb();

// A copy saved by an older version lives in localStorage. Move it across once per start. When both
// places have one, keep the newer. A failed move leaves the old copy exactly where it was.
let imported: Promise<unknown> | null = null;
function ensureImported() {
  if (!imported) {
    imported = importLegacy("dataCache", (legacyText, currentText) => {
      if (!currentText) return legacyText;
      try {
        const legacy = JSON.parse(legacyText);
        const current = JSON.parse(currentText);
        return String(current?.savedAt || "") >= String(legacy?.savedAt || "") ? currentText : legacyText;
      } catch {
        return legacyText;
      }
    }).catch(() => undefined);
  }
  return imported;
}

// Note on order: both functions queue their storage operation straight away, with no await in
// front of it. Operations run in the order they were queued (lib/localDb.ts), so a save that was
// asked for before sign-out is finished BEFORE sign-out's cleanup runs and can't bring the copy back.

export function saveDataCache(state: Record<string, any>): Promise<void> {
  try {
    // Never save a copy that belongs to nobody: if the person signed out while this load was still
    // running, there is no account to tag it with, and an untagged copy would be shown to the next login.
    const accountId = currentAccountId();
    if (!accountId) return Promise.resolve();
    const data: Record<string, any> = {};
    for (const key of CACHED_FIELDS) data[key] = state[key];
    const snapshot: DataCacheSnapshot = { savedAt: new Date().toISOString(), accountId, data };
    const text = JSON.stringify(snapshot);
    void ensureImported(); // queued ahead of the write below (the first time only)
    return kvSet("dataCache", text).catch(() => {
      // Storage full or unavailable — the app still works online;
      // it just won't have an offline fallback this session. Not worth
      // surfacing to the user over what is itself a convenience feature.
    });
  } catch {
    return Promise.resolve();
  }
}

export async function loadDataCache(): Promise<DataCacheSnapshot | null> {
  try {
    void ensureImported(); // queued ahead of the read below (the first time only)
    const raw = await kvGet("dataCache");
    if (!raw) return null;
    const snap: DataCacheSnapshot = JSON.parse(raw);
    if (!snap || typeof snap !== "object" || !snap.data) return null;
    // Never show one account's cached data to a different login (or to one that can't be identified).
    if (!snap.accountId || snap.accountId !== currentAccountId()) return null;
    return snap;
  } catch {
    return null;
  }
}
