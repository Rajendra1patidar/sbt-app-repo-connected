import { useMemo, useRef, useState } from "react";
import { ArrowUpIcon, SparkIcon } from "../ui/icons";
import { Group, GroupRow, PrimaryButton, Sheet, StatusChip, TextButton, cx } from "../ui/kit";
import { parseCapture, actionFromAiResult, type CaptureAction, type MatchCandidate } from "../../lib/captureParser";
import { api } from "../../lib/api";
import { useAppStore } from "../../store/useAppStore";
import { inr, inrRate, qtyText } from "../../lib/money";
import { localToday } from "../../lib/estimates";
import { findDestination } from "../../lib/destinations";

/* ---- Capture bar ----
 * Type a sentence ("Sold 5 bags PPC to Ramesh"), see what the app understood as
 * violet chips, then Review and save. Nothing is written until you confirm.
 *
 *   sale        → opens the estimate form already filled in (straight to Review when
 *                 every name matched exactly once)
 *   everything  → a short confirm sheet (payment, purchase, return, expense, customer)
 *   a screen's name ("ledger") → offers to open it
 */

const EXAMPLES = [
  { label: "Sold cement", fill: "Sold 5 bags PPC to " },
  { label: "Sold saria", fill: "Sold 50 kg 10mm to " },
  { label: "Logged payment", fill: "Logged payment of ₹ from " },
  { label: "Log return", fill: "Returned 2 12mm Saria from " },
  { label: "Logged expense", fill: "Logged expense of ₹ for " },
  { label: "Add customer", fill: "Add customer " },
];

type PendingAction = Extract<CaptureAction, { kind: "purchase" | "payment" | "return" | "expense" | "add_customer" }>;
const CONFIRMABLE = ["purchase", "payment", "return", "expense", "add_customer"];

/* ---- Undo helpers for the confirm toast ----
 * Direct API calls that patch the store by hand: this is a single "oops" within the
 * toast window right after creating something, so no second confirmation is wanted.
 * Best effort: if the delete fails the record simply stays. */
async function undoPurchase(id: string) {
  try {
    await api.purchases.remove(id);
    useAppStore.setState((s: any) => ({ purchases: s.purchases.filter((x: any) => x.id !== id), orders: s.orders.filter((x: any) => x.id !== id) }));
  } catch { /* best effort */ }
}
async function undoPayment(id: string) {
  try {
    const result = await api.payments.remove(id);
    useAppStore.setState((s: any) => ({
      payments: s.payments.filter((x: any) => x.id !== id),
      estimates: result?.invoice ? s.estimates.map((x: any) => (x.id === result.invoice.id ? result.invoice : x)) : s.estimates,
    }));
  } catch { /* best effort */ }
}
async function undoCustomer(id: string) {
  try {
    await api.customers.remove(id);
    useAppStore.setState((s: any) => ({ customers: s.customers.filter((x: any) => x.id !== id) }));
  } catch { /* best effort */ }
}
async function undoExpense(id: string) {
  try {
    await api.expenses.remove(id);
    useAppStore.setState((s: any) => ({ expenses: s.expenses.filter((x: any) => x.id !== id) }));
  } catch { /* best effort */ }
}

/* ---- words ---- */

function unitOf(item: any): string {
  return item?.trackingMode === "weight" ? "kg" : (item?.unit || "pc");
}
function plural(unit: string, qty: number): string {
  if (qty === 1) return unit;
  if (/^(kg|ft|mm|cm|m|g|l|pcs|ton)$/i.test(unit)) return unit;
  if (/(x|s|ch|sh)$/i.test(unit)) return `${unit}es`;
  return `${unit}s`;
}
const nameWithBrand = (e: any) => (e.brand ? `${e.name} (${e.brand})` : e.name);

interface ChipSpec { text: string; muted?: boolean }
interface Understood { chips: ChipSpec[]; caption: string; kind: string }

/** What the app understood so far, as chips. Pure: only reads the parsed action. */
function understand(action: CaptureAction | null, destination: { label: string; tab: string } | null, currency: string): Understood | null {
  if (!action) return null;
  const chips: ChipSpec[] = [];
  const matched = "Matched to your customers and items. Nothing saves until you confirm.";

  switch (action.kind) {
    case "sale": {
      const rate = action.rate ?? (action.amount ? action.amount / action.qty : (action.item.sellingPrice ?? action.item.price ?? 0));
      const subtotal = action.amount ?? rate * action.qty;
      const discount = Math.min(action.discountAmount ?? 0, subtotal);
      const u = unitOf(action.item);
      chips.push({ text: action.customer.name });
      chips.push({ text: `${action.item.name}, ${qtyText(action.qty)} ${plural(u, action.qty)}` });
      chips.push({ text: `${inr(subtotal - discount, currency)} at ${inrRate(rate, currency)} a ${u}` });
      if (discount > 0) chips.push({ text: `${inr(discount, currency)} off` });
      if (action.freightCost) chips.push({ text: `Freight ${inr(action.freightCost, currency)}` });
      if (action.labourCost) chips.push({ text: `Labour ${inr(action.labourCost, currency)}` });
      if (action.contractorName) chips.push({ text: `Contractor ${action.contractorName}` });
      const ambiguous = action.itemCandidates.length > 1 || action.customerCandidates.length > 1;
      return { chips, kind: "sale", caption: ambiguous ? "More than one match — you can change it on the next screen. Nothing saves until you confirm." : matched };
    }
    case "sale_needs_review": {
      if (action.customer) chips.push({ text: action.customer.name }); else if (action.customerName) chips.push({ text: `No customer “${action.customerName}”`, muted: true });
      if (action.item) chips.push({ text: `${action.item.name}, ${qtyText(action.qty)} ${plural(unitOf(action.item), action.qty)}` }); else if (action.itemName) chips.push({ text: `No item “${action.itemName}”`, muted: true });
      return { chips, kind: "sale", caption: "Part of this didn't match. The form opens with what did, and you finish the rest." };
    }
    case "purchase": {
      const rate = action.rate ?? action.item.purchasePrice ?? 0;
      const u = unitOf(action.item);
      chips.push({ text: action.vendor.name });
      chips.push({ text: `${action.item.name}, ${qtyText(action.qty)} ${plural(u, action.qty)}` });
      if (rate) chips.push({ text: `${inrRate(rate, currency)} a ${u}` });
      return { chips, kind: "purchase", caption: matched };
    }
    case "purchase_needs_review": {
      if (action.vendor) chips.push({ text: action.vendor.name }); else if (action.vendorName) chips.push({ text: `No vendor “${action.vendorName}”`, muted: true });
      if (action.item) chips.push({ text: action.item.name }); else if (action.itemName) chips.push({ text: `No item “${action.itemName}”`, muted: true });
      return { chips, kind: "purchase", caption: "Part of this didn't match. Purchases opens so you can finish it." };
    }
    case "payment":
      chips.push({ text: action.customer.name }, { text: inr(action.amount, currency) });
      return { chips, kind: "payment", caption: matched };
    case "payment_needs_review":
      chips.push({ text: `No customer “${action.customerName}”`, muted: true }, { text: inr(action.amount, currency) });
      return { chips, kind: "payment", caption: "Couldn't find that customer. Payments opens so you can pick one." };
    case "return":
      chips.push({ text: action.customer.name }, { text: `${action.item.name}, ${qtyText(action.qty)}` }, { text: action.doc.number });
      return { chips, kind: "return", caption: matched };
    case "return_needs_review":
      if (action.customer) chips.push({ text: action.customer.name });
      if (action.item) chips.push({ text: action.item.name });
      return { chips, kind: "return", caption: "No matching bill found to return against. Open the customer's estimate to log it." };
    case "expense":
      chips.push({ text: action.category }, { text: inr(action.amount, currency) });
      if (action.vendor) chips.push({ text: action.vendor });
      return { chips, kind: "expense", caption: "Logged as an expense. Nothing saves until you confirm." };
    case "new_estimate":
      if (action.customer) chips.push({ text: action.customer.name });
      return { chips, kind: "sale", caption: "Opens a new estimate." };
    case "add_customer":
      chips.push({ text: action.name });
      if (action.location) chips.push({ text: action.location });
      if (action.existing) chips.push({ text: "Already a customer", muted: true });
      return { chips, kind: "customer", caption: action.existing ? "They're already in your customers. Opens their profile to edit." : "Nothing saves until you confirm." };
    default:
      if (destination) {
        return { chips: [{ text: `Open ${destination.label}` }], kind: "go", caption: destination.tab ? `In ${destination.tab}. Press the arrow to open it.` : "Press the arrow to open it." };
      }
      return null;
  }
}

export function CaptureBar({ items, customers, vendors, estimates, currency, role, savePurchase, savePayment, saveCustomer, saveExpense, saveReturn, openModal, showToast, go }: any) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [picked, setPicked] = useState<{ item?: any; customer?: any; vendor?: any; doc?: any }>({});
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx = { items, customers, vendors, estimates };

  // Live read of what's typed — local only, so it costs nothing and never touches the network.
  const live = useMemo(() => {
    const text = value.trim();
    if (text.length < 3) return null;
    let action: CaptureAction | null = null;
    try { action = parseCapture(text, { items, customers, vendors, estimates }); } catch { action = null; }
    const destination = action && action.kind !== "unknown" ? null : findDestination(text, role);
    return { action, destination, understood: understand(action, destination, currency) };
  }, [value, items, customers, vendors, estimates, currency, role]);

  const fill = (text: string) => { setValue(text); inputRef.current?.focus(); };
  const resetAll = () => { setValue(""); setPending(null); setPicked({}); };

  const openEstimateFor = (action: Extract<CaptureAction, { kind: "sale" | "sale_needs_review" | "new_estimate" }>) => {
    if (action.kind === "new_estimate") {
      openModal("estimate", action.customer ? { customerId: action.customer.id } : undefined);
      return;
    }
    const item = action.item, customer = action.customer;
    if (action.kind === "sale_needs_review") {
      showToast(!item ? `Couldn't find an item matching “${action.itemName}” — opening the form with the rest` : `Couldn't find a customer matching “${action.customerName}” — opening the form with the rest`);
    }
    const rate = action.rate ?? (action.amount && action.qty ? action.amount / action.qty : undefined);
    const exact = action.kind === "sale" && action.itemCandidates.length <= 1 && action.customerCandidates.length <= 1 && !action.priceWarning;
    openModal("estimate", {
      prefill: {
        customerId: customer?.id,
        lines: item ? [{ itemId: item.id, qty: action.qty, rate, discountAmount: action.discountAmount || 0 }] : [],
        freightCost: action.freightCost, labourCost: action.labourCost, contractorName: action.contractorName,
        note: action.kind === "sale" ? action.priceWarning : undefined,
        startAtReview: exact,
      },
    });
  };

  const runImmediate = (action: CaptureAction) => {
    switch (action.kind) {
      case "purchase_needs_review":
        showToast(!action.item ? `Couldn't find an item matching “${action.itemName}” — opening Purchases` : `Couldn't find a vendor matching “${action.vendorName}” — opening Purchases`);
        openModal("purchase");
        break;
      case "payment_needs_review":
        showToast(`Couldn't find a customer matching “${action.customerName}” — opening Payments`);
        openModal("payment");
        break;
      case "return_needs_review":
        showToast(
          !action.item ? `Couldn't find an item matching “${action.itemName}” — open the customer's estimate to log the return manually.`
            : !action.customer ? `Couldn't find a customer matching “${action.customerName}” — open the customer's estimate to log the return manually.`
              : `No returnable “${action.item.name}” found on an estimate for ${action.customer.name} — open that estimate to log the return manually.`,
        );
        break;
      default:
        showToast("Couldn't quite parse that — try one of the examples, or the name of a screen.");
    }
    resetAll();
  };

  // Only a total miss is handed to the AI parser; a "needs_review" result is already
  // understood well enough to finish by hand (and the free AI quota is easy to exhaust).
  const submit = async () => {
    const text = value.trim();
    if (!text || busy || pending) return;
    let action = parseCapture(text, { items, customers, vendors, estimates });

    if (action.kind === "unknown") {
      const dest = findDestination(text, role);
      if (dest) { go?.(dest.id); resetAll(); return; }
      setBusy(true);
      try {
        const { action: aiResult } = await api.capture.parse(text);
        const resolved = actionFromAiResult(aiResult, { items, customers, vendors, estimates });
        if (resolved.kind !== "unknown") action = resolved;
      } catch (err: any) {
        showToast(err?.message || "Couldn't parse that — try one of the examples.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    if (action.kind === "add_customer" && action.existing) {
      showToast(`“${action.existing.name}” already exists — opening their edit form`);
      openModal("customer", { editingCustomer: action.existing });
      resetAll();
      return;
    }
    if (action.kind === "sale" || action.kind === "sale_needs_review" || action.kind === "new_estimate") {
      openEstimateFor(action);
      resetAll();
      return;
    }
    if (CONFIRMABLE.includes(action.kind)) { setPending(action as PendingAction); return; }
    runImmediate(action);
  };

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      switch (pending.kind) {
        case "purchase": {
          const item = picked.item ?? pending.item;
          const vendor = picked.vendor ?? pending.vendor;
          const rate = pending.rate ?? item.purchasePrice ?? 0;
          const doc = await savePurchase({ vendorId: vendor.id, itemId: item.id, qty: pending.qty, rate, date: localToday() });
          showToast(`Purchase recorded from ${vendor.name}`, doc?.id ? { undo: () => undoPurchase(doc.id), duration: 6000 } : undefined);
          break;
        }
        case "payment": {
          const customer = picked.customer ?? pending.customer;
          const doc = await savePayment({ customerId: customer.id, amount: pending.amount, date: localToday(), method: "Cash" });
          showToast(`Payment of ${inr(pending.amount, currency)} logged for ${customer.name}`, doc?.id ? { undo: () => undoPayment(doc.id), duration: 6000 } : undefined);
          break;
        }
        case "return": {
          const item = picked.item ?? pending.item;
          const doc = picked.doc ?? pending.doc;
          await saveReturn(doc.id, [{ itemId: item.id, qty: pending.qty }]);
          showToast(`Return of ${pending.qty} × ${item.name} recorded against ${doc.number}`, { duration: 6000 });
          break;
        }
        case "add_customer": {
          const doc = await saveCustomer({ name: pending.name, location: pending.location || "" });
          if (doc?.id) showToast(`Customer “${pending.name}” added`, { undo: () => undoCustomer(doc.id), duration: 6000 });
          break;
        }
        case "expense": {
          const doc = await saveExpense({ category: pending.category, vendor: pending.vendor, amount: pending.amount });
          if (doc?.id) showToast(`Expense of ${inr(pending.amount, currency)} logged`, { undo: () => undoExpense(doc.id), duration: 6000 });
          break;
        }
      }
      resetAll();
    } finally {
      setBusy(false);
    }
  };

  const u = live?.understood;
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <>
      <div className={cx("rounded-[20px] border bg-card px-3 pb-3 pt-2.5 shadow-capture transition-colors", focused ? "border-brand-400" : "border-edge")}>
        <div className="flex h-11 items-center gap-2.5">
          <span className="flex text-insight-500"><SparkIcon size={22} className={busy ? "animate-pulse" : ""} /></span>
          <input
            ref={inputRef} value={value} disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder="Sold 5 bags PPC to Ramesh" enterKeyHint="go" aria-label="Say what happened"
            className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
          />
          <button type="button" aria-label="Review and save" onClick={submit} disabled={!canSubmit}
            className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95", canSubmit ? "bg-brand-500" : "bg-rule")}>
            <ArrowUpIcon size={22} />
          </button>
        </div>

        {u ? (
          <>
            <div className="mb-2.5 mt-1.5 h-px bg-line" />
            <div className="flex flex-wrap gap-1.5">
              {u.chips.map((c, i) => (
                <StatusChip key={`${c.text}-${i}`} tone={c.muted ? "draft" : "insight"} className="animate-chip-in">{c.text}</StatusChip>
              ))}
            </div>
            <p className="mt-2 text-micro text-mute">{u.caption}</p>
          </>
        ) : value.trim().length === 0 ? (
          <>
            <div className="mb-2.5 mt-1.5 h-px bg-line" />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((c) => (
                <button key={c.label} type="button" onClick={() => fill(c.fill)}
                  className="h-7 rounded-[14px] border border-edge px-2.5 text-[12px] font-medium text-mute transition active:scale-95">
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-micro text-mute">Say it the way you would to a helper, or type the name of any screen.</p>
          </>
        ) : value.trim().length >= 3 ? (
          <>
            <div className="mb-2 mt-1.5 h-px bg-line" />
            <p className="text-micro text-mute">I'll read this when you press the arrow. Nothing saves until you confirm.</p>
          </>
        ) : null}
      </div>

      {pending && (
        <ConfirmSheet pending={pending} picked={picked} setPicked={setPicked} currency={currency} busy={busy}
          onConfirm={confirm} onCancel={() => { setPending(null); setPicked({}); inputRef.current?.focus(); }} />
      )}
    </>
  );
}

/* ---- confirm sheet for everything that isn't a sale ---- */

function Which({ label, candidates, selected, onPick, nameOf }: { label: string; candidates: MatchCandidate[]; selected: any; onPick: (e: any) => void; nameOf: (e: any) => string }) {
  if (!candidates || candidates.length <= 1) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 px-1 text-caption text-mute">Which {label}?</p>
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => {
          const isSel = (selected ?? candidates[0].entity) === c.entity;
          return (
            <button key={c.entity.id} type="button" onClick={() => onPick(c.entity)}
              className={cx("h-9 rounded-full border px-3 text-[14px] font-medium transition", isSel ? "border-brand-500 bg-brand-50 text-brand-600" : "border-edge bg-card text-ink")}>
              {nameOf(c.entity)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmSheet({ pending, picked, setPicked, currency, busy, onConfirm, onCancel }: any) {
  let title = "";
  let rows: [string, string][] = [];
  let warning: string | undefined;

  if (pending.kind === "purchase") {
    const item = picked.item ?? pending.item;
    const vendor = picked.vendor ?? pending.vendor;
    const rate = pending.rate ?? item.purchasePrice ?? 0;
    title = "New purchase";
    rows = [["Vendor", vendor.name], ["Item", item.name], ["Quantity", qtyText(pending.qty)], ["Rate", rate ? inr(rate, currency) : "Item's usual price"]];
    warning = pending.priceWarning;
  } else if (pending.kind === "payment") {
    const customer = picked.customer ?? pending.customer;
    title = "Payment received";
    rows = [["From", customer.name], ["Amount", inr(pending.amount, currency)], ["Method", "Cash"]];
  } else if (pending.kind === "return") {
    const item = picked.item ?? pending.item;
    const doc = picked.doc ?? pending.doc;
    const line = (doc.lines || []).find((l: any) => l.itemId === item.id);
    const refund = (line?.rate || 0) * pending.qty;
    title = "Return items";
    rows = [["Customer", pending.customer.name], ["Item", item.name], ["Quantity", qtyText(pending.qty)], ["Against", doc.number], ...(refund > 0 ? [["Refund", inr(refund, currency)] as [string, string]] : [])];
  } else if (pending.kind === "expense") {
    title = "New expense";
    rows = [["Category", pending.category], ["Amount", inr(pending.amount, currency)], ...(pending.vendor ? [["Vendor", pending.vendor] as [string, string]] : [])];
  } else if (pending.kind === "add_customer") {
    title = "New customer";
    rows = [["Name", pending.name], ["Location", pending.location || "Not given"]];
  }

  return (
    <Sheet onClose={onCancel} title={title}
      trailing={pending.source === "ai" ? <StatusChip tone="insight" dot={false}>Read by AI</StatusChip> : undefined}
      footer={
        <div>
          <PrimaryButton onClick={onConfirm} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton>
          <div className="mt-1 flex justify-center"><TextButton tone="quiet" onClick={onCancel} disabled={busy}>Cancel</TextButton></div>
        </div>
      }>
      <Group>
        {rows.map(([k, v]) => (
          <GroupRow key={k} className="h-12">
            <span className="text-[15px] text-mute">{k}</span>
            <span className="text-[16px] font-medium tabular-nums text-ink">{v}</span>
          </GroupRow>
        ))}
      </Group>

      {warning && <p className="mt-3 rounded-control bg-warn-50 px-3 py-2.5 text-[14px] leading-[19px] text-warn-700">{warning}</p>}

      {pending.kind === "purchase" && (
        <>
          <Which label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={nameWithBrand} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <Which label="vendor" candidates={pending.vendorCandidates} selected={picked.vendor} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, vendor: e }))} />
        </>
      )}
      {pending.kind === "payment" && (
        <Which label="customer" candidates={pending.customerCandidates} selected={picked.customer} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, customer: e }))} />
      )}
      {pending.kind === "return" && (
        <>
          <Which label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={nameWithBrand} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <Which label="estimate" candidates={pending.docCandidates} selected={picked.doc} nameOf={(e) => e.number} onPick={(e) => setPicked((p: any) => ({ ...p, doc: e }))} />
        </>
      )}
      <div className="h-2" />
    </Sheet>
  );
}
