/**
 * Who is signed in on this device, and cleanup of per-account data kept in the
 * browser. Used by the offline queue and the offline data snapshot so one
 * person's pending changes / cached data never leak into another login.
 */
import { api } from "./api";
import { kvDelete } from "./localDb";

/** Where an OLDER version kept the saved data copy (localStorage). It now lives in IndexedDB; see lib/localDb.ts. */
export const DATA_CACHE_KEY = "sbt_data_cache";
/** The estimate form auto-saves here so a half-made bill survives a refresh or a dropped connection. */
export const ESTIMATE_DRAFT_KEY = "sbt_estimate_draft_v1";
const API_CACHE_NAME = "sbt-api-get-cache";

/** The account id inside the current login token, or undefined when signed out. */
export function currentAccountId(): string | undefined {
  try {
    const t = api.getToken();
    if (!t) return undefined;
    const part = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).id || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Called on sign-out: wipes the cached copy of the account's data (both our
 * own snapshot and the service worker's cached API responses). The offline
 * queue is deliberately NOT wiped — unsynced work must survive a sign-out or
 * an expired login; it is tagged with its account and only syncs for it.
 */
export function clearPrivateCaches() {
  // Removes the saved copy from IndexedDB and any old localStorage one. It runs in order with the
  // saves, so a save still in flight can't bring the copy back after this.
  void kvDelete("dataCache").catch(() => { /* ignore */ });
  try { window.localStorage.removeItem(ESTIMATE_DRAFT_KEY); } catch { /* ignore */ }
  try { if ("caches" in window) void window.caches.delete(API_CACHE_NAME); } catch { /* ignore */ }
}
