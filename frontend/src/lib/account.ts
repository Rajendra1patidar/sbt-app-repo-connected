/**
 * Who is signed in on this device, and cleanup of per-account data kept in the
 * browser. Used by the offline queue and the offline data snapshot so one
 * person's pending changes / cached data never leak into another login.
 */
import { api } from "./api";

export const DATA_CACHE_KEY = "sbt_data_cache";
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
  try { window.localStorage.removeItem(DATA_CACHE_KEY); } catch { /* ignore */ }
  try { if ("caches" in window) void window.caches.delete(API_CACHE_NAME); } catch { /* ignore */ }
}
