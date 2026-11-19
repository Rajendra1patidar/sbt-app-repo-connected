import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { round2 } from "../../lib/format";
import { daysBetween, inr, inrRate, qtyText, shortDate, unitLabel } from "../../lib/money";
import { localToday } from "../../lib/estimates";
import { clearDraft, draftHasContent, loadDraft, saveDraft, type EstimateDraft } from "../../lib/estimateDraft";
import { AddItemSheet, type PickedLine } from "../estimate/AddItemSheet";
import { CustomerPickerSheet } from "../estimate/CustomerPickerSheet";
import { FillFromSentenceSheet, type SentenceLine } from "../estimate/FillFromSentenceSheet";
import { RateEditPopup } from "./RateEditPopup";
import { ChevronLeftIcon, ChevronRightIcon, PersonIcon, PlusIcon, SparkIcon } from "../ui/icons";
import { Avatar, FullSheet, GlassBar, Group, GroupLabel, GroupRow, InsightNote, Pill, PrimaryButton, Segmented, Sheet, StatusChip, Stepper, Switch, TextButton, cx } from "../ui/kit";

/* ---- New estimate ----
 * One form, three small sheets, one review step.
 *
 *   Form    customer → items → optional extras → Review
 *   Add item   search, quantity / rate / discount, (pieces for weight items)
 *   Review  what the customer will see, how they paid, UPI QR, Save and send on WhatsApp
 *
 * Everything the old form enforced still holds: stock across all godowns, pieces for weight
 * items, the credit-limit heads-up, previous balance shown (never added to the total) and the
 * Due / Paid / Partial / Advance payment contract that saveDocument turns into records.
 * The form saves itself as a draft on this device while you work. */

type PaymentChoice = "due" | "paid" | "partial" | "advance";
type Extra = "freight" | "labour" | "contractor" | "destination" | "note";
const EXTRAS: { key: Extra; label: string }[] = [
  { key: "freight", label: "Freight" }, { key: "labour", label: "Labour" }, { key: "contractor", label: "Contractor" },
  { key: "destination", label: "Destination" }, { key: "note", label: "Note" },
];
const PAYMENT_HELP: Record<PaymentChoice, string> = {
  due: "Payment pending.", paid: "Paid in full.", partial: "Paying part now.", advance: "Paid now, collected in batches.",
};

const num = (v: any) => Number(v) || 0;

function predictNumber(estimates: any[]): string {
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const e of estimates || []) {
    const m = String(e.number || "").match(/^(\D*)(\d+)$/);
    if (!m) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1], n, width: m[2].length };
  }
  return best ? `${best.prefix}${String(best.n + 1).padStart(best.width, "0")}` : "";
}

export function EstimateSheet({
  customers, items, godowns, estimates, payments, settings, editingDoc, prefillCustomerId, prefill,
  onClose, onSave, onQuickAddCustomer, onQuickAddItem,
}: any) {
  const isEditing = !!editingDoc;
  const currency = settings?.currency || "₹";
  const activeItems = useMemo(() => items.filter((it: any) => !it.deleted), [items]);
  const itemById = (id: string) => items.find((it: any) => it.id === id);

  /* ---- initial values: editing → capture prefill → saved draft → blank ---- */
  const init = useMemo(() => {
    if (editingDoc) {
      const e = editingDoc;
      return {
        customerId: e.customerId || "", date: String(e.date || "").slice(0, 10) || localToday(), dueDate: String(e.dueDate || "").slice(0, 10) || localToday(),
        lines: (e.lines || []).filter((l: any) => l.itemId).map((l: any) => ({ ...l })), freight: e.freightCost ? String(e.freightCost) : "", labour: e.labourCost ? String(e.labourCost) : "",
        contractorName: e.contractorName || "", destination: e.destination || "", notes: e.notes || "", showPreviousBalance: true,
      };
    }
    if (prefill) {
      const lines = (prefill.lines || []).map((l: any) => {
        const it = items.find((x: any) => x.id === l.itemId);
        return { itemId: l.itemId, qty: l.qty, rate: l.rate ?? it?.sellingPrice ?? 0, discountAmount: l.discountAmount || 0 };
      });
      return {
        customerId: prefill.customerId || "", date: localToday(), dueDate: localToday(), lines,
        freight: prefill.freightCost ? String(prefill.freightCost) : "", labour: prefill.labourCost ? String(prefill.labourCost) : "",
        contractorName: prefill.contractorName || "", destination: "", notes: "", showPreviousBalance: true,
      };
    }
    const d = prefillCustomerId ? null : loadDraft();
    if (d && draftHasContent(d)) {
      return {
        customerId: d.customerId || "", date: d.date || localToday(), dueDate: d.dueDate || localToday(), lines: (d.lines || []).filter((l: any) => items.some((it: any) => it.id === l.itemId && !it.deleted)),
        freight: d.freight || "", labour: d.labour || "", contractorName: d.contractorName || "", destination: d.destination || "", notes: d.notes || "",
        showPreviousBalance: d.showPreviousBalance !== false,
      };
    }
    return { customerId: prefillCustomerId || "", date: localToday(), dueDate: localToday(), lines: [] as any[], freight: "", labour: "", contractorName: "", destination: "", notes: "", showPreviousBalance: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const restoredDraft = useMemo(() => !isEditing && !prefill && !prefillCustomerId && draftHasContent(init as any), [init, isEditing, prefill, prefillCustomerId]);

  const [step, setStep] = useState<"form" | "review">("form");
  const [customerId, setCustomerId] = useState<string>(init.customerId);
  const [date, setDate] = useState<string>(init.date);
  const [dueDate, setDueDate] = useState<string>(init.dueDate);
  const [lines, setLines] = useState<any[]>(init.lines);
  const [freight, setFreight] = useState<string>(init.freight);
  const [labour, setLabour] = useState<string>(init.labour);
  const [contractorName, setContractorName] = useState<string>(init.contractorName);
  const [destination, setDestination] = useState<string>(init.destination);
  const [destinationTouched, setDestinationTouched] = useState<boolean>(!!init.destination);
  const [notes, setNotes] = useState<string>(init.notes);
  const [showPreviousBalance, setShowPreviousBalance] = useState<boolean>(init.showPreviousBalance);
  const [opened, setOpened] = useState<Extra[]>(() => {
    const o: Extra[] = [];
    if (init.freight) o.push("freight");
    if (init.labour) o.push("labour");
    if (init.contractorName) o.push("contractor");
    if (init.destination) o.push("destination");
    if (init.notes) o.push("note");
    return o;
  });

  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("due");
  const [partialAmount, setPartialAmount] = useState("");
  const [qrOn, setQrOn] = useState(true);

  const [pickCustomer, setPickCustomer] = useState(false);
  const [itemSheet, setItemSheet] = useState<{ index: number | null } | null>(null);
  const [sentenceOpen, setSentenceOpen] = useState(false);
  const [rateEditIndex, setRateEditIndex] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState<null | "send" | "only">(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRow, setErrorRow] = useState<number | null>(null);
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(restoredDraft ? Date.now() : null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setError(null); setErrorRow(null); }, [lines, customerId, partialAmount, paymentChoice]);

  const customer = customers.find((c: any) => c.id === customerId);

  // Destination follows the customer's saved location until the person types their own.
  useEffect(() => {
    if (destinationTouched || !customer?.location) return;
    setDestination(customer.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Credit limit: only fetched when the customer has one.
  useEffect(() => {
    if (isEditing || !customerId || customer?.creditLimit == null) { setCustomerOutstanding(null); return; }
    let cancelled = false;
    api.ledger.customerStatement(customerId)
      .then((s: any) => { if (!cancelled) setCustomerOutstanding(Number(s?.closingBalance || 0)); })
      .catch(() => { if (!cancelled) setCustomerOutstanding(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, customerId]);

  /* ---- stock ---- */
  const stockAt = (itm: any, godownId?: string) => {
    if (!itm) return { stock: 0, stockKg: 0 };
    if (!godowns || godowns.length <= 1) return { stock: itm.stock ?? 0, stockKg: itm.stockKg ?? 0 };
    const gid = godownId || godowns.find((g: any) => g.isDefault)?.id || godowns[0]?.id;
    const entry = (itm.stockByGodown || []).find((g: any) => String(g.godownId) === String(gid));
    return { stock: entry?.stock ?? 0, stockKg: entry?.stockKg ?? 0 };
  };

  /* ---- numbers ---- */
  const filledLines = lines.filter((l) => l.itemId);
  const itemCount = filledLines.length;
  const gross = round2(lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0));
  const discountTotal = round2(lines.reduce((s, l) => s + num(l.discountAmount), 0));
  const itemsSubtotal = round2(gross - discountTotal);
  const previousDue = isEditing ? num(editingDoc?.previousDue) : 0;       // OLD bills only
  const total = round2(itemsSubtotal + num(freight) + num(labour) + previousDue);

  const previousDueEstimates = useMemo(
    () => (isEditing ? [] : (estimates || []).filter((e: any) => e.customerId === customerId && e.status !== "Paid")),
    [isEditing, estimates, customerId],
  );
  const previousDueAmount = round2(previousDueEstimates.reduce((s: number, e: any) => s + (num(e.total) - num(e.amountPaid)), 0));
  const previousBalance = showPreviousBalance ? previousDueAmount : 0;     // information on the bill, never in the total

  const owes = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of estimates || []) {
      if (e.status === "Paid") continue;
      m.set(e.customerId, (m.get(e.customerId) || 0) + (num(e.total) - num(e.amountPaid)));
    }
    return m;
  }, [estimates]);

  // "pays in 20 days": how long this customer's paid bills actually took.
  const payingDays = useMemo(() => {
    if (!customerId) return null;
    const paid = (estimates || []).filter((e: any) => e.customerId === customerId && e.status === "Paid" && e.date).slice(0, 12);
    const days: number[] = [];
    for (const e of paid) {
      const dates = (payments || []).filter((p: any) => p.invoiceId === e.id && num(p.amount) > 0).map((p: any) => String(p.date || "").slice(0, 10)).filter(Boolean).sort();
      if (dates.length) days.push(Math.max(0, daysBetween(String(e.date).slice(0, 10), dates[dates.length - 1])));
    }
    if (days.length < 2) return null;
    return Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  }, [customerId, estimates, payments]);

  const partialNum = num(partialAmount);
  const showPaymentPanel = !isEditing;
  const partialValid = paymentChoice !== "partial" || (partialNum > 0 && partialNum < total);
  const balanceAfter = paymentChoice === "paid" || paymentChoice === "advance" ? 0 : paymentChoice === "partial" ? round2(Math.max(total - partialNum, 0)) : total;
  const qrAmount = round2(balanceAfter + previousBalance);
  const upiId = String(settings?.upiId || "").trim();

  const creditLimit = customer?.creditLimit;
  const projectedOutstanding = customerOutstanding != null ? round2(customerOutstanding + total - previousDue) : null;
  const overCreditLimit = !isEditing && customerOutstanding != null && creditLimit != null && projectedOutstanding != null && projectedOutstanding > num(creditLimit);

  const usualItems = useMemo(() => {
    if (!customerId) return [] as any[];
    const counts = new Map<string, number>();
    (estimates || []).filter((e: any) => e.customerId === customerId).forEach((e: any) => {
      (e.lines || []).forEach((ln: any) => { if (ln.itemId) counts.set(ln.itemId, (counts.get(ln.itemId) || 0) + 1); });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id]) => activeItems.find((it: any) => it.id === id)).filter(Boolean) as any[];
  }, [customerId, estimates, activeItems]);
  const usualToAdd = usualItems.filter((it) => !lines.some((l) => l.itemId === it.id));

  // Best sellers overall (last 90 days): ranks equal search matches and fills the empty state.
  const { popularity, popularItems } = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = localToday(cutoff);
    const counts = new Map<string, number>();
    for (const e of estimates || []) {
      if (String(e.date || "").slice(0, 10) < cutoffStr) continue;
      for (const ln of e.lines || []) if (ln.itemId) counts.set(ln.itemId, (counts.get(ln.itemId) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    const norm = new Map<string, number>([...counts].map(([id, c]) => [id, c / max]));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => activeItems.find((it: any) => it.id === id)).filter(Boolean) as any[];
    return { popularity: norm, popularItems: top };
  }, [estimates, activeItems]);

  const knownContractors = useMemo(() => Array.from(new Set((estimates || []).map((e: any) => e.contractorName).filter(Boolean))) as string[], [estimates]);
  const knownDestinations = useMemo(() => Array.from(new Set((estimates || []).map((e: any) => e.destination).filter(Boolean))) as string[], [estimates]);
  const nextNumber = isEditing ? editingDoc?.number : predictNumber(estimates);

  /* ---- draft: saved on this device as you go ---- */
  const snapshot: EstimateDraft = { savedAt: 0, customerId, date, dueDate, lines, freight, labour, contractorName, destination, notes, showPreviousBalance, opened };
  const hasContent = draftHasContent(snapshot);
  const dirty = useMemo(() => {
    if (isEditing) {
      const base = JSON.stringify([init.customerId, init.date, init.dueDate, init.lines, init.freight, init.labour, init.contractorName, init.destination, init.notes]);
      return base !== JSON.stringify([customerId, date, dueDate, lines, freight, labour, contractorName, destination, notes]);
    }
    return hasContent;
  }, [isEditing, init, customerId, date, dueDate, lines, freight, labour, contractorName, destination, notes, hasContent]);

  const firstRun = useRef(true);
  useEffect(() => {
    if (isEditing) return;
    if (firstRun.current) { firstRun.current = false; if (restoredDraft) return; }
    const t = setTimeout(() => {
      if (hasContent) { saveDraft({ ...snapshot, savedAt: Date.now() }); setSavedAt(Date.now()); }
      else { clearDraft(); setSavedAt(null); }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, date, dueDate, lines, freight, labour, contractorName, destination, notes, showPreviousBalance, isEditing]);

  /* ---- line helpers ---- */
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));

  const applyPicked = (picked: PickedLine, replaceIndex: number | null) => {
    setLines((cur) => {
      if (replaceIndex != null) return cur.map((ln, i) => (i === replaceIndex ? { ...ln, ...picked } : ln));
      const at = cur.findIndex((l) => l.itemId === picked.itemId && (l.godownId || "") === (picked.godownId || ""));
      if (at > -1) {
        const prev = cur[at];
        return cur.map((ln, i) => (i === at ? { ...ln, qty: num(prev.qty) + picked.qty, discountAmount: num(prev.discountAmount) + picked.discountAmount, ...(picked.piecesQty ? { piecesQty: num(prev.piecesQty) + picked.piecesQty } : {}) } : ln));
      }
      return [...cur, picked];
    });
  };

  const addUsual = (it: any) => {
    if (it.trackingMode === "weight") { setItemSheet({ index: null }); return; } // needs pieces, so use the sheet
    setLines((cur) => [...cur, { itemId: it.id, qty: 1, rate: it.sellingPrice || 0, discountAmount: 0 }]);
  };

  const applySentence = (found: SentenceLine[]) => {
    setLines((cur) => {
      const next = [...cur];
      for (const f of found) {
        const it = activeItems.find((x: any) => x.id === f.itemId);
        if (!it) continue;
        const at = next.findIndex((l) => l.itemId === f.itemId);
        if (at > -1) next[at] = { ...next[at], qty: num(next[at].qty) + f.qty };
        else next.push({ itemId: f.itemId, qty: f.qty, rate: f.rate ?? it.sellingPrice ?? 0, discountAmount: f.discountAmount || 0 });
      }
      return next;
    });
    setSentenceOpen(false);
  };

  const openExtra = (k: Extra) => setOpened((o) => (o.includes(k) ? o : [...o, k]));

  /* ---- validation (never greyed out silently: tapping Review says what's missing) ---- */
  const findProblem = (): { msg: string; row?: number } | null => {
    if (!customerId) return { msg: "Choose a customer." };
    if (itemCount === 0) return { msg: "Add at least one item." };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln.itemId) continue;
      const it = itemById(ln.itemId);
      const name = it?.name || "Item";
      if (!(num(ln.qty) > 0)) return { msg: `${name}: enter a quantity.`, row: i };
      if (it?.trackingMode === "weight" && !(num(ln.piecesQty) > 0)) return { msg: `${name}: enter the pieces removed.`, row: i };
    }
    // Total stock across ALL godowns; lines for the same item are summed; when editing,
    // whatever this estimate already took out of stock is available to it again.
    const wanted = new Map<string, { qty: number; pieces: number; row: number }>();
    lines.forEach((ln: any, i: number) => {
      if (!ln.itemId) return;
      const w = wanted.get(ln.itemId) || { qty: 0, pieces: 0, row: i };
      w.qty += num(ln.qty); w.pieces += num(ln.piecesQty);
      wanted.set(ln.itemId, w);
    });
    for (const [itemId, w] of wanted) {
      const it = itemById(itemId);
      if (!it) continue;
      const own = (editingDoc?.lines || []).filter((l: any) => l.itemId === itemId);
      const ownQty = own.reduce((a: number, l: any) => a + num(l.qty), 0);
      const ownPcs = own.reduce((a: number, l: any) => a + num(l.piecesQty), 0);
      if (it.trackingMode === "weight") {
        const haveKg = num(it.stockKg) + ownQty;
        const havePcs = num(it.stock) + ownPcs;
        if (w.qty > haveKg + 0.005) return { msg: `${it.name}: only ${round2(haveKg)} kg in stock across all godowns, you entered ${round2(w.qty)} kg.`, row: w.row };
        if (w.pieces > havePcs + 0.005) return { msg: `${it.name}: only ${round2(havePcs)} pcs in stock across all godowns, you entered ${round2(w.pieces)} pcs.`, row: w.row };
      } else {
        const have = num(it.stock) + ownQty;
        if (w.qty > have + 0.005) return { msg: `${it.name}: only ${round2(have)}${it.unit ? " " + it.unit : ""} in stock across all godowns, you entered ${round2(w.qty)}.`, row: w.row };
      }
    }
    return null;
  };

  const buildPayload = () => ({
    customerId, date, dueDate, lines: lines.filter((l) => l.itemId).map((l) => ({ ...l, qty: num(l.qty), rate: num(l.rate), discountAmount: num(l.discountAmount) })), notes, total,
    freightCost: num(freight), labourCost: num(labour), previousDue,
    previousBalance: isEditing ? num(editingDoc?.previousBalance) : previousBalance,
    contractorName, destination,
    ...(showPaymentPanel ? {
      status: paymentChoice === "paid" || paymentChoice === "advance" ? "Paid" : "Due",
      ...(paymentChoice === "advance" ? { isAdvanceBooking: true } : {}),
      ...(paymentChoice === "partial" && partialNum > 0 ? { partialAmountPaid: partialNum } : {}),
    } : {}),
    ...(isEditing ? { id: editingDoc.id, updatedAt: editingDoc.updatedAt } : {}),
  });

  const goReview = () => {
    const problem = findProblem();
    if (problem) {
      setError(problem.msg);
      setErrorRow(problem.row ?? null);
      setTimeout(() => {
        const el = problem.row != null ? document.getElementById(`line-${problem.row}`) : document.getElementById(!customerId ? "est-customer" : "est-items");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
      return;
    }
    setStep("review");
  };

  // Start straight at Review when the capture bar understood everything exactly once.
  useEffect(() => {
    if (prefill?.startAtReview && !findProblem()) setStep("review");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (send: boolean) => {
    if (saving) return;
    const problem = findProblem();
    if (problem || !partialValid) {
      setStep("form");
      setError(problem?.msg || `Enter a partial amount more than 0 and less than ${inr(total, currency)}.`);
      setErrorRow(problem?.row ?? null);
      return;
    }
    setSaving(send ? "send" : "only");
    try {
      const doc = await onSave(buildPayload(), { send, upiQrAmount: send && qrOn && upiId && qrAmount > 0 ? qrAmount : 0 });
      if (!isEditing && doc) clearDraft();
    } finally {
      setSaving(null);
    }
  };

  const requestClose = () => {
    if (dirty) setConfirmCancel(true);
    else onClose();
  };

  const unitOfLine = (ln: any, it: any) => (it?.trackingMode === "weight" ? "kg" : (it?.unit || "unit"));
  const lineNet = (ln: any) => round2(num(ln.qty) * num(ln.rate) - num(ln.discountAmount));

  /* ================================================================ FORM */
  const form = (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between px-5 pt-3">
        <button type="button" onClick={requestClose} className="h-11 w-16 text-left text-[17px] text-brand-500 active:opacity-60">Cancel</button>
        <div className="text-center">
          <p className="text-[17px] font-semibold leading-5 text-ink">{isEditing ? "Edit estimate" : "New estimate"}</p>
          <p className="font-doc text-[12px] leading-4 text-mute">{nextNumber || "Number assigned on save"}</p>
        </div>
        <span className="w-16 text-right text-micro leading-[14px] text-mute">{!isEditing && savedAt ? <>Draft<br />saved</> : ""}</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-[210px] pt-2">
        {/* Customer */}
        <div id="est-customer">
          <Group>
            <GroupRow onClick={() => setPickCustomer(true)} chevron className="h-[72px]">
              {customer ? (
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-semibold leading-[22px] text-ink">{customer.name}</p>
                    <p className="truncate text-caption text-mute">
                      {(() => {
                        const bits: string[] = [];
                        const owed = owes.get(customer.id) || 0;
                        if (owed > 0) bits.push(`Owes ${inr(owed, currency)}`);
                        if (payingDays != null) bits.push(`pays in ${payingDays} day${payingDays === 1 ? "" : "s"}`);
                        return bits.length ? bits.join(", ") : (customer.location || "No dues");
                      })()}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-brand-500">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100"><PersonIcon size={20} /></span>
                  <span className="text-[17px] font-medium">Choose customer</span>
                </div>
              )}
            </GroupRow>
            {previousDueAmount > 0 && (
              <GroupRow className="min-h-[60px] py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] text-ink">Show previous balance on this bill</p>
                    <p className="text-caption text-mute">{inr(previousDueAmount, currency)}, shown as its own line, not added to the total</p>
                  </div>
                  <Switch checked={showPreviousBalance} onChange={setShowPreviousBalance} label="Show previous balance on this bill" />
                </div>
              </GroupRow>
            )}
            <div className="flex h-[52px] items-center border-t border-line">
              <DateCell label="Date" value={date} onChange={setDate} />
              <span className="h-7 w-px bg-line" />
              <DateCell label="Due" value={dueDate} onChange={setDueDate} />
            </div>
          </Group>
        </div>

        {overCreditLimit && (
          <div className="mt-3 rounded-control bg-bad-50 px-3 py-2.5 text-[14px] leading-[19px] text-bad-600">
            <p className="font-semibold">Over {customer?.name}'s credit limit</p>
            <p>Outstanding would be {inr(projectedOutstanding as number, currency)} against a limit of {inr(creditLimit, currency)}. You can still save this, it's a heads up.</p>
          </div>
        )}

        {/* Items */}
        <div id="est-items" className="mb-1.5 mt-5 flex items-center justify-between px-1">
          <span className="text-caption text-mute">Items ({itemCount})</span>
          <button type="button" onClick={() => setSentenceOpen(true)} className="inline-flex items-center gap-1 text-caption font-medium text-insight-600 active:opacity-60">
            <SparkIcon size={13} /> Fill from a sentence
          </button>
        </div>
        <Group>
          {lines.map((ln, i) => {
            if (!ln.itemId) return null;
            const it = itemById(ln.itemId);
            const isWeight = it?.trackingMode === "weight";
            const st = stockAt(it, ln.godownId);
            const have = isWeight ? st.stockKg : st.stock;
            const over = it && num(ln.qty) > have + 0.005;
            const overPieces = it && isWeight && num(ln.piecesQty) > st.stock + 0.005;
            const overridden = it && num(ln.rate) !== num(it.sellingPrice);
            const missingPieces = isWeight && !(num(ln.piecesQty) > 0);
            const disc = num(ln.discountAmount);
            return (
              <div key={i} id={`line-${i}`} className={cx("border-t border-line px-4 py-3 first:border-t-0", errorRow === i && "bg-bad-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setItemSheet({ index: i })} className="block max-w-full truncate text-left text-[16px] font-medium text-ink">
                      {it?.deleted ? `${it.name} (deleted)` : it?.name || "Item"}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button type="button" onClick={() => setRateEditIndex(i)} className={cx("text-[13px] font-medium tabular-nums", overridden ? "text-warn-700 underline decoration-dotted underline-offset-2" : "text-brand-500")}>
                        {inrRate(num(ln.rate), currency)} a {unitOfLine(ln, it)}
                      </button>
                      {isWeight && !missingPieces && <button type="button" onClick={() => setItemSheet({ index: i })} className="text-caption text-mute">{qtyText(ln.piecesQty)} pcs</button>}
                      {missingPieces && <button type="button" onClick={() => setItemSheet({ index: i })}><StatusChip tone="caution" dot={false} small>Add pieces</StatusChip></button>}
                      {disc > 0 && <StatusChip tone="paid" dot={false} small>Discount {inr(disc, currency)}</StatusChip>}
                      {(over || overPieces) && <StatusChip tone="caution" dot={false} small>Only {qtyText(overPieces ? st.stock : have)}{overPieces ? " pcs" : ""} in stock</StatusChip>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Stepper value={ln.qty} label={it?.name || "item"} decimals={isWeight} onChange={(v) => updateLine(i, { qty: v })} />
                    <span className="text-[13px] tabular-nums text-mute">{inr(lineNet(ln), currency)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <GroupRow onClick={() => setItemSheet({ index: null })} className="h-[52px]">
            <div className="flex items-center gap-2 text-[16px] font-medium text-brand-500"><PlusIcon size={20} /> Add item</div>
          </GroupRow>
        </Group>

        {/* Often sold to */}
        {usualToAdd.length > 0 && (
          <>
            <GroupLabel className="mt-4">Often sold to {customer?.name?.split(" ")[0]}</GroupLabel>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {usualToAdd.map((it) => <Pill key={it.id} onClick={() => addUsual(it)}>{it.name}</Pill>)}
            </div>
          </>
        )}

        {/* Extras */}
        {opened.length > 0 && (
          <Group className="mt-4">
            {opened.includes("freight") && <ExtraRow label="Freight" value={freight} onChange={setFreight} money currency={currency} />}
            {opened.includes("labour") && <ExtraRow label="Labour" value={labour} onChange={setLabour} money currency={currency} />}
            {opened.includes("contractor") && <ExtraRow label="Contractor" value={contractorName} onChange={setContractorName} list="est-contractors" options={knownContractors} placeholder="Name" />}
            {opened.includes("destination") && <ExtraRow label="Destination" value={destination} onChange={(v) => { setDestination(v); setDestinationTouched(true); }} list="est-destinations" options={knownDestinations} placeholder="Place or area" />}
            {opened.includes("note") && <ExtraRow label="Note" value={notes} onChange={setNotes} placeholder="Optional" wide />}
          </Group>
        )}
        {EXTRAS.some((e) => !opened.includes(e.key)) && (
          <>
            <GroupLabel className="mt-4">Add to this estimate</GroupLabel>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {EXTRAS.filter((e) => !opened.includes(e.key)).map((e) => <Pill key={e.key} onClick={() => openExtra(e.key)}>{e.label}</Pill>)}
            </div>
          </>
        )}
        {prefill?.note && <p className="mt-4 rounded-control bg-warn-50 px-3 py-2.5 text-[14px] leading-[19px] text-warn-700">{prefill.note}</p>}
      </div>

      {/* Total + Review */}
      <GlassBar className="absolute inset-x-0 bottom-0 px-5 pt-3" >
        <div style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
          {error && <p role="alert" className="mb-2 text-[14px] font-medium leading-[19px] text-bad-500">{error}</p>}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-micro text-mute">Total</p>
              <p className="text-[32px] font-light leading-9 tracking-[-0.03em] tabular-nums text-ink">{inr(total, currency)}</p>
              <p className="text-micro leading-4 text-mute">
                {previousBalance > 0 ? `Previous balance ${inr(previousBalance, currency)} shown on the bill` : discountTotal > 0 ? `Includes ${inr(discountTotal, currency)} discount` : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
              </p>
            </div>
            <PrimaryButton full={false} className="w-[168px] shrink-0" onClick={goReview}>Review</PrimaryButton>
          </div>
        </div>
      </GlassBar>
    </>
  );

  /* ================================================================ REVIEW */
  const review = (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between px-5 pt-3">
        <button type="button" onClick={() => setStep("form")} className="flex h-11 w-16 items-center text-[17px] text-brand-500 active:opacity-60"><ChevronLeftIcon size={20} />Edit</button>
        <span className="text-[17px] font-semibold text-ink">Review</span>
        <span className="w-16" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[170px] pt-2">
        <Group>
          <div className="px-4 pb-2.5 pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[20px] font-semibold text-ink">{customer?.name || "Customer"}</span>
              <span className="shrink-0 font-doc text-[12px] text-mute">{nextNumber}</span>
            </div>
            <p className="text-caption text-mute">{longDate(date)}, {dueText(dueDate)}</p>
          </div>
          {filledLines.map((ln, i) => {
            const it = itemById(ln.itemId);
            return (
              <div key={i} className="flex h-9 items-center justify-between gap-3 border-t border-line px-4 text-[15px]">
                <span className="min-w-0 truncate text-ink">{it?.name}, {qtyText(ln.qty)} {unitLabel(it, num(ln.qty))}</span>
                <span className="shrink-0 tabular-nums text-ink">{inr(lineNet(ln), currency)}</span>
              </div>
            );
          })}
          <SumRow className="mt-1.5" label="Items" value={inr(gross, currency)} />
          {discountTotal > 0 && <SumRow label="Discount" value={`−${inr(discountTotal, currency)}`} tone="gain" />}
          {num(freight) > 0 && <SumRow label="Freight" value={inr(num(freight), currency)} />}
          {num(labour) > 0 && <SumRow label="Labour" value={inr(num(labour), currency)} />}
          {previousDue > 0 && <SumRow label="Previous due" value={inr(previousDue, currency)} />}
          <div className="flex h-[72px] items-center justify-between border-t border-line px-4">
            <span className="text-[15px] font-semibold text-ink">Total</span>
            <span className="text-[40px] font-light leading-none tracking-[-0.03em] tabular-nums text-ink">{inr(total, currency)}</span>
          </div>
          {previousBalance > 0 && (
            <>
              <SumRow label="Previous balance" value={inr(previousBalance, currency)} />
              <div className="flex h-10 items-center justify-between border-t border-line px-4 text-[15px] font-medium text-ink"><span>Total with previous balance</span><span className="tabular-nums">{inr(total + previousBalance, currency)}</span></div>
            </>
          )}
        </Group>

        {showPaymentPanel ? (
          <>
            <GroupLabel className="mt-4">Payment</GroupLabel>
            <Segmented ariaLabel="Payment" options={[{ value: "due", label: "Due" }, { value: "paid", label: "Paid" }, { value: "partial", label: "Partial" }, { value: "advance", label: "Advance" }]} value={paymentChoice} onChange={(v) => setPaymentChoice(v as PaymentChoice)} />
            <p className="mt-1.5 px-1 text-micro text-mute">{PAYMENT_HELP[paymentChoice]}</p>
            {paymentChoice === "partial" && (
              <Group className="mt-2.5">
                <label className="flex h-16 items-center justify-between gap-3 px-4">
                  <span className="text-[16px] text-ink">Received now</span>
                  <span className="flex items-baseline justify-end text-[28px] font-light tabular-nums text-ink">
                    <span>{currency}</span>
                    <input value={groupDigits(partialAmount)} inputMode="decimal" autoFocus aria-label="Amount received now" placeholder="0"
                      onChange={(e) => setPartialAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      style={{ width: `${Math.max(2, groupDigits(partialAmount).length + 0.5)}ch` }}
                      className="min-w-[2ch] max-w-[160px] bg-transparent text-right outline-none placeholder:text-faint" />
                  </span>
                </label>
                <div className="flex h-12 items-center justify-between border-t border-line px-4">
                  <span className="text-[15px] text-mute">Balance due after saving</span>
                  <span className="text-[17px] font-semibold tabular-nums text-ink">{inr(balanceAfter, currency)}</span>
                </div>
              </Group>
            )}
            {paymentChoice === "partial" && partialAmount !== "" && !partialValid && (
              <p className="mt-1.5 px-1 text-micro text-bad-500">Enter an amount more than 0 and less than {inr(total, currency)}.</p>
            )}
            {qrAmount > 0 && upiId && (
              <div className="mt-3 flex items-center gap-2.5 rounded-group border border-insight-200 bg-insight-50 px-3.5 py-2.5 text-[14px] leading-[19px] text-insight-700">
                <SparkIcon size={16} className="text-insight-500" />
                <span className="flex-1">Add your UPI QR for {inr(qrAmount, currency)} to the bill</span>
                <Switch tone="insight" checked={qrOn} onChange={setQrOn} label="Add UPI QR to the bill" />
              </div>
            )}
            {qrAmount > 0 && !upiId && (
              <InsightNote className="mt-3">Add your UPI ID in Settings and bills can carry a payment QR.</InsightNote>
            )}
          </>
        ) : (
          <p className="mt-4 px-1 text-[14px] leading-5 text-mute">Editing keeps this estimate's payment status. Record any payment from the estimate itself.</p>
        )}
        {error && <p role="alert" className="mt-3 text-[14px] font-medium text-bad-500">{error}</p>}
      </div>

      <GlassBar className="absolute inset-x-0 bottom-0 px-5 pt-3">
        <div style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)" }}>
          {showPaymentPanel ? (
            <>
              <PrimaryButton disabled={!!saving} onClick={() => save(true)}>{saving === "send" ? "Saving…" : "Save and send on WhatsApp"}</PrimaryButton>
              <div className="mt-1 flex justify-center"><TextButton disabled={!!saving} onClick={() => save(false)}>{saving === "only" ? "Saving…" : "Save only"}</TextButton></div>
            </>
          ) : (
            <>
              <PrimaryButton disabled={!!saving} onClick={() => save(false)}>{saving ? "Saving…" : "Save changes"}</PrimaryButton>
              <div className="mt-1 flex justify-center"><TextButton disabled={!!saving} onClick={() => setStep("form")}>Back to edit</TextButton></div>
            </>
          )}
        </div>
      </GlassBar>
    </>
  );

  const editingLine = itemSheet?.index != null ? lines[itemSheet.index] : null;
  const rateLine = rateEditIndex != null ? lines[rateEditIndex] : null;
  const rateItem = rateLine ? itemById(rateLine.itemId) : null;

  return (
    <FullSheet label={isEditing ? "Edit estimate" : "New estimate"} onClose={requestClose}>
      {step === "form" ? form : review}

      <datalist id="est-contractors">{knownContractors.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="est-destinations">{knownDestinations.map((n) => <option key={n} value={n} />)}</datalist>

      {pickCustomer && (
        <CustomerPickerSheet customers={customers.filter((c: any) => !c.archived || c.id === customerId)} owes={owes} selectedId={customerId} currency={currency} onQuickAddCustomer={onQuickAddCustomer}
          onClose={() => setPickCustomer(false)} onPick={(c: any) => { setCustomerId(c.id); setPickCustomer(false); }} />
      )}

      {itemSheet && (
        <AddItemSheet items={activeItems.concat(editingLine ? items.filter((i: any) => i.deleted && i.id === editingLine.itemId) : [])} godowns={godowns || []} lines={lines} usualItems={usualItems} popularItems={popularItems} popularity={popularity} customerName={customer?.name?.split(" ")[0]}
          editIndex={itemSheet.index} stockAt={stockAt} onQuickAddItem={onQuickAddItem}
          onClose={() => setItemSheet(null)} onAdd={applyPicked} onRemove={removeLine} />
      )}

      {sentenceOpen && (
        <FillFromSentenceSheet items={activeItems} vendors={[]} estimates={estimates} customerName={customer?.name} onClose={() => setSentenceOpen(false)} onApply={applySentence} />
      )}

      {rateLine && rateItem && rateEditIndex != null && (
        <RateEditPopup itemName={rateItem.name} listPrice={rateItem.sellingPrice || 0} rate={rateLine.rate}
          onCancel={() => setRateEditIndex(null)}
          onReset={() => { updateLine(rateEditIndex, { rate: rateItem.sellingPrice || 0 }); setRateEditIndex(null); }}
          onSave={(v: number) => { updateLine(rateEditIndex, { rate: v }); setRateEditIndex(null); }} />
      )}

      {confirmCancel && (
        <Sheet z={70} onClose={() => setConfirmCancel(false)} title={isEditing ? "Discard changes?" : "Keep this draft?"}
          footer={
            <div className="space-y-2">
              {!isEditing && <PrimaryButton onClick={() => { setConfirmCancel(false); onClose(); }}>Keep draft</PrimaryButton>}
              {isEditing && <PrimaryButton onClick={() => setConfirmCancel(false)}>Keep editing</PrimaryButton>}
              <button type="button" onClick={() => { if (!isEditing) clearDraft(); setConfirmCancel(false); onClose(); }} className="h-12 w-full rounded-[14px] border border-rule text-[16px] font-semibold text-bad-500 active:scale-[0.985]">
                {isEditing ? "Discard changes" : "Discard draft"}
              </button>
              {!isEditing && <div className="flex justify-center"><TextButton tone="quiet" onClick={() => setConfirmCancel(false)}>Keep editing</TextButton></div>}
            </div>
          }>
          <p className="-mt-1 mb-2 text-[15px] leading-[21px] text-mute">
            {isEditing ? "Your changes to this estimate haven't been saved." : "It stays on this device, and you'll find it at the top of Estimates."}
          </p>
        </Sheet>
      )}
    </FullSheet>
  );
}

/* ---- small pieces ---- */

/** 1234567 → 12,34,567 while typing; keeps a trailing "." and any decimals as typed. */
function groupDigits(raw: string): string {
  if (!raw) return "";
  const [int, dec] = raw.split(".");
  const grouped = Number(int || 0).toLocaleString("en-IN");
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

function longDate(d: string): string {
  const date = new Date(`${d}T00:00:00`);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function dueText(d: string): string {
  const t = localToday();
  if (d === t) return "due today";
  return d > t ? `due ${shortDate(d)}` : `was due ${shortDate(d)}`;
}

function SumRow({ label, value, tone, className }: { label: string; value: string; tone?: "gain"; className?: string }) {
  return (
    <div className={cx("flex h-9 items-center justify-between border-t border-line px-4 text-[15px]", tone === "gain" ? "text-good-500" : "text-mute", className)}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

/** "Date  28 Oct" — the value is the tappable part; a transparent native date input sits over it. */
function DateCell({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = localToday();
  const text = value === t ? "Today" : shortDate(value);
  return (
    <div className="relative flex h-full flex-1 items-center justify-between px-4">
      <span className="text-[16px] text-ink">{label}</span>
      <span className="text-[16px] font-medium text-brand-500">{text}</span>
      <input type="date" value={value} aria-label={`${label} date`} onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch { /* ignore */ } }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </div>
  );
}

function ExtraRow({ label, value, onChange, money, currency, list, options, placeholder, wide }: {
  label: string; value: string; onChange: (v: string) => void; money?: boolean; currency?: string; list?: string; options?: string[]; placeholder?: string; wide?: boolean;
}) {
  return (
    <label className="flex h-[52px] items-center justify-between gap-3 border-t border-line px-4 first:border-t-0">
      <span className="shrink-0 text-[16px] text-ink">{label}</span>
      <span className="flex min-w-0 flex-1 items-baseline justify-end gap-1">
        {money && <span className="text-[16px] text-mute">{currency}</span>}
        <input
          value={value} list={list} placeholder={placeholder || "0"} aria-label={label} inputMode={money ? "decimal" : "text"}
          onChange={(e) => onChange(money ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value)}
          className={cx("min-w-0 bg-transparent text-right text-[16px] tabular-nums text-ink outline-none placeholder:text-faint", wide ? "w-full" : "w-[60%]")}
        />
        {options && options.length === 0 && null}
      </span>
    </label>
  );
}
