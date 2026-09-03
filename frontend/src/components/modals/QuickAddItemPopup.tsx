import React, { useState } from "react";
import { X } from "lucide-react";

// Deliberately minimal (name + selling price + unit + opening stock, no category/brand/
// vendor/box-tracking) — this exists for the fast path of adding a brand-new item while
// building an estimate, not as a replacement for the full "New Item" form. Category
// defaults to "Others" server-side, same as the full form.
export function QuickAddItemPopup({ onCancel, onSave, saving }: any) {
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("");
  const canSave = name.trim().length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 animate-fade-in">
      <div className="animate-pop-in w-full max-w-xs rounded-3xl bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">New item</h3>
          <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Item name *</label>
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cement 50kg bag" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Selling price</label>
              <input
                type="number" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Unit</label>
              <input
                value={unit} onChange={(e) => setUnit(e.target.value)}
                placeholder="kg / pc / bundle" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Opening stock</label>
            <input
              type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)}
              placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/50">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => onSave({
              name: name.trim(),
              sellingPrice: Number(sellingPrice || 0),
              unit: unit.trim(),
              stock: Number(stock || 0),
            })}
            className="flex-1 rounded-full bg-brand-500 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {saving ? "Adding…" : "Add & select"}
          </button>
        </div>
      </div>
    </div>
  );
}
