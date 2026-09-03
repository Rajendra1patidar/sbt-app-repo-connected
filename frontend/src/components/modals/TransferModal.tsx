import React, { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";

export function TransferModal({ items, godowns, onClose, onSave }: any) {
  const [itemId, setItemId] = useState("");
  const [fromGodownId, setFromGodownId] = useState(godowns.find((g: any) => g.isDefault)?.id || godowns[0]?.id || "");
  const [toGodownId, setToGodownId] = useState("");
  const [qty, setQty] = useState("");
  const [qtyKg, setQtyKg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const item = items.find((it: any) => it.id === itemId);
  const isWeight = item?.trackingMode === "weight";
  const atSource = item?.stockByGodown?.find((g: any) => String(g.godownId) === String(fromGodownId));
  const availablePieces = atSource?.stock ?? 0;
  const availableKg = atSource?.stockKg ?? 0;

  const canSave =
    itemId && fromGodownId && toGodownId && fromGodownId !== toGodownId &&
    Number(qty) > 0 && Number(qty) <= availablePieces &&
    (!isWeight || (Number(qtyKg) > 0 && Number(qtyKg) <= availableKg));

  const submit = async () => {
    setSubmitting(true);
    await onSave({ itemId, fromGodownId, toGodownId, qty: Number(qty), qtyKg: isWeight ? Number(qtyKg) : undefined });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">Transfer stock</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs font-semibold text-ink/50">Item</span>
            <SearchableSelect
              options={items.map((it: any) => ({ value: it.id, label: it.name, keywords: it.category || "" }))}
              value={itemId}
              onChange={(v: string) => { setItemId(v); setQty(""); setQtyKg(""); }}
              placeholder="Select item"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="mb-1 block text-xs font-semibold text-ink/50">From</span>
              <select value={fromGodownId} onChange={(e) => setFromGodownId(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm">
                {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <ArrowRight size={16} className="mt-5 shrink-0 text-ink/30" />
            <div className="flex-1 min-w-0">
              <span className="mb-1 block text-xs font-semibold text-ink/50">To</span>
              <select value={toGodownId} onChange={(e) => setToGodownId(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm">
                <option value="">Select</option>
                {godowns.filter((g: any) => g.id !== fromGodownId).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>

          {item && (
            <p className="text-xs text-ink/40">
              Available at source: {isWeight ? `${availableKg}kg / ${availablePieces}pc` : `${availablePieces} ${item.unit || "unit"}`}
            </p>
          )}

          <div>
            <span className="mb-1 block text-xs font-semibold text-ink/50">{isWeight ? "Pieces to move" : "Qty to move"}</span>
            <input
              type="number" min="0" max={availablePieces} value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
          </div>
          {isWeight && (
            <div>
              <span className="mb-1 block text-xs font-semibold text-ink/50">Weight (kg) to move — re-weigh, don't estimate</span>
              <input
                type="number" min="0" max={availableKg} value={qtyKg} onChange={(e) => setQtyKg(e.target.value)}
                placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!canSave || submitting}
            onClick={submit}
            className="flex-1 rounded-full bg-brand-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
