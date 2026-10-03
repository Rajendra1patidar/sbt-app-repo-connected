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

import { currentAccountId, DATA_CACHE_KEY } from "./account";

export type OfflineActionType = "challan" | "stockTake" | "payment" | "estimate" | "customer" | "estimateEdit" | "estimateReturn";

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  createdAt: string;
  /** Account that created it — only that account's login will sync it. */
  accountId?: string;
  /** The on-screen stand-in record, so it can be re-shown after a refresh. */
  placeholder?: any;
  /** Times a flush hit a (non-connectivity) server error for this action. */
  attempts?: number;
}

const STORAGE_KEY = "sbt_offline_queue";

function readAll(): OfflineAction[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Only the signed-in account's actions (older entries with no account tag count as theirs). */
function readQueue(): OfflineAction[] {
  const me = currentAccountId();
  if (!me) return [];
  return readAll().filter((a) => !a.accountId || a.accountId === me);
}

/** Returns false if the browser refused the write (storage full / unavailable). */
function writeQueue(queue: OfflineAction[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
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

/**
 * Returns the queued action, or null if it could NOT be saved (storage full).
 * Callers must check — a null means the work is not safely stored.
 */
export function enqueueOfflineAction(type: OfflineActionType, payload: any, placeholder?: any): OfflineAction | null {
  const action: OfflineAction = {
    id: (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    accountId: currentAccountId(),
    placeholder,
  };
  const queue = readAll();
  queue.push(action);
  if (!writeQueue(queue)) {
    // The offline data snapshot is rebuildable and shares the same ~5MB
    // quota — sacrifice it before sacrificing the user's unsynced work.
    try { window.localStorage.removeItem(DATA_CACHE_KEY); } catch { /* ignore */ }
    if (!writeQueue(queue)) return null;
  }
  notify();
  return action;
}

function removeFromQueue(id: string) {
  writeQueue(readAll().filter((a) => a.id !== id));
  notify();
}

// ---- Failed list: actions the server genuinely rejected ----
// Kept (not silently dropped) so the user can see what didn't go through and
// retry or discard it from the Estimates screen's "waiting to sync" panel.
const FAILED_KEY = "sbt_offline_failed";
const MAX_FAILED = 50;

export interface FailedAction {
  action: OfflineAction;
  message: string;
  status?: number;
  failedAt: string;
}

function readFailedAll(): FailedAction[] {
  try {
    const raw = window.localStorage.getItem(FAILED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFailed(list: FailedAction[]) {
  try {
    window.localStorage.setItem(FAILED_KEY, JSON.stringify(list.slice(-MAX_FAILED)));
  } catch { /* best effort */ }
}

const failedListeners = new Set<(list: FailedAction[]) => void>();

export function getFailedActions(): FailedAction[] {
  const me = currentAccountId();
  if (!me) return [];
  return readFailedAll().filter((f) => !f.action.accountId || f.action.accountId === me);
}

function notifyFailed() {
  const list = getFailedActions();
  for (const l of failedListeners) l(list);
}

export function subscribeOfflineFailed(listener: (list: FailedAction[]) => void) {
  failedListeners.add(listener);
  listener(getFailedActions());
  return () => { failedListeners.delete(listener); };
}

function addFailed(action: OfflineAction, err: any) {
  writeFailed([...readFailedAll(), { action, message: err?.message || "The server rejected this change.", status: err?.status, failedAt: new Date().toISOString() }]);
  notifyFailed();
}

export function discardFailedAction(id: string) {
  writeFailed(readFailedAll().filter((f) => f.action.id !== id));
  notifyFailed();
}

/** Puts a failed action back at the end of the queue. `overwrite` (edits only) drops the "changed elsewhere" check. */
export function retryFailedAction(id: string, opts?: { overwrite?: boolean }): boolean {
  const entry = readFailedAll().find((f) => f.action.id === id);
  if (!entry) return false;
  let action: OfflineAction = { ...entry.action, attempts: 0 };
  if (opts?.overwrite && action.type === "estimateEdit") {
    const { expectedUpdatedAt, ...rest } = action.payload?.payload || {};
    action = { ...action, payload: { ...action.payload, payload: rest } };
  }
  if (!writeQueue([...readAll(), action])) return false;
  writeFailed(readFailedAll().filter((f) => f.action.id !== id));
  notify();
  notifyFailed();
  return true;
}

// ---- Queue editing helpers ----
export function findQueuedAction(pred: (a: OfflineAction) => boolean): OfflineAction | undefined {
  return readQueue().find(pred);
}

export function updateQueuedAction(id: string, patch: Partial<OfflineAction>) {
  writeQueue(readAll().map((a) => (a.id === id ? { ...a, ...patch } : a)));
  notify();
}

// What each action needs to exist first (refs) and what temp id it creates (provides).
function refsOf(a: OfflineAction): (string | undefined)[] {
  switch (a.type) {
    case "payment": return [a.payload?.invoiceId, a.payload?.customerId];
    case "estimate": return [a.payload?.payload?.customerId];
    case "estimateEdit": return [a.payload?.id, a.payload?.payload?.customerId];
    case "estimateReturn": return [a.payload?.docId];
    default: return [];
  }
}
function providesOf(a: OfflineAction): (string | undefined)[] {
  if (a.type === "estimate") return [a.payload?.placeholderId];
  if (a.type === "customer") return [a.payload?.tempId];
  return [];
}

/**
 * Removes a queued action AND everything queued that depends on what it would
 * have created (e.g. cancelling an unsynced estimate also cancels its queued
 * payments/returns). Returns the removed ids. Callers should refetch/rebuild
 * the on-screen lists afterwards.
 */
export function cancelQueuedAction(id: string): string[] {
  const queue = readQueue();
  const target = queue.find((a) => a.id === id);
  if (!target) return [];
  const ids = new Set<string>([id]);
  const provided = new Set<string>(providesOf(target).filter(Boolean) as string[]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of queue) {
      if (ids.has(a.id)) continue;
      if (refsOf(a).some((r) => r && provided.has(r))) {
        ids.add(a.id);
        providesOf(a).forEach((p) => p && provided.add(p));
        changed = true;
      }
    }
  }
  writeQueue(readAll().filter((a) => !ids.has(a.id)));
  notify();
  return [...ids];
}

function setAttempts(id: string, attempts: number) {
  writeQueue(readAll().map((a) => (a.id === id ? { ...a, attempts } : a)));
}

// Server answers that mean "not right now", not "this action is invalid":
// no connection, login expired, timeout, rate limit, and the 502/503/504 a
// sleeping Render instance returns while it boots. These keep the action
// queued; anything else 4xx is a real rejection.
const RETRY_LATER = new Set([0, 401, 408, 425, 429, 502, 503, 504]);
const MAX_SERVER_ERROR_ATTEMPTS = 5;

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
 * first action that fails for a temporary reason (offline, expired login,
 * rate limit, server waking up — see RETRY_LATER) so the rest stay queued in
 * order for the next attempt. An action the server genuinely rejects (e.g.
 * 400 invalid) is dropped rather than retried forever, and reported via
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
  if (!currentAccountId()) return; // signed out (or login expired) — nothing can sync until they sign back in
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
        const status = err?.status;
        if (RETRY_LATER.has(status)) {
          break; // not a rejection — keep this and everything after it queued, in order
        }
        if (typeof status === "number" && status >= 500) {
          // Some other server error: could be a passing glitch or a permanent
          // bug. Retry a few flushes, then give up so it can't block the queue forever.
          const attempts = (action.attempts || 0) + 1;
          if (attempts < MAX_SERVER_ERROR_ATTEMPTS) {
            setAttempts(action.id, attempts);
            break;
          }
        }
        removeFromQueue(action.id);
        addFailed(action, err);
        onProgress?.({ action, ok: false, error: err });
      }
    }
  } finally {
    flushing = false;
  }
}
