import React, { useState } from "react";
import { X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { today } from "../../lib/format";

/* ---- OrderModal ---- */

export function OrderModal({ items, onClose, onSave, prefill }: any) {
  const [itemId, setItemId] = useState(prefill?.itemId || items[0]?.id || "");
  const [qty, setQty] = useState(String(prefill?.qty || "1"));
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const canSave = itemId && Number(qty) > 0;

  const selectedItem = items.find((it: any) => it.id === itemId);
  const showBoxReminder = selectedItem && selectedItem.trackingMode === "box" && selectedItem.piecesPerBox > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">New Order</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        {items.length === 0 ? <p className="text-sm text-ink/50">Add items first.</p> : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Item *</label>
              <SearchableSelect
                options={items.map((it: any) => ({ value: it.id, label: `${it.name} (current stock: ${it.stock ?? 0})` }))}
                value={itemId}
                onChange={setItemId}
                placeholder="Select item"
              />
            </div>
            {showBoxReminder && (
              <div className="rounded-xl bg-brand-50 px-4 py-3 border border-brand-200">
                <p className="text-xs font-semibold text-brand-700">This item comes in a box of {selectedItem.piecesPerBox} pieces</p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Qty to order *</label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Notes / Supplier</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Supplier name" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ itemId, qty: Number(qty), date, notes })}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">Place Order</button>
        </div>
      </div>
    </div>
  );
}
