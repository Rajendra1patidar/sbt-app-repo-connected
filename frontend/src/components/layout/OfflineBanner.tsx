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
 * the last time the app opened offline. Invisible the rest of the time.
 */
export function OfflineBanner() {
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const offlineDataAsOf = useAppStore((s) => s.offlineDataAsOf);

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

  if (online && queue.length === 0 && !offlineDataAsOf) return null;

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
    message = `You're offline — showing data as of ${asOfLabel}. New customers, estimates, challans, payments, and stock takes are still saved.`;
  } else if (!online) {
    message = queue.length > 0
      ? `You're offline — ${queue.length} change${queue.length === 1 ? "" : "s"} saved, will sync automatically`
      : "You're offline — new customers, estimates, challans, payments, and stock takes are still saved";
  } else if (queue.length > 0) {
    message = `${queue.length} change${queue.length === 1 ? "" : "s"} waiting to sync`;
  } else {
    message = `Back online — refreshing data last synced ${asOfLabel}`;
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold ${online ? "bg-warn-50 text-warn-700" : "bg-bad-50 text-bad-700"}`}>
      <WifiOff size={14} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {online && (queue.length > 0 || offlineDataAsOf) && (
        <button
          onClick={handleRetry}
          disabled={syncing}
          className="inline-flex items-center gap-1 rounded-pill bg-card px-2.5 py-1 text-warn-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> Sync now
        </button>
      )}
    </div>
  );
}
