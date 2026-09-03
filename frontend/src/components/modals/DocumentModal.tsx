import React, { useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { RateEditPopup } from "./RateEditPopup";
import { QuickAddCustomerPopup } from "./QuickAddCustomerPopup";
import { QuickAddItemPopup } from "./QuickAddItemPopup";
import { fmtMoney, today, round2 } from "../../lib/format";
import { InvoiceLine } from "../../types/index";
import { api } from "../../lib/api";

// Payment status is decided here, inline, while the estimate is still being
// built — not in a popup that only appears after Save is tapped. This mirrors
// the same status/isAdvanceBooking/partialAmountPaid contract the old
// StatusChoicePopup produced, so saveDocument() on the store side needed no
// changes: "due" -> Due, "paid" -> Paid, "advance" -> Paid + isAdvanceBooking,
// "partial" -> Due + a partialAmountPaid the store turns into a payment record.
const PAYMENT_CHOICES = [
  { key: "due", label: "Due", desc: "Payment pending" },
  { key: "paid", label: "Paid", desc: "Paid in full" },
  { key: "partial", label: "Partial", desc: "Paying part now" },
  { key: "advance", label: "Advance", desc: "Paid now, collected in batches" },
] as const;

export function DocumentModal({ type, customers, items, godowns, estimates, editingDoc, prefillCustomerId, onClose, onSave, onQuickAddCustomer, onQuickAddItem }: any) {
  const isEditing = !!editingDoc;
  // deleted items shouldn't be pickable for a new line, but an existing line that
  // already references one (from before it was deleted) still needs to resolve
  // correctly, so `items` (full list) stays available for lookups via itemById.
  const activeItems = items.filter((it: any) => !it.deleted);
  const [customerId, setCustomerId] = useState(editingDoc?.customerId || prefillCustomerId || customers[0]?.id || "");
  const [date, setDate] = useState(editingDoc?.date ? String(editingDoc.date).slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editingDoc?.dueDate ? String(editingDoc.dueDate).slice(0, 10) : today());
  const [lines, setLines] = useState<InvoiceLine[]>(editingDoc?.lines?.length ? editingDoc.lines.map((ln: InvoiceLine) => ({ ...ln })) : [{ itemId: "", qty: 1, rate: 0, discountAmount: 0 }]);
  const [notes, setNotes] = useState(editingDoc?.notes || "");
  const [rateEditIndex, setRateEditIndex] = useState<number | null>(null);
  const [freightCost, setFreightCost] = useState(editingDoc?.freightCost ? String(editingDoc.freightCost) : "");
  const [labourCost, setLabourCost] = useState(editingDoc?.labourCost ? String(editingDoc.labourCost) : "");
  const [includePreviousDue, setIncludePreviousDue] = useState(!isEditing);
  const [contractorName, setContractorName] = useState(editingDoc?.contractorName || "");
  const [destination, setDestination] = useState(editingDoc?.destination || "");
  const [destinationTouched, setDestinationTouched] = useState(!!editingDoc?.destination);
  const [saving, setSaving] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null);
  // payment status is only decided at creation — edits keep the document's
  // existing status untouched, same as the previous popup-based flow
  const [paymentChoice, setPaymentChoice] = useState<typeof PAYMENT_CHOICES[number]["key"]>("due");
  const [partialAmount, setPartialAmount] = useState("");

  useEffect(() => {
    if (type !== "estimate" || destinationTouched) return;
    const customer = customers.find((c: any) => c.id === customerId);
    if (customer?.location) setDestination(customer.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (type !== "estimate" || isEditing || !customerId) { setCustomerOutstanding(null); return; }
    const customer = customers.find((c: any) => c.id === customerId);
    if (customer?.creditLimit == null) { setCustomerOutstanding(null); return; }
    let cancelled = false;
    api.ledger.customerStatement(customerId)
      .then((s: any) => { if (!cancelled) setCustomerOutstanding(Number(s?.closingBalance || 0)); })
      .catch(() => { if (!cancelled) setCustomerOutstanding(null); });
    return () => { cancelled = true; };
  }, [type, isEditing, customerId, customers]);

  const knownContractors = Array.from(new Set((estimates || []).map((e: any) => e.contractorName).filter(Boolean))) as string[];
  const knownDestinations = Array.from(new Set((estimates || []).map((e: any) => e.destination).filter(Boolean))) as string[];

  const addLine = () => setLines((l) => [...l, { itemId: "", qty: 1, rate: 0, discountAmount: 0 }]);
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((ln, idx) => idx === i ? { ...ln, ...patch } : ln));
  const setLineItem = (i: number, itemId: string) => {
    const it = activeItems.find((it: any) => it.id === itemId);
    updateLine(i, { itemId, rate: it?.sellingPrice || 0 });
  };
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemsGrossSubtotal = round2(lines.reduce((sum, ln) => sum + Number(ln.qty || 0) * Number(ln.rate || 0), 0));
  const itemsDiscountTotal = round2(lines.reduce((sum, ln) => sum + Number(ln.discountAmount || 0), 0));
  const itemsSubtotal = round2(itemsGrossSubtotal - itemsDiscountTotal);

  const previousDueEstimates = type === "estimate" && !isEditing ? (estimates || []).filter((e: any) => e.customerId === customerId && e.status !== "Paid") : [];
  const previousDueAmount = round2(previousDueEstimates.reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0));
  const previousDue = includePreviousDue ? previousDueAmount : 0;

  const total = round2(itemsSubtotal + Number(freightCost || 0) + Number(labourCost || 0) + previousDue);

  const partialNum = Number(partialAmount || 0);
  const showPaymentPanel = type === "estimate" && !isEditing;
  const isPartialChoice = showPaymentPanel && paymentChoice === "partial";
  const partialValid = !isPartialChoice || (partialNum > 0 && partialNum < total);
  const balanceAfter = paymentChoice === "paid" || paymentChoice === "advance" ? 0
    : paymentChoice === "partial" ? round2(Math.max(total - partialNum, 0))
    : total;

  const selectedCustomer = customers.find((c: any) => c.id === customerId);
  const creditLimit = selectedCustomer?.creditLimit;
  const projectedOutstanding = customerOutstanding != null ? round2(customerOutstanding + total - previousDue) : null;
  const overCreditLimit =
    type === "estimate" && !isEditing && customerOutstanding != null && creditLimit != null && projectedOutstanding !== null && projectedOutstanding > Number(creditLimit);

  const titleMap: any = {
    estimate: isEditing ? "Edit Estimate" : "New Estimate",
    challan: isEditing ? "Edit Delivery Challan" : "New Delivery Challan",
  };
  const canSave = customerId && lines.length > 0 && lines.every((l) => l.itemId) &&
    lines.every((l) => { const it = itemById(l.itemId); return it?.trackingMode !== "weight" || Number(l.piecesQty) > 0; }) &&
    partialValid;

  const buildPayload = () => ({
    customerId, date, dueDate, lines, notes, total,
    freightCost: Number(freightCost || 0), labourCost: Number(labourCost || 0), previousDue,
    rolledEstimateIds: includePreviousDue ? previousDueEstimates.map((e: any) => e.id) : [],
    contractorName, destination,
    ...(showPaymentPanel ? {
      status: paymentChoice === "paid" || paymentChoice === "advance" ? "Paid" : "Due",
      ...(paymentChoice === "advance" ? { isAdvanceBooking: true } : {}),
      ...(paymentChoice === "partial" && partialNum > 0 ? { partialAmountPaid: partialNum } : {}),
    } : {}),
    ...(isEditing ? { id: editingDoc.id, updatedAt: editingDoc.updatedAt } : {}),
  });

  const handleQuickAddCustomer = async (v: any) => {
    if (!onQuickAddCustomer) return;
    setAddingCustomer(true);
    try {
      const customer = await onQuickAddCustomer(v);
      if (customer) { setCustomerId(customer.id); setShowAddCustomer(false); }
    } finally {
      setAddingCustomer(false);
    }
  };

  // a newly added item drops straight onto a fresh line rather than requiring
  // the person to add a blank line first and then hunt for it in the picker
  const handleQuickAddItem = async (v: any) => {
    if (!onQuickAddItem) return;
    setAddingItem(true);
    try {
      const item = await onQuickAddItem(v);
      if (item) {
        setLines((l) => [...l, { itemId: item.id, qty: 1, rate: item.sellingPrice || 0, discountAmount: 0 }]);
        setShowAddItem(false);
      }
    } finally {
      setAddingItem(false);
    }
  };

  const handleSaveClick = () => {
    if (!canSave || saving) return;
    setSaving(true);
    Promise.resolve(onSave(buildPayload())).finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">{titleMap[type]}</h3>
            {!isEditing && <p className="mt-0.5 text-xs font-semibold text-ink/40">{editingDoc?.number || "Number assigned on save"}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        {customers.length === 0 && !onQuickAddCustomer ? <p className="text-sm text-ink/50">Add a customer first.</p>
          : activeItems.length === 0 && !onQuickAddItem ? <p className="text-sm text-ink/50">Add an item first.</p>
          : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink/50">Customer *</label>
                  {onQuickAddCustomer && (
                    <button type="button" onClick={() => setShowAddCustomer(true)}
                      className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1.5 pr-3 text-xs font-bold text-brand-700 transition-all duration-150 hover:bg-brand-100 active:scale-95">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"><Plus size={12} /></span>
                      New
                    </button>
                  )}
                </div>
                <SearchableSelect
                  options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Select customer"
                />
              </div>
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

            {type === "estimate" && previousDueAmount > 0 && (
              <div className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-warn-800">Previous due — {fmtMoney(previousDueAmount, "")}</p>
                    <p className="mt-0.5 text-xs text-warn-700">From {previousDueEstimates.length} earlier unpaid estimate{previousDueEstimates.length !== 1 ? "s" : ""}: {previousDueEstimates.map((e: any) => e.number).join(", ")}</p>
                  </div>
                  <button type="button" onClick={() => setIncludePreviousDue((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${includePreviousDue ? "bg-warn-500" : "bg-paper"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-card transition ${includePreviousDue ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                {includePreviousDue && <p className="mt-2 text-[11px] text-warn-700">Included in this estimate's total. Those {previousDueEstimates.length} earlier estimate{previousDueEstimates.length !== 1 ? "s" : ""} will be marked Paid once this one is saved.</p>}
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
              <div className="space-y-2">
                {/* Stock for `item` at `godownId` (falling back to the owner's default
                    godown when no godown is picked yet, matching backend resolveGodownId).
                    With a single godown (or none), item.stock/stockKg IS the whole picture,
                    so we skip the per-location lookup and use those directly. */}
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const isWeight = it?.trackingMode === "weight";
                  const isOverridden = type === "estimate" && it && Number(ln.rate) !== Number(it.sellingPrice);
                  const lineGross = Number(ln.qty || 0) * Number(ln.rate || 0);
                  const lineDiscount = Number(ln.discountAmount || 0);
                  const lineSubtotal = lineGross - lineDiscount;
                  const stockAtLineGodown = (itm: any) => {
                    if (!itm) return { stock: 0, stockKg: 0 };
                    if (!godowns || godowns.length <= 1) return { stock: itm.stock ?? 0, stockKg: itm.stockKg ?? 0 };
                    const gid = ln.godownId || godowns.find((g: any) => g.isDefault)?.id || godowns[0]?.id;
                    const entry = (itm.stockByGodown || []).find((g: any) => String(g.godownId) === String(gid));
                    return { stock: entry?.stock ?? 0, stockKg: entry?.stockKg ?? 0 };
                  };
                  const godownStock = stockAtLineGodown(it);
                  const exceedsStock = it && (isWeight ? Number(ln.qty) > (godownStock.stockKg ?? 0) : Number(ln.qty) > (godownStock.stock ?? 0));
                  const exceedsPieces = it && isWeight && Number(ln.piecesQty || 0) > (godownStock.stock ?? 0);
                  return (
                    <div key={i} className="rounded-xl border border-line bg-paper/60 p-2.5">
                      <div className="mb-2.5 flex items-center gap-2 border-b border-line/70 pb-2.5">
                        <div className="min-w-0 flex-1">
                          <SearchableSelect
                            options={(it?.deleted ? [...activeItems, it] : activeItems).map((opt: any) => {
                              const s = stockAtLineGodown(opt);
                              return {
                                value: opt.id,
                                label: opt.deleted ? `${opt.name} (deleted)` : `${opt.name} (stock: ${opt.trackingMode === "weight" ? `${s.stockKg ?? 0}kg / ${s.stock ?? 0}pc` : s.stock ?? 0})`,
                                keywords: opt.category || "",
                              };
                            })}
                            value={ln.itemId}
                            onChange={(v: string) => setLineItem(i, v)}
                            placeholder="Select item"
                          />
                        </div>
                        {(exceedsStock || exceedsPieces) && <span title="Exceeds stock" className="shrink-0"><AlertTriangle size={14} className="text-warn-500" /></span>}
                        {lines.length > 1 && <button onClick={() => removeLine(i)} className="shrink-0 rounded-full p-1.5 text-bad-500 hover:bg-bad-50"><Trash2 size={15} /></button>}
                      </div>
                      <div className={`grid gap-1.5 ${type === "estimate" ? "grid-cols-4" : "grid-cols-2"}`}>
                        <div>
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">{isWeight ? "Weight (kg)" : "Qty"}</span>
                          <input type="number" min="0.01" step="0.01" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
                        </div>
                        {type === "estimate" && (
                          <div>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">Rate{isWeight ? "/kg" : ""}</span>
                            <button type="button" onClick={() => setRateEditIndex(i)}
                              className={`relative flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-sm font-semibold tabular-nums ${isOverridden ? "border-warn-200 bg-warn-50 text-warn-700" : "border-brand-100 bg-brand-50 text-brand-700"}`}>
                              <span className="truncate">{fmtMoney(Number(ln.rate || 0), "")}</span>
                              <Pencil size={11} className="shrink-0 opacity-70" />
                              {isOverridden && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-warn-500" />}
                            </button>
                          </div>
                        )}
                        {type === "estimate" && (
                          <div>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">Disc.</span>
                            <input
                              type="number" min="0" max={lineGross || undefined} value={ln.discountAmount || ""}
                              onChange={(e) => updateLine(i, { discountAmount: e.target.value })}
                              placeholder="0" className="w-full rounded-lg border border-line px-2 py-1.5 text-sm"
                            />
                          </div>
                        )}
                        <div>
                          <span className="mb-0.5 block text-right text-[10px] font-semibold uppercase tracking-wide text-ink/35">Amount</span>
                          <div className="py-1.5 text-right font-display text-sm font-bold text-ink tabular-nums">{fmtMoney(lineSubtotal, "")}</div>
                        </div>
                      </div>
                      {isWeight && (
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          <div>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">Pieces removed</span>
                            <input type="number" min="1" value={ln.piecesQty ?? ""} onChange={(e) => updateLine(i, { piecesQty: e.target.value })} placeholder="0" className="w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
                          </div>
                          {Number(it?.avgWeightPerPiece) > 0 && (
                            <div className="flex items-end pb-1.5 text-[11px] text-ink/40">
                              avg {Number(it.avgWeightPerPiece).toFixed(2)}kg/pc — expect ~{(Number(it.avgWeightPerPiece) * Number(ln.piecesQty || 0)).toFixed(1)}kg
                            </div>
                          )}
                        </div>
                      )}
                      {godowns && godowns.length > 1 && (
                        <div className="mt-1.5">
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink/35">Dispatch from</span>
                          <select value={ln.godownId || ""} onChange={(e) => updateLine(i, { godownId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm">
                            <option value="">Default godown</option>
                            {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3.5 text-sm font-bold text-brand-600 transition hover:bg-brand-100 hover:border-brand-400 active:scale-[0.98]"
              >
                <Plus size={19} /> Add line
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>

            {overCreditLimit && (
              <div className="rounded-xl border border-bad-200 bg-bad-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-bad-800">Over {selectedCustomer?.name}'s credit limit</p>
                    <p className="mt-0.5 text-xs text-bad-700">
                      Outstanding would be {fmtMoney(projectedOutstanding, "")} against a limit of {fmtMoney(creditLimit, "")}. You can still save this estimate — this is just a heads up.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1 rounded-xl bg-paper px-4 py-3">
              {type === "estimate" && (
                <div className="flex items-center justify-between text-xs font-semibold text-ink/50"><span>Items subtotal</span><span>{itemsGrossSubtotal.toFixed(2)}</span></div>
              )}
              {type === "estimate" && itemsDiscountTotal > 0 && (
                <div className="flex items-center justify-between text-xs text-bad-600"><span>Discount</span><span>-{itemsDiscountTotal.toFixed(2)}</span></div>
              )}
              {type === "estimate" && (Number(freightCost || 0) > 0 || Number(labourCost || 0) > 0 || previousDue > 0) && (
                <>
                  {Number(freightCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Freight</span><span>{Number(freightCost).toFixed(2)}</span></div>}
                  {Number(labourCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Labour</span><span>{Number(labourCost).toFixed(2)}</span></div>}
                  {previousDue > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Previous due</span><span>{previousDue.toFixed(2)}</span></div>}
                </>
              )}
              <div className="flex items-center justify-between border-t border-line/70 mt-1 pt-2">
                <span className="text-sm font-semibold text-ink/50">Total</span>
                <span className="font-display text-lg font-bold text-ink">{total.toFixed(2)}</span>
              </div>
            </div>

            {showPaymentPanel && (
              <div>
                <label className="mb-2 block text-xs font-semibold text-ink/50">Payment status</label>
                <div className="grid grid-cols-4 gap-1.5">
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
                    <label className="mb-1 block text-xs font-semibold text-ink/50">Amount received now</label>
                    <input
                      type="number" min="0" max={total} value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
                    />
                    {partialAmount !== "" && !partialValid && (
                      <p className="mt-1 text-[11px] text-bad-600">Enter an amount more than 0 and less than {fmtMoney(total, "")}.</p>
                    )}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between rounded-xl bg-paper px-4 py-2.5">
                  <span className="text-xs font-semibold text-ink/50">Balance due after saving</span>
                  <span className="font-display text-sm font-bold text-ink">{fmtMoney(balanceAfter, "")}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave || saving} onClick={handleSaveClick}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : isEditing ? "Save changes" : `Save ${type}`}</button>
        </div>
      </div>
      {rateEditIndex !== null && (() => {
        const ln = lines[rateEditIndex];
        const it = itemById(ln.itemId);
        return (
          <RateEditPopup
            itemName={it?.name || "Item"}
            listPrice={it?.sellingPrice || 0}
            rate={ln.rate}
            onCancel={() => setRateEditIndex(null)}
            onReset={() => { updateLine(rateEditIndex, { rate: it?.sellingPrice || 0 }); setRateEditIndex(null); }}
            onSave={(newRate: number) => { updateLine(rateEditIndex, { rate: newRate }); setRateEditIndex(null); }}
          />
        );
      })()}
      {showAddCustomer && (
        <QuickAddCustomerPopup
          saving={addingCustomer}
          onCancel={() => setShowAddCustomer(false)}
          onSave={handleQuickAddCustomer}
        />
      )}
      {showAddItem && (
        <QuickAddItemPopup
          saving={addingItem}
          onCancel={() => setShowAddItem(false)}
          onSave={handleQuickAddItem}
        />
      )}
    </div>
  );
}