import { api } from "./api";
import { useAppStore } from "../store/useAppStore";
import { flushOfflineQueue, registerOfflineHandler, resolveOfflineId, isUnresolvedOfflineId, setOfflineIdRemap } from "./offlineQueue";

// Thrown when an action depends on another offline-created record (a
// customer, an estimate) that hasn't synced yet. Actions always replay in
// the order they were created, so in practice this shouldn't happen — the
// dependency was queued first and should already have synced. It's a real
// (non-connectivity) failure if it ever does: flushOfflineQueue drops the
// action and reports it via onProgress rather than retrying forever.
class UnresolvedDependencyError extends Error {}

// How to actually replay each queued action type — kept here (rather than in
// offlineQueue.ts) so that file stays a generic, app-agnostic queue and this
// one owns the SBT-specific wiring to the API + store.
registerOfflineHandler("challan", async (payload) => {
  await api.documents("challan").create(payload);
});

registerOfflineHandler("stockTake", async (payload) => {
  await api.stockAdjustments.bulk(payload);
});

// A brand-new customer added while offline (either from the Customers
// screen or the "+ New customer" quick-add inside the estimate form) — see
// saveCustomer/quickAddCustomer's offline branches in useAppStore.ts. Synced
// first, ahead of anything that references it, since the queue always
// replays in creation order.
registerOfflineHandler("customer", async (queued: any) => {
  const { payload, tempId } = queued;
  const doc = await api.customers.create(payload);
  setOfflineIdRemap(tempId, doc.id);
  useAppStore.setState((state) => ({
    customers: [doc, ...state.customers.filter((c: any) => c.id !== tempId)],
  }));
});

registerOfflineHandler("payment", async (payload) => {
  if (isUnresolvedOfflineId(payload.customerId) || isUnresolvedOfflineId(payload.invoiceId)) {
    throw new UnresolvedDependencyError("This payment's customer or estimate hasn't synced yet.");
  }
  await api.payments.create({
    ...payload,
    customerId: resolveOfflineId(payload.customerId),
    invoiceId: resolveOfflineId(payload.invoiceId),
  });
});

// Estimates are the flow here with the most interdependencies (idempotency
// key, an optional partial-payment sub-call, rolled-estimate settlement,
// server-side stock deduction, and possibly a customer that was *also* just
// added offline) — everything needed to redo all of that is captured in the
// queued payload at save time; see saveDocument's offline branch in
// useAppStore.ts for what gets queued and why edits (not just new
// estimates) are deliberately excluded from this path.
registerOfflineHandler("estimate", async (queued: any) => {
  const { payload, idempotencyKey, placeholderId, partialAmountPaid, date } = queued;
  if (isUnresolvedOfflineId(payload.customerId)) {
    throw new UnresolvedDependencyError("This estimate's customer hasn't synced yet.");
  }
  const finalPayload = { ...payload, customerId: resolveOfflineId(payload.customerId) };
  const { doc } = await api.documents("estimate").create(finalPayload, idempotencyKey);
  // A payment queued against this estimate before it synced (rare, but
  // possible if a partial collection was recorded separately right after
  // creating it) references placeholderId as its invoiceId — remap it to
  // the real document, same as a customer's temp id.
  setOfflineIdRemap(placeholderId, doc.id);
  useAppStore.setState((state) => ({
    estimates: [doc, ...state.estimates.filter((e: any) => e.id !== placeholderId)],
  }));

  if (partialAmountPaid && Number(partialAmountPaid) > 0) {
    try {
      const { payment, invoice } = await api.payments.create({
        customerId: finalPayload.customerId, invoiceId: doc.id, amount: Number(partialAmountPaid), date, method: "Cash",
      });
      useAppStore.setState((state) => ({
        payments: [payment, ...state.payments],
        estimates: invoice ? state.estimates.map((e: any) => (e.id === invoice.id ? invoice : e)) : state.estimates,
      }));
    } catch {
      // Same "best-effort" partial-payment handling as the online path —
      // the estimate itself synced fine either way; the shortfall shows up
      // once the balance-due numbers refresh after this sync completes.
    }
  }
});

let initialized = false;

/**
 * Call once on app start (see InvoiceApp.tsx). Syncs immediately in case
 * actions were queued last session and the tab is reopened already online,
 * and again automatically every time the browser regains connectivity.
 */
export function initOfflineSync() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("online", () => { triggerOfflineSync(); });
  triggerOfflineSync();
}

const TYPE_LABELS: Record<string, string> = {
  challan: "delivery challan",
  payment: "payment",
  estimate: "estimate",
  customer: "customer",
  stockTake: "stock take",
};

/** Also callable directly — e.g. a manual "Retry sync" tap in the offline banner. */
export function triggerOfflineSync() {
  let syncedAny = false;
  return flushOfflineQueue(({ ok, action, error }) => {
    if (ok) {
      syncedAny = true;
    } else {
      const label = TYPE_LABELS[action.type] || action.type;
      const detail = error instanceof UnresolvedDependencyError
        ? " — its customer or estimate didn't sync, so it needs to be re-entered."
        : " — it may need to be re-entered.";
      useAppStore.getState().showToast(`Couldn't sync an offline ${label}${detail}`);
    }
  }).then(() => {
    const { offlineDataAsOf } = useAppStore.getState();
    if (syncedAny) {
      // Optimistic local state (the placeholder challan, the adjusted stock
      // numbers) was a best guess made without the server — now that the
      // real writes have gone through, refetch everything so numbers match
      // what actually landed (e.g. exact stock after another device's
      // changes too), rather than trusting the offline guess indefinitely.
      useAppStore.getState().showToast("Offline changes synced");
      useAppStore.getState().fetchAll();
    } else if (offlineDataAsOf && typeof navigator !== "undefined" && navigator.onLine) {
      // Nothing was queued, but the screen is still showing the cached
      // snapshot from the last time the app opened offline — now that
      // we're back online, refresh so the user isn't looking at stale data
      // indefinitely without realizing it.
      useAppStore.getState().fetchAll();
    }
  });
}
