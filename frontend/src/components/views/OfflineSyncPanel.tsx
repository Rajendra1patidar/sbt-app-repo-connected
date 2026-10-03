import React, { useEffect, useState } from "react";
import { CloudOff, RefreshCw, ChevronDown, AlertTriangle, X } from "lucide-react";
import {
  subscribeOfflineQueue, subscribeOfflineFailed, cancelQueuedAction, discardFailedAction, retryFailedAction,
  type OfflineAction, type FailedAction,
} from "../../lib/offlineQueue";
import { triggerOfflineSync } from "../../lib/offlineSync";
import { useAppStore } from "../../store/useAppStore";
import { fmtMoney } from "../../lib/format";

/**
 * "Waiting to sync" — everything done offline that hasn't reached the server
 * yet (new estimates, edits, payments, returns, customers...), with a
 * Sync-now button, plus anything the server rejected so it can be retried or
 * discarded instead of silently disappearing. Renders nothing when there's
 * nothing to show.
 */
function describe(a: OfflineAction): string {
  const st = useAppStore.getState();
  const cur = st.settings?.currency;
  const customer = (id?: string) => st.customers.find((c: any) => c.id === id)?.name || "a customer";
  const estNo = (id?: string) => {
    const e = st.estimates.find((x: any) => x.id === id);
    return e && e.number && e.number !== "Pending sync" ? e.number : `an unsynced estimate for ${customer(e?.customerId)}`;
  };
  switch (a.type) {
    case "estimate": return `New estimate for ${customer(a.payload?.payload?.customerId)} · ${fmtMoney(a.payload?.payload?.total, cur)}`;
    case "estimateEdit": return `Edit to ${estNo(a.payload?.id)}`;
    case "payment": return a.payload?.invoiceId
      ? `Payment ${fmtMoney(a.payload?.amount, cur)} on ${estNo(a.payload.invoiceId)}`
      : `Advance payment ${fmtMoney(a.payload?.amount, cur)} from ${customer(a.payload?.customerId)}`;
    case "estimateReturn": return `Return (${(a.payload?.lines || []).length} item${(a.payload?.lines || []).length === 1 ? "" : "s"}) on ${estNo(a.payload?.docId)}`;
    case "customer": return `New customer ${a.payload?.payload?.name || ""}`.trim();
    case "challan": return "Delivery challan";
    case "stockTake": return `Stock take (${(a.payload?.lines || []).length} items)`;
    default: return a.type;
  }
}

export function OfflineSyncPanel() {
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [failed, setFailed] = useState<FailedAction[]>([]);
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  useAppStore((s) => s.estimates); // re-render labels as the lists change
  const showToast = useAppStore((s) => s.showToast);
  const fetchAll = useAppStore((s) => s.fetchAll);

  useEffect(() => subscribeOfflineQueue(setQueue), []);
  useEffect(() => subscribeOfflineFailed(setFailed), []);

  if (queue.length === 0 && failed.length === 0) return null;

  const sync = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showToast("No connection yet — your changes are saved here and will sync when you're back online.", { duration: 4000 });
      return;
    }
    setSyncing(true);
    try { await triggerOfflineSync(); } finally { setSyncing(false); }
  };

  const cancel = (a: OfflineAction) => {
    const extra = a.type === "estimate" || a.type === "customer" ? "\n\nAnything queued for it (payments, returns, edits) is removed too." : "";
    if (!window.confirm(`Remove this unsynced change?\n\n${describe(a)}${extra}`)) return;
    cancelQueuedAction(a.id);
    fetchAll(); // rebuild the lists from the last synced data + what's still queued
  };

  const retry = async (f: FailedAction, overwrite = false) => {
    if (overwrite && !window.confirm("Apply your version anyway? This overwrites whatever was changed on this estimate elsewhere.")) return;
    if (retryFailedAction(f.action.id, { overwrite })) await sync();
  };

  const discard = (f: FailedAction) => {
    if (!window.confirm(`Discard this change for good?\n\n${describe(f.action)}`)) return;
    discardFailedAction(f.action.id);
    fetchAll();
  };

  return (
    <div className="mb-3 overflow-hidden rounded-2xl bg-warn-50 text-warn-700">
      <div className="flex items-center gap-2 px-4 py-3">
        <CloudOff size={16} className="shrink-0" />
        <button className="flex-1 text-left text-sm font-semibold" onClick={() => setOpen((o) => !o)}>
          {queue.length > 0 ? `${queue.length} change${queue.length === 1 ? "" : "s"} waiting to sync` : "Some changes need attention"}
          {failed.length > 0 && queue.length > 0 ? ` · ${failed.length} need attention` : ""}
          <ChevronDown size={14} className={`ml-1 inline transition ${open ? "rotate-180" : ""}`} />
        </button>
        {queue.length > 0 && (
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1 rounded-pill bg-card px-3 py-1.5 text-xs font-semibold text-warn-700 disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>

      {(open || failed.length > 0) && (
        <div className="space-y-1.5 border-t border-warn-700/10 px-4 pb-3 pt-2">
          {failed.map((f) => (
            <div key={f.action.id} className="rounded-xl bg-bad-50 px-3 py-2 text-bad-700">
              <p className="flex items-start gap-1.5 text-xs font-semibold"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {describe(f.action)}</p>
              <p className="mt-0.5 text-xs">{f.message}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {f.status === 409 && f.action.type === "estimateEdit" && (
                  <button onClick={() => retry(f, true)} className="rounded-pill bg-card px-2.5 py-1 text-xs font-semibold">Apply my version anyway</button>
                )}
                {f.status !== 409 && <button onClick={() => retry(f)} className="rounded-pill bg-card px-2.5 py-1 text-xs font-semibold">Retry</button>}
                <button onClick={() => discard(f)} className="rounded-pill px-2.5 py-1 text-xs font-semibold underline">Discard</button>
              </div>
            </div>
          ))}
          {open && queue.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1">{describe(a)}</span>
              <button onClick={() => cancel(a)} aria-label="Remove this unsynced change" className="rounded-full p-1 text-warn-700/70"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
