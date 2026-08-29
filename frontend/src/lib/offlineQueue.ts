/**
 * Offline queue for the flows a sales/field person needs to keep working
 * without signal: adding a new Customer, creating an Estimate or Delivery
 * Challan, recording a Payment, and doing a Stock Take. Everything else in
 * the app still requires connectivity (see the PWA setup in vite.config.ts
 * for why the app *shell* still opens offline even though most data actions
 * don't work without a network).
 *
 * Deliberately backed by localStorage rather than IndexedDB — the queue for
 * a single field worker between sync windows is a handful of entries, well
 * inside localStorage's ~5MB limit, and this avoids pulling in an extra
 * dependency (idb/idb-keyval) for what's a small, flat list of JSON blobs.
 *
 * Cross-record references (an offline Estimate for a customer who was also
 * just added offline, a Payment against that same offline Estimate) are
 * handled with a small ID-remap: anything created offline gets a temporary
 * "offline-..." id so the UI has something to work with immediately: see
 * setOfflineIdRemap/resolveOfflineId. Actions always replay in the order
 * they were created, so the customer/estimate a later action depends on has
 * already synced (and remapped to its real id) by the time that later
 * action's handler runs — see offlineSync.ts for where each handler
 * resolves these before calling the real API.
 *
 * Usage:
 *   registerOfflineHandler("challan", (payload) => api.documents("challan").create(payload));
 *   registerOfflineHandler("stockTake", (payload) => api.stockAdjustments.bulk(payload));
 *   ...
 *   enqueueOfflineAction("challan", v);           // when a save fails because we're offline
 *   flushOfflineQueue();                          // called automatically on reconnect + app load
 */

export type OfflineActionType = "challan" | "stockTake" | "payment" | "estimate" | "customer";

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  createdAt: string;
}

const STORAGE_KEY = "sbt_offline_queue";

function readQueue(): OfflineAction[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineAction[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage full or unavailable (e.g. private browsing on some
    // browsers) — nothing useful to do here; the in-memory save attempt
    // that called enqueue() will just surface its own error to the user.
  }
}

type Listener = (queue: OfflineAction[]) => void;
const listeners = new Set<Listener>();

function notify() {
  const queue = readQueue();
  for (const l of listeners) l(queue);
}

/** Subscribe to queue changes (for a "N pending" badge). Returns an unsubscribe fn. */
export function subscribeOfflineQueue(listener: Listener) {
  listeners.add(listener);
  listener(readQueue());
  return () => {
    listeners.delete(listener);
  };
}

export function getOfflineQueue(): OfflineAction[] {
  return readQueue();
}

export function offlineQueueCount(): number {
  return readQueue().length;
}

export function enqueueOfflineAction(type: OfflineActionType, payload: any): OfflineAction {
  const action: OfflineAction = {
    id: (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  const queue = readQueue();
  queue.push(action);
  writeQueue(queue);
  notify();
  return action;
}

function removeFromQueue(id: string) {
  const queue = readQueue().filter((a) => a.id !== id);
  writeQueue(queue);
  notify();
}

// ---- ID remap: temp "offline-..." ids -> real server ids ----
// Populated as each offline-created record actually syncs (see offlineSync.ts).
// Persisted (not just in-memory) so it survives a page reload mid-sync, and
// so a record created in an earlier session that hasn't synced yet still
// resolves correctly once it finally does.
const REMAP_KEY = "sbt_offline_id_remap";

function readRemap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(REMAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeRemap(map: Record<string, string>) {
  try {
    window.localStorage.setItem(REMAP_KEY, JSON.stringify(map));
  } catch {
    /* best-effort, same as writeQueue */
  }
}

/** Call once a queued action's real record comes back from the server. */
export function setOfflineIdRemap(tempId: string, realId: string) {
  const map = readRemap();
  map[tempId] = realId;
  writeRemap(map);
}

/**
 * Resolves a possibly-temporary id to its real one. Returns the input
 * unchanged if it isn't an "offline-..." id, or if it is but hasn't been
 * remapped yet (caller decides how to handle that — see offlineSync.ts,
 * which treats an still-unresolved id as "this action's dependency hasn't
 * synced yet" and fails the action rather than sending a bogus id to the API).
 */
export function resolveOfflineId(id: string | undefined | null): string | undefined {
  if (!id || !id.startsWith("offline-")) return id ?? undefined;
  const map = readRemap();
  return map[id] || id;
}

/** True if this id is still an unresolved offline placeholder. */
export function isUnresolvedOfflineId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("offline-") && !readRemap()[id];
}

type Handler = (payload: any) => Promise<void>;
const handlers: Partial<Record<OfflineActionType, Handler>> = {};

/** Called once at store setup — tells the queue how to actually replay each action type. */
export function registerOfflineHandler(type: OfflineActionType, handler: Handler) {
  handlers[type] = handler;
}

let flushing = false;

/**
 * Replays every queued action in the order it was created. Stops at the
 * first action that fails because we're still offline (ApiError status 0 —
 * see lib/api.ts) so the rest stay queued in order for the next attempt.
 * An action that fails for any other reason (e.g. the server now rejects it
 * as invalid) is dropped rather than retried forever, and reported via
 * onProgress so the caller can tell the user it didn't make it.
 *
 * This function only knows how to replay actions (via registerOfflineHandler)
 * — it doesn't know about the rest of the app's data. See lib/offlineSync.ts
 * for what actually calls this (on reconnect + app load) and refreshes the
 * app's data afterward.
 */
export async function flushOfflineQueue(onProgress?: (result: { action: OfflineAction; ok: boolean; error?: any }) => void) {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    for (const action of readQueue()) {
      const handler = handlers[action.type];
      if (!handler) continue; // handler not registered yet (e.g. store still initializing) — try again next flush
      try {
        await handler(action.payload);
        removeFromQueue(action.id);
        onProgress?.({ action, ok: true });
      } catch (err: any) {
        if (err?.status === 0) {
          break; // still offline — leave this and everything after it queued
        }
        removeFromQueue(action.id);
        onProgress?.({ action, ok: false, error: err });
      }
    }
  } finally {
    flushing = false;
  }
}
