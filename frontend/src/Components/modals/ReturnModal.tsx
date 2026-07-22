import React, { useState } from "react";
import { X } from "lucide-react";
import { fmtMoney } from "../../lib/format";

export function ReturnModal({ doc, items, currency, onClose, onSave }: any) {
  const alreadyReturned: Record<string, number> = {};
  for (const r of doc.returns || []) alreadyReturned[r.itemId] = (alreadyReturned[r.itemId] || 0) + r.qty;

  const returnableLines = (doc.lines || [])
    .map((l: any) => ({
      itemId: l.itemId,
      rate: l.rate,
      qty: l.qty,
      returned: alreadyReturned[l.itemId] || 0,
      name: items.find((it: any) => it.id === l.itemId)?.name || "Item",
    }))
    .filter((l: any) => l.qty - l.returned > 0);

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const setQty = (itemId: string, v: string) => setQtyMap((m) => ({ ...m, [itemId]: v }));

  const lines = returnableLines
    .map((l: any) => ({ ...l, returnQty: Math.min(Number(qtyMap[l.itemId] || 0), l.qty - l.returned) }))
    .filter((l: any) => l.returnQty > 0);
  const refundTotal = lines.reduce((s: number, l: any) => s + l.returnQty * l.rate, 0);
  const canSave = lines.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-bold text-ink">Return items</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-ink/50">{doc.number} — enter how many of each item are being returned.</p>

        {returnableLines.length === 0 ? (
          <p className="text-sm text-ink/50">Every item on this estimate has already been returned.</p>
        ) : (
          <div className="space-y-3">
            {returnableLines.map((l: any) => (
              <div key={l.itemId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{l.name}</p>
                  <p className="text-xs text-ink/40">
                    {l.qty - l.returned} available to return · {fmtMoney(l.rate, currency)} each
                    {l.returned > 0 ? ` · ${l.returned} already returned` : ""}
                  </p>
                </div>
                <input
                  type="number" min="0" max={l.qty - l.returned} placeholder="0"
                  value={qtyMap[l.itemId] || ""} onChange={(e) => setQty(l.itemId, e.target.value)}
                  className="w-16 rounded-xl border border-line px-2 py-2 text-sm text-center"
                />
              </div>
            ))}
          </div>
        )}

        {refundTotal > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-bad-50 px-3 py-2.5">
            <span className="text-sm font-semibold text-bad-600">Refund due</span>
            <span className="font-display text-base font-bold text-bad-700">{fmtMoney(refundTotal, currency)}</span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.returnQty })))}
            className="flex-1 rounded-full bg-bad-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Refund {refundTotal > 0 ? fmtMoney(refundTotal, currency) : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
