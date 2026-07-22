import React, { useState } from "react";

export function RateEditPopup({ itemName, listPrice, rate, onCancel, onReset, onSave }: any) {
  const [value, setValue] = useState(String(rate));
  const numeric = Number(value);
  const canSave = value !== "" && !isNaN(numeric) && numeric >= 0;
  const isOverridden = Number(rate) !== Number(listPrice);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/40 p-4">
      <div className="w-full sm:max-w-xs rounded-3xl bg-white p-5 shadow-xl">
        <h3 className="font-display text-base font-bold text-ink">Edit rate</h3>
        <p className="mb-4 mt-0.5 text-xs text-ink/50">{itemName} — this estimate only</p>

        <label className="mb-1.5 block text-xs font-semibold text-ink/50">Rate per unit</label>
        <div className="flex items-center rounded-xl border-[1.5px] border-brand-600 px-3 py-2.5">
          <span className="mr-1 text-ink/50">₹</span>
          <input
            type="number" min="0" autoFocus value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-none p-0 font-display text-base font-bold text-ink outline-none"
          />
        </div>
        <p className="mb-4 mt-1.5 text-xs text-ink/40">Item's list price: ₹{Number(listPrice).toFixed(2)}</p>

        <p className="mb-4 text-[11px] leading-relaxed text-ink/40">
          This only changes the rate on this estimate. Your saved item price in the Items list won't be affected.
        </p>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-paper py-2.5 text-sm font-bold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(numeric)} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">Save rate</button>
        </div>
        {isOverridden && (
          <button onClick={onReset} className="mt-3 text-left text-xs font-semibold text-brand-600 underline">
            ↺ Reset to list price (₹{Number(listPrice).toFixed(2)})
          </button>
        )}
      </div>
    </div>
  );
}
