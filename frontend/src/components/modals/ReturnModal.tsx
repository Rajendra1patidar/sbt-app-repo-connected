import React, { useState } from "react";
import { X } from "lucide-react";
import { fmtMoney, round2 } from "../../lib/format";

export function ReturnModal({ doc, items, currency, onClose, onSave }: any) {
  const alreadyReturned: Record<string, number> = {};
  const alreadyReturnedPieces: Record<string, number> = {};
  for (const r of doc.returns || []) {
    alreadyReturned[r.itemId] = (alreadyReturned[r.itemId] || 0) + r.qty;
    alreadyReturnedPieces[r.itemId] = (alreadyReturnedPieces[r.itemId] || 0) + Number(r.piecesQty || 0);
  }

  const returnableLines = (doc.lines || [])
    .map((l: any) => {
      const it = items.find((i: any) => i.id === l.itemId);
      return {
        itemId: l.itemId,
        rate: l.rate,
        qty: l.qty,
        piecesQty: l.piecesQty,
        returned: alreadyReturned[l.itemId] || 0,
        returnedPieces: alreadyReturnedPieces[l.itemId] || 0,
        isWeight: it?.trackingMode === "weight",
        name: it?.name || "Item",
      };
    })
    .filter((l: any) => l.qty - l.returned > 0 || (l.isWeight && Number(l.piecesQty || 0) - l.returnedPieces > 0));

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [piecesMap, setPiecesMap] = useState<Record<string, string>>({});
  const setQty = (itemId: string, v: string) => setQtyMap((m) => ({ ...m, [itemId]: v }));
  const setPieces = (itemId: string, v: string) => setPiecesMap((m) => ({ ...m, [itemId]: v }));

  const lines = returnableLines
    .map((l: any) => ({
      ...l,
      returnQty: Math.min(Number(qtyMap[l.itemId] || 0), l.qty - l.returned),
      returnPieces: l.isWeight ? Math.min(Number(piecesMap[l.itemId] || 0), Number(l.piecesQty || 0) - l.returnedPieces) : 0,
    }))
    .filter((l: any) => l.returnQty > 0 && (!l.isWeight || l.returnPieces > 0));
  const refundTotal = round2(lines.reduce((s: number, l: any) => s + l.returnQty * l.rate, 0));
  const canSave = lines.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4 animate-fade-in">
      <div className="animate-sheet-up w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-bold text-ink">Return items</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-ink/50">{doc.number} — enter how many of each item are being returned.</p>

        {returnableLines.length === 0 ? (
          <p className="text-sm text-ink/50">Every item on this estimate has already been returned.</p>
        ) : (
          <>
            <div className="hidden sm:grid mb-1 grid-cols-[1fr_72px_96px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
              <span>Item</span><span>Qty</span><span className="text-right">Refund</span>
            </div>
            <div className="space-y-2">
              {returnableLines.map((l: any, i: number) => {
                const qty = Math.min(Number(qtyMap[l.itemId] || 0), l.qty - l.returned);
                const lineRefund = round2(qty * l.rate);
                return (
                  <div key={l.itemId} style={{ animationDelay: `${Math.min(i, 6) * 25}ms` }} className="animate-row-in rounded-xl border border-line bg-paper/60 p-2.5 sm:grid sm:grid-cols-[1fr_72px_96px] sm:gap-2 sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{l.name}</p>
                      <p className="text-xs text-ink/40">
                        {l.qty - l.returned}{l.isWeight ? "kg" : ""} available · {fmtMoney(l.rate, currency)}{l.isWeight ? "/kg" : " each"}
                        {l.returned > 0 ? ` · ${l.returned} already returned` : ""}
                      </p>
                    </div>
                    <div className="mt-2 sm:mt-0">
                      <span className="mb-0.5 block text-[10px] font-semibold text-ink/35 sm:hidden">{l.isWeight ? "Kg to return" : "Qty to return"}</span>
                      <input
                        type="number" min="0" max={l.qty - l.returned} placeholder="0"
                        value={qtyMap[l.itemId] || ""} onChange={(e) => setQty(l.itemId, e.target.value)}
                        className="w-full sm:w-16 rounded-xl border border-line px-2 py-2 text-sm text-center"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between sm:mt-0 sm:block sm:text-right">
                      <span className="text-[10px] font-semibold text-ink/35 sm:hidden">Refund</span>
                      <span className="font-display text-sm font-bold text-ink tabular-nums">{lineRefund > 0 ? fmtMoney(lineRefund, currency) : "—"}</span>
                    </div>
                    {l.isWeight && (
                      <div className="col-span-full mt-2 sm:mt-1.5">
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">Pieces returned</span>
                        <input
                          type="number" min="0" max={Number(l.piecesQty || 0) - l.returnedPieces} placeholder="0"
                          value={piecesMap[l.itemId] || ""} onChange={(e) => setPieces(l.itemId, e.target.value)}
                          className="w-full rounded-xl border border-line px-2 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {refundTotal > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-bad-50 px-4 py-3">
            <span className="text-sm font-semibold text-bad-600">Refund due</span>
            <span className="font-display text-lg font-bold text-bad-700">{fmtMoney(refundTotal, currency)}</span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.returnQty, piecesQty: l.isWeight ? l.returnPieces : undefined })))}
            className="flex-1 rounded-full bg-bad-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Refund {refundTotal > 0 ? fmtMoney(refundTotal, currency) : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
