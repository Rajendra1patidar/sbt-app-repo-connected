import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { QuickAddItemPopup } from "./QuickAddItemPopup";
import { fmtMoney, today, round2 } from "../../lib/format";

// Multi-item purchase entry — same ledger shape as the estimate form (item
// picker, qty, rate, right-aligned amount, inline payment status) but simpler:
// no discount column and no previous-due section, since neither concept
// exists for a purchase.
//
// IMPORTANT — this does NOT change the backend or the Purchase schema. A
// Purchase document is still always exactly one item (see the comment in
// Purchase.js: it's the same record that also powers the Orders screen and
// per-item stock movements, so splitting it into a lines[] array would be a
// real data-model migration, not a form change). Instead, one submit here
// creates one Purchase record per line — all sharing this vendor/date/notes —
// via savePurchaseBatch, which just calls the existing create-one-purchase
// endpoint once per line. From the vendor's side this is one bill with
// several items on it; under the hood it's still several independent,
// individually-reversible restock records, which is exactly how deleting a
// single line item off an old purchase already worked.
const PAYMENT_CHOICES = [
  { key: "unpaid", label: "Unpaid", desc: "Nothing paid yet" },
  { key: "partial", label: "Partial", desc: "Paying part now" },
  { key: "paid", label: "Paid", desc: "Paid in full" },
] as const;

type PurchaseLine = { itemId: string; qty: number | string; qtyKg?: number | string; rate: number | string };

export function PurchaseModal({ vendors, items, godowns, onClose, onSave, onQuickAddItem }: any) {
  const activeItems = items.filter((it: any) => !it.deleted);
  const [vendorId, setVendorId] = useState(vendors[0]?.id || "");
  const [date, setDate] = useState(today());
  const [godownId, setGodownId] = useState(godowns?.find((g: any) => g.isDefault)?.id || godowns?.[0]?.id || "");
  const [lines, setLines] = useState<PurchaseLine[]>([{ itemId: "", qty: 1, rate: 0 }]);
  const [notes, setNotes] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<typeof PAYMENT_CHOICES[number]["key"]>("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const addLine = () => setLines((l) => [...l, { itemId: "", qty: 1, rate: 0 }]);
  const updateLine = (i: number, patch: Partial<PurchaseLine>) => setLines((l) => l.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const itemById = (id: string) => activeItems.find((it: any) => it.id === id);

  const lineAmounts = lines.map((ln, i) => {
    const it = itemById(ln.itemId);
    const isWeight = it?.trackingMode === "weight";
    return round2((isWeight ? Number(ln.qtyKg || 0) : Number(ln.qty || 0)) * Number(ln.rate || 0));
  });
  const total = round2(lineAmounts.reduce((s, a) => s + a, 0));

  const isPartialChoice = paymentChoice === "partial";
  const amountPaidNum = Number(amountPaid || 0);
  const partialValid = !isPartialChoice || (amountPaidNum > 0 && amountPaidNum < total);
  const balanceAfter = paymentChoice === "paid" ? 0 : paymentChoice === "partial" ? round2(Math.max(total - amountPaidNum, 0)) : total;

  const canSave = vendorId && lines.length > 0 &&
    lines.every((l) => {
      if (!l.itemId || !(Number(l.qty) > 0)) return false;
      const it = itemById(l.itemId);
      return it?.trackingMode !== "weight" || Number(l.qtyKg) > 0;
    }) &&
    total > 0 && partialValid && !saving;

  // splits one batch-level "amount paid now" across lines proportionally to
  // each line's own amount, so the sum across lines always matches exactly
  // what was typed — the last line absorbs any rounding remainder.
  const splitAmountPaid = () => {
    if (paymentChoice !== "partial") return lines.map(() => 0);
    let remaining = round2(amountPaidNum);
    return lineAmounts.map((amt, idx) => {
      if (idx === lineAmounts.length - 1) return remaining;
      const share = total > 0 ? round2((amt / total) * amountPaidNum) : 0;
      remaining = round2(remaining - share);
      return share;
    });
  };

  const handleQuickAddItem = async (v: any) => {
    if (!onQuickAddItem) return;
    setAddingItem(true);
    try {
      const item = await onQuickAddItem(v);
      if (item) {
        setLines((l) => [...l, { itemId: item.id, qty: 1, rate: item.purchasePrice || item.sellingPrice || 0 }]);
        setShowAddItem(false);
      }
    } finally {
      setAddingItem(false);
    }
  };

  const handleSaveClick = () => {
    if (!canSave) return;
    setSaving(true);
    const perLinePaid = splitAmountPaid();
    const payload = {
      vendorId, date, notes, godownId: godownId || undefined,
      lines: lines.map((ln, i) => ({
        itemId: ln.itemId, qty: Number(ln.qty), qtyKg: itemById(ln.itemId)?.trackingMode === "weight" ? Number(ln.qtyKg || 0) : undefined,
        rate: Number(ln.rate || 0), godownId: godownId || undefined,
        paymentStatus: paymentChoice, amountPaid: perLinePaid[i],
      })),
    };
    Promise.resolve(onSave(payload)).finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4 animate-fade-in">
      <div className="animate-sheet-up w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">New Purchase</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {vendors.length === 0 ? <p className="text-sm text-ink/50">Add a vendor first.</p>
          : activeItems.length === 0 && !onQuickAddItem ? <p className="text-sm text-ink/50">Add an item first.</p>
          : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Vendor *</label>
                <SearchableSelect
                  options={vendors.map((v: any) => ({ value: v.id, label: v.name }))}
                  value={vendorId} onChange={setVendorId} placeholder="Select vendor"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
              </div>
            </div>

            {godowns && godowns.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Receiving into</label>
                <select value={godownId} onChange={(e) => setGodownId(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm">
                  {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            <div className="border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold text-ink/50">Items *</label>
                {onQuickAddItem && (
                  <button type="button" onClick={() => setShowAddItem(true)}
                    className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1.5 pr-3 text-xs font-bold text-brand-700 transition-all duration-150 hover:bg-brand-100 active:scale-95">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"><Plus size={12} /></span>
                    New item
                  </button>
                )}
              </div>
              <div className="hidden sm:grid mb-1 grid-cols-[2.4fr_80px_110px_110px_28px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
                <span>Item</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span />
              </div>
              <div className="space-y-2">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const isWeight = it?.trackingMode === "weight";
                  return (
                    <div key={i} className="rounded-xl border border-line bg-paper/60 p-2">
                      <div className="sm:grid sm:grid-cols-[2.4fr_80px_110px_110px_28px] sm:gap-2 sm:items-center">
                        <SearchableSelect
                          options={activeItems.map((opt: any) => ({ value: opt.id, label: `${opt.name} (stock: ${opt.trackingMode === "weight" ? `${opt.stockKg ?? 0}kg` : opt.stock ?? 0})`, keywords: opt.category || "" }))}
                          value={ln.itemId} onChange={(v: string) => updateLine(i, { itemId: v, rate: itemById(v)?.purchasePrice || itemById(v)?.sellingPrice || 0 })}
                          placeholder="Select item"
                        />
                        <div className="mt-2 sm:mt-0">
                          <span className="mb-0.5 block text-[10px] font-semibold text-ink/35 sm:hidden">{isWeight ? "Pieces" : "Qty"}</span>
                          <input type="number" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-full rounded-xl border border-line px-2 py-2 text-sm" />
                        </div>
                        <div className="mt-2 sm:mt-0">
                          <span className="mb-0.5 block text-[10px] font-semibold text-ink/35 sm:hidden">Rate{isWeight ? "/kg" : ""}</span>
                          <input type="number" min="0" value={ln.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} className="w-full rounded-xl border border-line px-2 py-2 text-sm" />
                        </div>
                        <div className="mt-2 flex items-center justify-between sm:mt-0 sm:block sm:text-right">
                          <span className="text-[10px] font-semibold text-ink/35 sm:hidden">Amount</span>
                          <span className="font-display text-sm font-bold text-ink tabular-nums">{fmtMoney(lineAmounts[i], "")}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-end sm:mt-0">
                          {lines.length > 1 && <button onClick={() => removeLine(i)} className="rounded-full p-1.5 text-bad-500 hover:bg-bad-50"><Trash2 size={15} /></button>}
                        </div>
                      </div>
                      {isWeight && (
                        <div className="mt-2">
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">Weight received (kg) — re-weigh, don't estimate</span>
                          <input type="number" min="0.01" step="0.01" value={ln.qtyKg ?? ""} onChange={(e) => updateLine(i, { qtyKg: e.target.value })} placeholder="0" className="w-full rounded-xl border border-line px-2 py-2 text-sm" />
                        </div>
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
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
              <span className="text-sm font-semibold text-ink/50">Total</span>
              <span className="font-display text-lg font-bold text-ink">{total.toFixed(2)}</span>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-ink/50">Payment status</label>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_CHOICES.map((c) => (
                  <button
                    key={c.key} type="button" onClick={() => setPaymentChoice(c.key)}
                    className={`rounded-xl px-1 py-2 text-xs font-semibold transition ${paymentChoice === c.key ? "bg-brand-600 text-white" : "bg-paper text-ink/60"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-ink/40">{PAYMENT_CHOICES.find((c) => c.key === paymentChoice)?.desc}</p>

              {isPartialChoice && (
                <div className="mt-2 rounded-xl border border-line bg-paper/60 p-3">
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Amount paid now</label>
                  <input
                    type="number" min="0" max={total} value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
                  />
                  {amountPaid !== "" && !partialValid && (
                    <p className="mt-1 text-[11px] text-bad-600">Enter an amount more than 0 and less than {fmtMoney(total, "")}.</p>
                  )}
                  {lines.length > 1 && amountPaid !== "" && partialValid && (
                    <p className="mt-1 text-[11px] text-ink/40">Split across {lines.length} items proportionally to each item's amount.</p>
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between rounded-xl bg-paper px-4 py-2.5">
                <span className="text-xs font-semibold text-ink/50">Balance owed after saving</span>
                <span className="font-display text-sm font-bold text-ink">{fmtMoney(balanceAfter, "")}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={handleSaveClick}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save purchase"}</button>
        </div>
      </div>

      {showAddItem && (
        <QuickAddItemPopup saving={addingItem} onCancel={() => setShowAddItem(false)} onSave={handleQuickAddItem} />
      )}
    </div>
  );
}
