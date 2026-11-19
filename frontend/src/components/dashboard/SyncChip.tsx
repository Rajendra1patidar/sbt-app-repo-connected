import { useEffect, useState } from "react";
import { subscribeOfflineQueue, type OfflineAction } from "../../lib/offlineQueue";
import { triggerOfflineSync } from "../../lib/offlineSync";
import { useAppStore } from "../../store/useAppStore";
import { StatusChip, cx } from "../ui/kit";

/** Synced · Offline · "3 to sync" — the one honest word about whether your work is safe. */
export function SyncChip() {
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const offlineDataAsOf = useAppStore((s) => s.offlineDataAsOf);

  useEffect(() => subscribeOfflineQueue(setQueue), []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const synced = online && queue.length === 0 && !offlineDataAsOf;
  const label = syncing ? "Syncing…" : !online ? "Offline" : queue.length > 0 ? `${queue.length} to sync` : offlineDataAsOf ? "Refreshing" : "Synced";
  const color = synced ? "text-good-600" : !online ? "text-bad-600" : "text-warn-700";

  const retry = async () => {
    if (synced || syncing || !online) return;
    setSyncing(true);
    await triggerOfflineSync();
    setSyncing(false);
  };

  return (
    <button type="button" onClick={retry} aria-live="polite" aria-label={`Sync status: ${label}`} className="active:opacity-60">
      <StatusChip tone="neutral" className={cx("border border-line !bg-card", color)}>{label}</StatusChip>
    </button>
  );
}
