import { getOfflineQueue, isUnresolvedOfflineId } from "./offlineQueue";

/**
 * Re-applies everything still waiting in the offline queue on top of a base
 * snapshot (fresh server data, or the cached copy). Used after every
 * fetchAll() and right after a new offline action is queued, so the screen
 * always shows "last known server data + my unsynced changes".
 *
 * Idempotent: an estimate that already shows an action's effect carries that
 * action's id in `_offlineApplied`, so applying twice never double-counts a
 * payment or a return. Returns only the lists that changed.
 */

/** Estimate fields an edit is allowed to change (mirrors saveDocument's payload). */
export const EDITABLE_ESTIMATE_FIELDS = [
  "customerId", "date", "dueDate", "lines", "notes", "total",
  "freightCost", "labourCost", "previousDue", "contractorName", "destination",
] as const;

export function pickEditableFields(src: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of EDITABLE_ESTIMATE_FIELDS) if (k in src) out[k] = src[k];
  return out;
}

const wasApplied = (doc: any, id: string) => (doc?._offlineApplied || []).includes(id);
const markApplied = (doc: any, id: string) => ({ ...doc, _offlineApplied: [...(doc._offlineApplied || []), id], _offlinePending: true });

export function applyOfflineQueue(state: any): Record<string, any> {
  const queue = getOfflineQueue();
  if (!queue.length) return {};
  let { customers, estimates, payments, items } = state;
  const out: Record<string, any> = {};
  const has = (list: any[], id: string) => list.some((x: any) => x.id === id);
  const patchEstimate = (id: string, fn: (e: any) => any) => {
    estimates = estimates.map((e: any) => (e.id === id ? fn(e) : e));
    out.estimates = estimates;
  };

  for (const a of queue) {
    const ph = a.placeholder;
    switch (a.type) {
      case "customer":
        if (ph && isUnresolvedOfflineId(ph.id) && !has(customers, ph.id)) {
          customers = [ph, ...customers];
          out.customers = customers;
        }
        break;

      case "estimate":
        if (ph && isUnresolvedOfflineId(ph.id) && !has(estimates, ph.id)) {
          estimates = [ph, ...estimates];
          const rolled: string[] = a.payload?.rolledEstimateIds || [];
          if (rolled.length) estimates = estimates.map((e: any) => (rolled.includes(e.id) ? { ...e, status: "Paid" } : e));
          out.estimates = estimates;
        }
        break;

      case "payment": {
        if (ph && !has(payments, ph.id)) {
          payments = [ph, ...payments];
          out.payments = payments;
        }
        const invId = a.payload?.invoiceId;
        const est = invId && estimates.find((e: any) => e.id === invId);
        if (est && !wasApplied(est, a.id)) {
          // same rule the server uses: Paid when paid >= total, Partially Paid when > 0, else Due
          patchEstimate(invId, (e) => {
            const paid = Number(e.amountPaid || 0) + Number(a.payload?.amount || 0);
            const total = Number(e.total || 0);
            const status = total > 0 && paid >= total ? "Paid" : paid > 0 ? "Partially Paid" : "Due";
            return { ...markApplied(e, a.id), amountPaid: paid, status };
          });
        }
        break;
      }

      case "estimateEdit": {
        const id = a.payload?.id;
        const est = id && estimates.find((e: any) => e.id === id);
        if (est && !wasApplied(est, a.id)) {
          // status/amountPaid are untouched, exactly like the server's edit — payments drive those
          patchEstimate(id, (e) => ({ ...markApplied(e, a.id), ...pickEditableFields(a.payload?.payload || {}) }));
        }
        break;
      }

      case "estimateReturn": {
        const id = a.payload?.docId;
        const est = id && estimates.find((e: any) => e.id === id);
        if (est && !wasApplied(est, a.id)) {
          patchEstimate(id, (e) => {
            const soFar: Record<string, number> = {};
            for (const r of e.returns || []) soFar[r.itemId] = (soFar[r.itemId] || 0) + Number(r.qty || 0);
            const added: any[] = [];
            for (const l of a.payload?.lines || []) {
              const qty = Number(l.qty || 0);
              const line = (e.lines || []).find((x: any) => x.itemId === l.itemId);
              if (qty <= 0 || !line) continue;
              const q = Math.min(qty, Number(line.qty || 0) - (soFar[l.itemId] || 0));
              if (q <= 0) continue;
              soFar[l.itemId] = (soFar[l.itemId] || 0) + q;
              const it = items.find((i: any) => i.id === l.itemId);
              added.push({
                itemId: l.itemId, name: it?.name || "Item", qty: q, piecesQty: l.piecesQty,
                rate: Number(line.rate || 0), amount: q * Number(line.rate || 0), date: a.payload?.date, _offlinePending: true,
              });
            }
            // stock is deliberately NOT adjusted here (weight/piece/box units are easy to get subtly
            // wrong without the server) — the real numbers arrive when the return syncs.
            return { ...markApplied(e, a.id), returns: [...(e.returns || []), ...added] };
          });
        }
        break;
      }

      case "stockTake": {
        const lines: any[] = a.payload?.lines || [];
        items = items.map((it: any) => {
          const line = lines.find((l) => l.itemId === it.id);
          return line ? { ...it, stock: line.newStock, stockKg: line.newStockKg ?? it.stockKg } : it;
        });
        out.items = items;
        break;
      }
    }
  }
  return out;
}

/** Kept under its old name — fetchAll() uses this. */
export const withOfflinePending = applyOfflineQueue;
