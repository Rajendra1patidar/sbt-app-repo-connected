import React, { useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { RateEditPopup } from "./RateEditPopup";
import { StatusChoicePopup } from "./StatusChoicePopup";
import { fmtMoney, today } from "../../lib/format";
import { InvoiceLine } from "../../types/index";

export function DocumentModal({ type, customers, items, estimates, editingDoc, onClose, onSave }: any) {
  const isEditing = !!editingDoc;
  const [customerId, setCustomerId] = useState(editingDoc?.customerId || customers[0]?.id || "");
  const [date, setDate] = useState(editingDoc?.date ? String(editingDoc.date).slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editingDoc?.dueDate ? String(editingDoc.dueDate).slice(0, 10) : today());
  const [lines, setLines] = useState<InvoiceLine[]>(editingDoc?.lines?.length ? editingDoc.lines.map((ln: InvoiceLine) => ({ ...ln })) : [{ itemId: items[0]?.id || "", qty: 1, rate: items[0]?.price || 0 }]);
  const [notes, setNotes] = useState(editingDoc?.notes || "");
  const [rateEditIndex, setRateEditIndex] = useState<number | null>(null);
  const [freightCost, setFreightCost] = useState(editingDoc?.freightCost ? String(editingDoc.freightCost) : "");
  const [labourCost, setLabourCost] = useState(editingDoc?.labourCost ? String(editingDoc.labourCost) : "");
  const [includePreviousDue, setIncludePreviousDue] = useState(!isEditing);
  const [contractorName, setContractorName] = useState(editingDoc?.contractorName || "");
  const [destination, setDestination] = useState(editingDoc?.destination || "");
  // tracks whether the destination field holds a value the user deliberately set/edited,
  // so switching customers only auto-fills an empty/untouched destination and never overwrites it
  const [destinationTouched, setDestinationTouched] = useState(!!editingDoc?.destination);
  const [pendingSave, setPendingSave] = useState<any>(null);

  useEffect(() => {
    if (type !== "estimate" || destinationTouched) return;
    const customer = customers.find((c: any) => c.id === customerId);
    if (customer?.location) setDestination(customer.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const knownContractors = Array.from(new Set((estimates || []).map((e: any) => e.contractorName).filter(Boolean))) as string[];
  const knownDestinations = Array.from(new Set((estimates || []).map((e: any) => e.destination).filter(Boolean))) as string[];

  const addLine = () => setLines((l) => [...l, { itemId: items[0]?.id || "", qty: 1, rate: items[0]?.price || 0 }]);
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((ln, idx) => idx === i ? { ...ln, ...patch } : ln));
  const setLineItem = (i: number, itemId: string) => {
    const it = items.find((it: any) => it.id === itemId);
    updateLine(i, { itemId, rate: it?.price || 0 }); // fresh rate every time the item on this line changes
  };
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemsSubtotal = lines.reduce((sum, ln) => sum + Number(ln.qty || 0) * Number(ln.rate || 0), 0);

  // when editing, exclude the estimate being edited itself from its own "previous due" calculation
  const previousDueEstimates = type === "estimate" && !isEditing ? (estimates || []).filter((e: any) => e.customerId === customerId && e.status !== "Paid") : [];
  const previousDueAmount = previousDueEstimates.reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);
  const previousDue = includePreviousDue ? previousDueAmount : 0;

  const total = itemsSubtotal + Number(freightCost || 0) + Number(labourCost || 0) + previousDue;

  const titleMap: any = {
    estimate: isEditing ? "Edit Estimate" : "New Estimate",
    challan: isEditing ? "Edit Delivery Challan" : "New Delivery Challan",
  };
  const canSave = customerId && lines.length > 0 && lines.every((l) => l.itemId);

  const buildPayload = () => ({
    customerId, date, dueDate, lines, notes, total,
    freightCost: Number(freightCost || 0), labourCost: Number(labourCost || 0), previousDue,
    rolledEstimateIds: includePreviousDue ? previousDueEstimates.map((e: any) => e.id) : [],
    contractorName, destination,
    ...(isEditing ? { id: editingDoc.id } : {}),
  });

  const handleSaveClick = () => {
    if (!canSave) return;
    // new estimates ask Due/Paid before actually saving; edits keep the existing status as-is
    if (type === "estimate" && !isEditing) { setPendingSave(buildPayload()); return; }
    onSave(buildPayload());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">{titleMap[type]}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        {customers.length === 0 ? <p className="text-sm text-ink/50">Add a customer first.</p>
          : items.length === 0 ? <p className="text-sm text-ink/50">Add an item first.</p>
          : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Customer *</label>
              <SearchableSelect
                options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select customer"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">{type === "challan" ? "Delivery date" : "Date"}</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
              </div>
              {type !== "challan" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Due date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-ink/50">Items *</label>
              <div className="space-y-3">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const isOverridden = type === "estimate" && it && Number(ln.rate) !== Number(it.price);
                  const lineSubtotal = Number(ln.qty || 0) * Number(ln.rate || 0);
                  return (
                    <div key={i} className="rounded-xl border border-line bg-paper/60 p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            options={items.map((it: any) => ({ value: it.id, label: `${it.name} (stock: ${it.stock ?? 0})` }))}
                            value={ln.itemId}
                            onChange={(v: string) => setLineItem(i, v)}
                            placeholder="Select item"
                          />
                        </div>
                        <input type="number" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-16 rounded-xl border border-line px-2 py-2 text-sm" />
                        {type === "estimate" && (
                          <button type="button" onClick={() => setRateEditIndex(i)}
                            className={`relative flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-2 text-sm font-semibold ${isOverridden ? "border-warn-200 bg-warn-50 text-warn-700" : "border-brand-100 bg-brand-50 text-brand-700"}`}>
                            {fmtMoney(Number(ln.rate || 0), "")}
                            <Pencil size={11} className="opacity-70" />
                            {isOverridden && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-warn-500" />}
                          </button>
                        )}
                        {it && Number(ln.qty) > (it.stock ?? 0) && <span title="Exceeds stock"><AlertTriangle size={14} className="text-warn-500 shrink-0" /></span>}
                        {lines.length > 1 && <button onClick={() => removeLine(i)} className="rounded-full p-1.5 text-bad-500 hover:bg-bad-50"><Trash2 size={15} /></button>}
                      </div>
                      <p className="mt-1.5 px-1 text-xs font-semibold text-ink/50">Subtotal: {fmtMoney(lineSubtotal, "")}</p>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3.5 text-sm font-bold text-brand-600 transition hover:bg-brand-100 hover:border-brand-400 active:scale-[0.98]"
              >
                <Plus size={19} /> Add Item
              </button>
            </div>
            {type === "estimate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Contractor name</label>
                  <input list="contractor-names" value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                  <datalist id="contractor-names">{knownContractors.map((n) => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Destination</label>
                  <input list="destination-names" value={destination} onChange={(e) => { setDestination(e.target.value); setDestinationTouched(true); }} placeholder="Place / area" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                  <datalist id="destination-names">{knownDestinations.map((n) => <option key={n} value={n} />)}</datalist>
                  <p className="mt-1 text-[11px] text-ink/40">Auto-filled from the customer's saved location — edit if this delivery goes elsewhere.</p>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            {type === "estimate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Freight cost</label>
                  <input type="number" min="0" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Labour cost</label>
                  <input type="number" min="0" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                </div>
              </div>
            )}
            {type === "estimate" && previousDueAmount > 0 && (
              <div className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-warn-800">Previous due — {fmtMoney(previousDueAmount, "")}</p>
                    <p className="mt-0.5 text-xs text-warn-700">From {previousDueEstimates.length} earlier unpaid estimate{previousDueEstimates.length !== 1 ? "s" : ""}: {previousDueEstimates.map((e: any) => e.number).join(", ")}</p>
                  </div>
                  <button type="button" onClick={() => setIncludePreviousDue((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${includePreviousDue ? "bg-warn-500" : "bg-paper"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition ${includePreviousDue ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                {includePreviousDue && <p className="mt-2 text-[11px] text-warn-700">Included in this estimate's total. Those {previousDueEstimates.length} earlier estimate{previousDueEstimates.length !== 1 ? "s" : ""} will be marked Paid once this one is saved.</p>}
              </div>
            )}
            <div className="space-y-1 rounded-xl bg-paper px-4 py-3">
              {type === "estimate" && (
                <div className="flex items-center justify-between text-xs font-semibold text-ink/50"><span>Items subtotal</span><span>{itemsSubtotal.toFixed(2)}</span></div>
              )}
              {type === "estimate" && (Number(freightCost || 0) > 0 || Number(labourCost || 0) > 0 || previousDue > 0) && (
                <>
                  {Number(freightCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Freight</span><span>{Number(freightCost).toFixed(2)}</span></div>}
                  {Number(labourCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Labour</span><span>{Number(labourCost).toFixed(2)}</span></div>}
                  {previousDue > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Previous due</span><span>{previousDue.toFixed(2)}</span></div>}
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink/50">Total</span>
                <span className="font-display text-lg font-bold text-ink">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={handleSaveClick}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">{isEditing ? "Save changes" : `Save ${type}`}</button>
        </div>
      </div>
      {rateEditIndex !== null && (() => {
        const ln = lines[rateEditIndex];
        const it = itemById(ln.itemId);
        return (
          <RateEditPopup
            itemName={it?.name || "Item"}
            listPrice={it?.price || 0}
            rate={ln.rate}
            onCancel={() => setRateEditIndex(null)}
            onReset={() => { updateLine(rateEditIndex, { rate: it?.price || 0 }); setRateEditIndex(null); }}
            onSave={(newRate: number) => { updateLine(rateEditIndex, { rate: newRate }); setRateEditIndex(null); }}
          />
        );
      })()}
      {pendingSave && (
        <StatusChoicePopup
          total={pendingSave.total}
          currency=""
          onChoose={(status: string, isAdvanceBooking: boolean) => { onSave({ ...pendingSave, status, isAdvanceBooking }); setPendingSave(null); }}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </div>
  );
}
