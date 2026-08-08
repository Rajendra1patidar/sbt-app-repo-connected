import React, { useState } from "react";
import { X } from "lucide-react";
import { bookingLineProgress } from "../../lib/bookingLogic";

/* ---- InvoiceShareModal ---- */

export function DeliveryModal({ doc, items, onClose, onSave }: any) {
  const rows = bookingLineProgress(doc)
    .filter((r: any) => r.remaining > 0)
    .map((r: any) => ({ ...r, name: items.find((it: any) => it.id === r.itemId)?.name || "Item" }));

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const setQty = (itemId: string, v: string) => setQtyMap((m) => ({ ...m, [itemId]: v }));

  const lines = rows
    .map((r: any) => ({ ...r, collectQty: Math.min(Number(qtyMap[r.itemId] || 0), r.remaining) }))
    .filter((r: any) => r.collectQty > 0);
  const canSave = lines.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-bold text-ink">Record collection</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-ink/50">{doc.number} — enter how many of each booked item the customer is taking right now. Can't exceed what's still remaining.</p>

        {rows.length === 0 ? (
          <p className="text-sm text-ink/50">Everything booked on this estimate has already been collected.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.itemId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-ink/40">
                    {r.remaining} of {r.booked} remaining
                    {r.delivered > 0 ? ` · ${r.delivered} collected so far` : ""}
                  </p>
                </div>
                <input
                  type="number" min="0" max={r.remaining} placeholder="0"
                  value={qtyMap[r.itemId] || ""} onChange={(e) => setQty(r.itemId, e.target.value)}
                  className="w-16 rounded-xl border border-line px-2 py-2 text-sm text-center"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.collectQty })))}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Record collection
          </button>
        </div>
      </div>
    </div>
  );
}
