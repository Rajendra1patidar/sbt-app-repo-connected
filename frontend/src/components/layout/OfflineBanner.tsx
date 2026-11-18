import React, { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { subscribeOfflineQueue, type OfflineAction } from "../../lib/offlineQueue";
import { triggerOfflineSync } from "../../lib/offlineSync";
import { useAppStore } from "../../store/useAppStore";

/**
 * Shown whenever there's something to tell a field worker: either the device
 * is currently offline, there are queued Challans/Payments/Stock Takes still
 * waiting to sync (which can briefly outlast the offline period itself,
 * right after reconnecting), or the screen is showing a cached snapshot from
 * the last time the app opened offline, or the (free-plan) server is still
 * waking up after a quiet spell and the saved copy is on screen meanwhile.
 * Invisible the rest of the time.
 */
export function OfflineBanner() {
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const offlineDataAsOf = useAppStore((s) => s.offlineDataAsOf);
  const serverWaking = useAppStore((s) => s.serverWaking);

  useEffect(() => subscribeOfflineQueue(setQueue), []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online && queue.length === 0 && !offlineDataAsOf && !serverWaking) return null;

  const handleRetry = async () => {
    setSyncing(true);
    await triggerOfflineSync();
    setSyncing(false);
  };

  const asOfLabel = offlineDataAsOf
    ? new Date(offlineDataAsOf).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  let message: string;
  if (!online && offlineDataAsOf) {
    message = `You're offline — showing data as of ${asOfLabel}. New estimates (plus edits, payments and returns), customers, challans and stock takes are still saved.`;
  } else if (!online) {
    message = queue.length > 0
      ? `You're offline — ${queue.length} change${queue.length === 1 ? "" : "s"} saved, will sync automatically`
      : "You're offline — new estimates (plus edits, payments and returns), customers, challans and stock takes are still saved";
  } else if (serverWaking) {
    message = `Waking the server, this can take up to a minute. You're seeing your last saved data from ${asOfLabel}.`;
    if (queue.length > 0) message += ` ${queue.length} change${queue.length === 1 ? "" : "s"} will sync once it's up.`;
  } else if (queue.length > 0) {
    message = `${queue.length} change${queue.length === 1 ? "" : "s"} waiting to sync`;
  } else {
    message = `Back online — refreshing data last synced ${asOfLabel}`;
  }

  return (
    // Sticks to the top of the scrolling area so the message stays visible on every screen. The top padding
    // keeps it clear of the phone's status bar when the app is installed (it is 0 in a normal browser tab).
    <div
      role="status"
      aria-live="polite"
      style={{ paddingTop: "max(8px, env(safe-area-inset-top, 0px))" }}
      className={`sticky top-0 z-30 flex items-center gap-2 px-4 pb-2 text-xs font-semibold ${online ? "bg-warn-50 text-warn-700" : "bg-bad-50 text-bad-700"}`}
    >
      {online && serverWaking ? <RefreshCw size={14} aria-hidden="true" className="shrink-0 animate-spin" /> : <WifiOff size={14} aria-hidden="true" className="shrink-0" />}
      <span className="flex-1">{message}</span>
      {online && !serverWaking && (queue.length > 0 || offlineDataAsOf) && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={syncing}
          className="-my-1.5 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-pill bg-card px-3 text-warn-700 disabled:opacity-50"
        >
          <RefreshCw size={12} aria-hidden="true" className={syncing ? "animate-spin" : ""} /> Sync now
        </button>
      )}
    </div>
  );
}
