import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { RateEditPopup } from "./RateEditPopup";
import { QuickAddCustomerPopup } from "./QuickAddCustomerPopup";
import { QuickAddItemPopup } from "./QuickAddItemPopup";
import { ItemPickerSheet } from "./ItemPickerSheet";
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
  const [customerId, setCustomerId] = useState(editingDoc?.customerId || prefillCustomerId || "");
  const [date, setDate] = useState(editingDoc?.date ? String(editingDoc.date).slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editingDoc?.dueDate ? String(editingDoc.dueDate).slice(0, 10) : today());
  const [lines, setLines] = useState<InvoiceLine[]>(editingDoc?.lines?.length ? editingDoc.lines.map((ln: InvoiceLine) => ({ ...ln })) : []);
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
  const [showPicker, setShowPicker] = useState(false);
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null);
  // payment status is only decided at creation — edits keep the document's
  // existing status untouched, same as the previous popup-based flow
  const [paymentChoice, setPaymentChoice] = useState<typeof PAYMENT_CHOICES[number]["key"]>("due");
  const [partialAmount, setPartialAmount] = useState("");
  // which item row is expanded (-1 = none), and what Save found missing
  const [openIdx, setOpenIdx] = useState<number>(-1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errorRow, setErrorRow] = useState<number | null>(null);

  useEffect(() => { setSaveError(null); setErrorRow(null); }, [lines, customerId, partialAmount]);

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

  // Items picked in the sheet are added in one go. An item already on the
  // estimate gets the picked quantity added to its existing line.
  const addPickedItems = (picked: { itemId: string; qty: number }[]) => {
    const next = [...lines];
    let firstNeedsPieces = -1;
    for (const p of picked) {
      const it = activeItems.find((x: any) => x.id === p.itemId);
      if (!it) continue;
      const at = next.findIndex((l) => l.itemId === p.itemId);
      if (at > -1) {
        next[at] = { ...next[at], qty: Number(next[at].qty || 0) + p.qty };
      } else {
        next.push({ itemId: p.itemId, qty: p.qty, rate: it.sellingPrice || 0, discountAmount: 0 });
        if (it.trackingMode === "weight" && firstNeedsPieces === -1) firstNeedsPieces = next.length - 1;
      }
    }
    setLines(next);
    setOpenIdx(firstNeedsPieces); // weight items still need "pieces removed", so open the first one
    setShowPicker(false);
  };

  // the customer's most-bought items from their earlier estimates, for the picker's quick row
  const usualItems = useMemo(() => {
    if (!customerId) return [];
    const counts = new Map<string, number>();
    (estimates || []).filter((e: any) => e.customerId === customerId).forEach((e: any) => {
      (e.lines || []).forEach((ln: any) => { if (ln.itemId) counts.set(ln.itemId, (counts.get(ln.itemId) || 0) + 1); });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id]) => activeItems.find((it: any) => it.id === id)).filter(Boolean) as any[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, estimates, items]);
  const stockAt = (itm: any, godownId?: string) => {
    if (!itm) return { stock: 0, stockKg: 0 };
    if (!godowns || godowns.length <= 1) return { stock: itm.stock ?? 0, stockKg: itm.stockKg ?? 0 };
    const gid = godownId || godowns.find((g: any) => g.isDefault)?.id || godowns[0]?.id;
    const entry = (itm.stockByGodown || []).find((g: any) => String(g.godownId) === String(gid));
    return { stock: entry?.stock ?? 0, stockKg: entry?.stockKg ?? 0 };
  };
  const searchStockLabel = (it: any) => {
    const s = stockAt(it);
    return it.trackingMode === "weight" ? `stock ${s.stockKg ?? 0}kg / ${s.stock ?? 0}pc` : `stock ${s.stock ?? 0}${it.unit ? " " + it.unit : ""}`;
  };
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((ln, idx) => idx === i ? { ...ln, ...patch } : ln));
  const setLineItem = (i: number, itemId: string) => {
    const it = activeItems.find((it: any) => it.id === itemId);
    updateLine(i, { itemId, rate: it?.sellingPrice || 0 });
  };
  const removeLine = (i: number) => { setLines((l) => l.filter((_, idx) => idx !== i)); setOpenIdx(-1); };
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemsGrossSubtotal = round2(lines.reduce((sum, ln) => sum + Number(ln.qty || 0) * Number(ln.rate || 0), 0));
  const itemsDiscountTotal = round2(lines.reduce((sum, ln) => sum + Number(ln.discountAmount || 0), 0));
  const itemsSubtotal = round2(itemsGrossSubtotal - itemsDiscountTotal);
  const filledLines = lines.filter((l) => l.itemId);
  const itemCount = filledLines.length;
  const totalQty = round2(filledLines.reduce((sum, ln) => sum + Number(ln.qty || 0), 0));

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
  // Save is never greyed out silently: tapping it checks everything and points
  // at the first thing that is missing.
  const findProblem = (): { msg: string; anchor?: string; row?: number } | null => {
    if (!customerId) return { msg: "Select a customer.", anchor: "doc-customer" };
    if (itemCount === 0) return { msg: "Add at least one item using the search bar.", anchor: "doc-items" };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln.itemId) continue; // empty rows are ignored
      const it = itemById(ln.itemId);
      const name = it?.name || "Item";
      if (!(Number(ln.qty) > 0)) return { msg: `Row ${i + 1} (${name}): enter a quantity.`, anchor: `line-${i}`, row: i };
      if (it?.trackingMode === "weight" && !(Number(ln.piecesQty) > 0)) return { msg: `Row ${i + 1} (${name}): enter pieces removed.`, anchor: `line-${i}`, row: i };
    }
    if (type === "estimate") {
      // Total stock across ALL godowns (item.stock / stockKg is the aggregate).
      // Lines for the same item are summed. When editing, whatever this estimate
      // already took out of stock is available to it again.
      const wanted = new Map<string, { qty: number; pieces: number; row: number }>();
      lines.forEach((ln: any, i: number) => {
        if (!ln.itemId) return;
        const w = wanted.get(ln.itemId) || { qty: 0, pieces: 0, row: i };
        w.qty += Number(ln.qty || 0);
        w.pieces += Number(ln.piecesQty || 0);
        wanted.set(ln.itemId, w);
      });
      for (const [itemId, w] of wanted) {
        const it = itemById(itemId);
        if (!it) continue;
        const own = (editingDoc?.lines || []).filter((l: any) => l.itemId === itemId);
        const ownQty = own.reduce((a: number, l: any) => a + Number(l.qty || 0), 0);
        const ownPcs = own.reduce((a: number, l: any) => a + Number(l.piecesQty || 0), 0);
        if (it.trackingMode === "weight") {
          const haveKg = Number(it.stockKg || 0) + ownQty;
          const havePcs = Number(it.stock || 0) + ownPcs;
          if (w.qty > haveKg + 0.005) return { msg: `${it.name}: only ${round2(haveKg)} kg in stock across all godowns, you entered ${round2(w.qty)} kg.`, anchor: `line-${w.row}`, row: w.row };
          if (w.pieces > havePcs + 0.005) return { msg: `${it.name}: only ${round2(havePcs)} pcs in stock across all godowns, you entered ${round2(w.pieces)} pcs.`, anchor: `line-${w.row}`, row: w.row };
        } else {
          const have = Number(it.stock || 0) + ownQty;
          if (w.qty > have + 0.005) return { msg: `${it.name}: only ${round2(have)}${it.unit ? " " + it.unit : ""} in stock across all godowns, you entered ${round2(w.qty)}.`, anchor: `line-${w.row}`, row: w.row };
        }
      }
    }
    if (!partialValid) return { msg: `Enter a partial amount more than 0 and less than ${fmtMoney(total, "")}.`, anchor: "doc-payment" };
    return null;
  };

  const buildPayload = () => ({
    customerId, date, dueDate, lines: lines.filter((l) => l.itemId), notes, total,
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
        setOpenIdx(lines.length);
        setShowAddItem(false);
      }
    } finally {
      setAddingItem(false);
    }
  };

  const handleSaveClick = () => {
    if (saving) return;
    const problem = findProblem();
    if (problem) {
      setSaveError(problem.msg);
      setErrorRow(problem.row ?? null);
      if (problem.row !== undefined) setOpenIdx(problem.row);
      if (problem.anchor) setTimeout(() => document.getElementById(problem.anchor!)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      return;
    }
    setSaving(true);
    Promise.resolve(onSave(buildPayload())).finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4 animate-fade-in">
      <div className="animate-sheet-up w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
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
              <div id="doc-customer" className="col-span-2 sm:col-span-1">
                {/* h-6 on every header row (label-only or label+button) keeps the
                    inputs below them starting at the same y — the "New" pill
                    button is taller than a plain label, so without a matching
                    fixed row height the customer field dropped a few px lower
                    than Date/Due date next to it. */}
                <div className="mb-1 flex h-6 items-center justify-between">
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
                <label className="mb-1 flex h-6 items-center text-xs font-semibold text-ink/50">{type === "challan" ? "Delivery date" : "Date"}</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
              </div>
              {type !== "challan" && (
                <div>
                  <label className="mb-1 flex h-6 items-center text-xs font-semibold text-ink/50">Due date</label>
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

            <div id="doc-items" className="border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold text-ink/50">Items * <span className="font-normal text-ink/40">({itemCount})</span></label>
                {onQuickAddItem && (
                  <button type="button" onClick={() => setShowAddItem(true)}
                    className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1.5 pr-3 text-xs font-bold text-brand-700 transition-all duration-150 hover:bg-brand-100 active:scale-95">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"><Plus size={12} /></span>
                    New item
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setShowPicker(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3 text-sm font-bold text-brand-700 transition hover:bg-brand-100 active:scale-[0.99]">
                <Plus size={18} /> Add items
              </button>
              {lines.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-paper/40">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  if (!ln.itemId) {
                    // an empty row (only possible on an old document) — shown so it can be removed, ignored on save
                    return (
                      <div key={i} id={`line-${i}`} className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 first:border-t-0">
                        <span className="text-xs text-ink/40">Empty row (ignored when saving)</span>
                        <button type="button" onClick={() => removeLine(i)} className="rounded-full p-1.5 text-bad-500 hover:bg-bad-50"><Trash2 size={15} /></button>
                      </div>
                    );
                  }
                  const isWeight = it?.trackingMode === "weight";
                  const isEstimate = type === "estimate";
                  const isOverridden = isEstimate && it && Number(ln.rate) !== Number(it.sellingPrice);
                  const lineGross = Number(ln.qty || 0) * Number(ln.rate || 0);
                  const lineDiscount = Number(ln.discountAmount || 0);
                  const lineSubtotal = lineGross - lineDiscount;
                  const godownStock = stockAt(it, ln.godownId);
                  const exceedsStock = it && (isWeight ? Number(ln.qty) > (godownStock.stockKg ?? 0) : Number(ln.qty) > (godownStock.stock ?? 0));
                  const exceedsPieces = it && isWeight && Number(ln.piecesQty || 0) > (godownStock.stock ?? 0);
                  const isOpen = openIdx === i;
                  const unit = isWeight ? "kg" : (it?.unit || "");
                  const stockText = isWeight ? `${godownStock.stockKg ?? 0}kg` : `${godownStock.stock ?? 0}`;
                  return (
                    <div key={i} id={`line-${i}`} className={`border-t border-line first:border-t-0 ${errorRow === i ? "bg-bad-50" : ""}`}>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => setOpenIdx(isOpen ? -1 : i)} className="min-w-0 text-left">
                          <span className={`flex gap-1.5 ${isOpen ? "flex-wrap items-center" : "items-center"}`}>
                            <span className={`text-sm font-semibold leading-snug text-ink ${isOpen ? "break-words" : "truncate"}`}>{it?.deleted ? `${it.name} (deleted)` : it?.name || "Item"}</span>
                            {(exceedsStock || exceedsPieces) && <span title="Exceeds stock" className="shrink-0"><AlertTriangle size={14} className="text-warn-500" /></span>}
                            {isOverridden && <span className="shrink-0 rounded-full bg-warn-50 px-1.5 py-px text-[10px] font-semibold text-warn-700">rate changed</span>}
                            {isEstimate && lineDiscount > 0 && <span className="shrink-0 rounded-full bg-good-50 px-1.5 py-px text-[10px] font-semibold text-good-700">disc −{fmtMoney(lineDiscount, "")}</span>}
                          </span>
                          <span className="block truncate text-[11.5px] text-ink/50">
                            {Number(ln.qty || 0)} {unit}{isEstimate ? ` × ${fmtMoney(Number(ln.rate || 0), "")}` : ""}{isWeight && Number(ln.piecesQty) > 0 ? ` · ${ln.piecesQty} pcs` : ""} · stock {stockText}
                          </span>
                        </button>
                        <input type="number" inputMode="decimal" min="0.01" step="0.01" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })}
                          aria-label="Quantity" className="h-8 w-14 rounded-lg border border-line bg-card px-1 text-center text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        <div className="min-w-[4rem] text-right font-display text-sm font-bold tabular-nums text-ink">{isEstimate ? fmtMoney(lineSubtotal, "") : ""}</div>
                      </div>
                      {isOpen && (
                        <div className="bg-paper px-3 pb-3 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            {isEstimate && (
                              <div>
                                <span className="mb-0.5 block text-[11px] font-semibold text-ink/40">Rate{isWeight ? " / kg" : ""}</span>
                                <button type="button" onClick={() => setRateEditIndex(i)}
                                  className={`relative flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-sm font-semibold tabular-nums ${isOverridden ? "border-warn-200 bg-warn-50 text-warn-700" : "border-brand-100 bg-brand-50 text-brand-700"}`}>
                                  <span className="truncate">{fmtMoney(Number(ln.rate || 0), "")}</span>
                                  <Pencil size={11} className="shrink-0 opacity-70" />
                                </button>
                              </div>
                            )}
                            {isEstimate && (
                              <div>
                                <span className="mb-0.5 block text-[11px] font-semibold text-ink/40">Discount</span>
                                <input type="number" min="0" max={lineGross || undefined} value={ln.discountAmount || ""}
                                  onChange={(e) => updateLine(i, { discountAmount: e.target.value })}
                                  placeholder="0" className="w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm" />
                              </div>
                            )}
                            {isWeight && (
                              <>
                                <div>
                                  <span className="mb-0.5 block text-[11px] font-semibold text-ink/40">Pieces removed</span>
                                  <input type="number" min="1" value={ln.piecesQty ?? ""} onChange={(e) => updateLine(i, { piecesQty: e.target.value })} placeholder="0" className="w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm" />
                                </div>
                                {Number(it?.avgWeightPerPiece) > 0 && (
                                  <div className="flex items-end pb-1.5 text-[11px] text-ink/40">
                                    avg {Number(it.avgWeightPerPiece).toFixed(2)}kg/pc — expect ~{(Number(it.avgWeightPerPiece) * Number(ln.piecesQty || 0)).toFixed(1)}kg
                                  </div>
                                )}
                              </>
                            )}
                            {godowns && godowns.length > 1 && (
                              <div className="col-span-2">
                                <span className="mb-0.5 block text-[11px] font-semibold text-ink/40">Dispatch from</span>
                                <div className="relative">
                                  <select
                                    value={ln.godownId || godowns.find((g: any) => g.isDefault)?.id || godowns[0]?.id || ""}
                                    onChange={(e) => updateLine(i, { godownId: e.target.value })}
                                    className="w-full appearance-none rounded-lg border border-line bg-card px-2 py-1.5 pr-7 text-sm text-ink focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                  >
                                    {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}{g.isDefault ? " (Default)" : ""}</option>)}
                                  </select>
                                  <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink/40" />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[11px] text-ink/40">{isEstimate && it ? `List rate ${fmtMoney(Number(it.sellingPrice || 0), "")}` : ""}</span>
                            <button type="button" onClick={() => removeLine(i)} className="flex items-center gap-1 text-xs font-semibold text-bad-600"><Trash2 size={13} /> Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* quick totals for the items, right above the contractor name */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
                <span className="truncate text-xs text-brand-700">Qty <b className="font-semibold">{totalQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b></span>
              </div>
              {type === "estimate" && <span className="shrink-0 font-display text-base font-bold tabular-nums text-brand-700">{fmtMoney(itemsSubtotal, "")}</span>}
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
              <div id="doc-payment">
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
        {saveError && <p className="mt-4 rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-700">{saveError}</p>}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={saving} onClick={handleSaveClick}
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
      {showPicker && (
        <ItemPickerSheet
          items={activeItems}
          customerName={selectedCustomer?.name}
          usualItems={usualItems}
          onTheEstimateIds={new Set(lines.map((l) => l.itemId))}
          stockLabel={searchStockLabel}
          onConfirm={addPickedItems}
          onClose={() => setShowPicker(false)}
          onAddNew={onQuickAddItem ? () => { setShowPicker(false); setShowAddItem(true); } : undefined}
        />
      )}
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