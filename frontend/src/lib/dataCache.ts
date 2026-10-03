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
 */

import { DATA_CACHE_KEY as CACHE_KEY, currentAccountId } from "./account";

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

export function saveDataCache(state: Record<string, any>) {
  try {
    const data: Record<string, any> = {};
    for (const key of CACHED_FIELDS) data[key] = state[key];
    const snapshot: DataCacheSnapshot = { savedAt: new Date().toISOString(), accountId: currentAccountId(), data };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or storage unavailable — the app still works online;
    // it just won't have an offline fallback this session. Not worth
    // surfacing to the user over what is itself a convenience feature.
  }
}

export function loadDataCache(): DataCacheSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const snap: DataCacheSnapshot = JSON.parse(raw);
    // Never show one account's cached data to a different login.
    if (snap.accountId && snap.accountId !== currentAccountId()) return null;
    return snap;
  } catch {
    return null;
  }
}
