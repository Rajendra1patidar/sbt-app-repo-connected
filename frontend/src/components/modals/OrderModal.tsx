import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { fmtMoney, today, round2 } from "../../lib/format";

/* ---- OrderModal ----
 * Multi-item order entry — same shape as PurchaseModal: one vendor, one
 * date, one notes field shared across every line, but each line picks its
 * own item/qty/rate. Saving creates one Order (Purchase, source:"order")
 * record per line via saveOrder, which loops the existing single-item
 * create endpoint — same approach PurchaseModal's "New item" lines use.
 */

type OrderLine = { itemId: string; qty: number | string; rate: number | string };

export function OrderModal({ items, vendors, currency, onClose, onSave, prefill }: any) {
  const activeItems = items.filter((it: any) => !it.deleted);
  const itemById = (id: string) => activeItems.find((it: any) => it.id === id);

  const initialItemId = prefill?.itemId || activeItems[0]?.id || "";
  const [vendorId, setVendorId] = useState(prefill?.vendorId || "");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([
    {
      itemId: initialItemId,
      qty: prefill?.qty || 1,
      rate: prefill?.rate ?? (itemById(initialItemId)?.purchasePrice ?? ""),
    },
  ]);
  const [saving, setSaving] = useState(false);

  const addLine = () => setLines((l) => [...l, { itemId: "", qty: 1, rate: 0 }]);
  const updateLine = (i: number, patch: Partial<OrderLine>) =>
    setLines((l) => l.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));

  const lineAmounts = lines.map((ln) => round2(Number(ln.qty || 0) * Number(ln.rate || 0)));
  const total = round2(lineAmounts.reduce((s, a) => s + a, 0));

  const canSave =
    lines.length > 0 &&
    lines.every((l) => l.itemId && Number(l.qty) > 0 && Number(l.rate) >= 0 && l.rate !== "") &&
    !saving;

  const handleSaveClick = () => {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      vendorId: vendorId || undefined,
      date,
      notes,
      lines: lines.map((ln) => ({ itemId: ln.itemId, qty: Number(ln.qty), rate: Number(ln.rate || 0) })),
    };
    Promise.resolve(onSave(payload)).finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4 animate-fade-in">
      <div className="animate-sheet-up w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">New Order</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {items.length === 0 ? <p className="text-sm text-ink/50">Add items first.</p> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Vendor (optional)</label>
                <SearchableSelect
                  options={vendors.map((v: any) => ({ value: v.id, label: v.name }))}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="Select vendor, if known"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <label className="mb-2 block text-xs font-semibold text-ink/50">Items *</label>
              <div className="hidden sm:grid mb-1 grid-cols-[2.4fr_80px_110px_110px_28px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
                <span>Item</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span />
              </div>
              <div className="space-y-2">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const showBoxReminder = it && it.trackingMode === "box" && it.piecesPerBox > 0;
                  return (
                    <div key={i} className="rounded-xl border border-line bg-paper/60 p-2">
                      <div className="sm:grid sm:grid-cols-[2.4fr_80px_110px_110px_28px] sm:gap-2 sm:items-center">
                        <SearchableSelect
                          options={activeItems.map((opt: any) => ({ value: opt.id, label: `${opt.name} (current stock: ${opt.stock ?? 0})`, keywords: opt.category || "" }))}
                          value={ln.itemId}
                          onChange={(v: string) => updateLine(i, { itemId: v, rate: itemById(v)?.purchasePrice || itemById(v)?.sellingPrice || 0 })}
                          placeholder="Select item"
                        />
                        <div className="mt-2 sm:mt-0">
                          <span className="mb-0.5 block text-[10px] font-semibold text-ink/35 sm:hidden">Qty</span>
                          <input type="number" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-full rounded-xl border border-line px-2 py-2 text-sm" />
                        </div>
                        <div className="mt-2 sm:mt-0">
                          <span className="mb-0.5 block text-[10px] font-semibold text-ink/35 sm:hidden">Rate</span>
                          <input type="number" min="0" step="0.01" value={ln.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} className="w-full rounded-xl border border-line px-2 py-2 text-sm" />
                        </div>
                        <div className="mt-2 flex items-center justify-between sm:mt-0 sm:block sm:text-right">
                          <span className="text-[10px] font-semibold text-ink/35 sm:hidden">Amount</span>
                          <span className="font-display text-sm font-bold text-ink tabular-nums">{fmtMoney(lineAmounts[i], "")}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-end sm:mt-0">
                          {lines.length > 1 && <button onClick={() => removeLine(i)} className="rounded-full p-1.5 text-bad-500 hover:bg-bad-50"><Trash2 size={15} /></button>}
                        </div>
                      </div>
                      {showBoxReminder && (
                        <p className="mt-2 text-[11px] font-semibold text-brand-700">This item comes in a box of {it.piecesPerBox} pieces</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button" onClick={addLine}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3.5 text-sm font-bold text-brand-600 transition hover:bg-brand-100 hover:border-brand-400 active:scale-[0.98]"
              >
                <Plus size={19} /> Add line
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
              <span className="text-sm font-semibold text-ink/50">Total</span>
              <span className="font-display text-lg font-bold text-ink">{fmtMoney(total, currency)}</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={handleSaveClick}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Placing…" : "Place Order"}</button>
        </div>
      </div>
    </div>
  );
}
