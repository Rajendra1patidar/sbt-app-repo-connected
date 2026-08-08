import React, { useRef, useState } from "react";
import { ArrowUp, Check, Sparkles, X } from "lucide-react";
import { parseCapture, actionFromAiResult, CaptureAction, MatchCandidate } from "../../lib/captureParser";
import { fmtMoney, today } from "../../lib/format";
import { api } from "../../lib/api";
import { useAppStore } from "../../store/useAppStore";

const CHIPS = [
  { label: "Sold cement", fill: "Sold 40 bags OPC Cement to " },
  { label: "Received saria", fill: "Received 2 12mm Saria from " },
  { label: "Logged payment", fill: "Logged payment of ₹ from " },
  { label: "Logged expense", fill: "Logged expense of ₹ for " },
  { label: "New estimate", fill: "New estimate for " },
  { label: "Add customer", fill: "Add customer " },
];

// Kinds that get a preview-and-confirm step before anything is written.
type PendingAction = Extract<CaptureAction, { kind: "sale" | "purchase" | "payment" | "expense" | "add_customer" }>;
const PREVIEWABLE: PendingAction["kind"][] = ["sale", "purchase", "payment", "expense", "add_customer"];

/* ---- Undo helpers for the capture bar's toast ----
 * These call the API directly and patch the store's state by hand, rather
 * than going through removeDoc/removePurchase/removePayment/removeCustomer —
 * those go through confirmThenDelete (a confirmation modal) and/or their own
 * 5s optimistic-delete-with-undo window, which is the right UX for a
 * deliberate delete elsewhere in the app but wrong here: this is a single
 * "oops, undo that" click within the capture bar's own toast window right
 * after creation, so it should just happen — no second confirmation, no
 * second undo-of-the-undo. Best-effort: if the delete call fails, the
 * record simply stays, same as if any other delete failed. */

async function undoEstimate(id: string) {
  try {
    const result = await api.documents("estimate").remove(id);
    useAppStore.setState((state: any) => ({
      estimates: state.estimates.map((x: any) => (x.id === id ? result.doc : x)),
      items: result.items || state.items,
    }));
  } catch { /* best-effort */ }
}

async function undoPurchase(id: string) {
  try {
    await api.purchases.remove(id);
    useAppStore.setState((state: any) => ({
      purchases: state.purchases.filter((x: any) => x.id !== id),
      orders: state.orders.filter((x: any) => x.id !== id),
    }));
  } catch { /* best-effort */ }
}

async function undoPayment(id: string) {
  try {
    const result = await api.payments.remove(id);
    useAppStore.setState((state: any) => ({
      payments: state.payments.filter((x: any) => x.id !== id),
      estimates: result?.invoice ? state.estimates.map((x: any) => (x.id === result.invoice.id ? result.invoice : x)) : state.estimates,
    }));
  } catch { /* best-effort */ }
}

async function undoCustomer(id: string) {
  try {
    await api.customers.remove(id);
    useAppStore.setState((state: any) => ({ customers: state.customers.filter((x: any) => x.id !== id) }));
  } catch { /* best-effort */ }
}

async function undoExpense(id: string) {
  try {
    await api.expenses.remove(id);
    useAppStore.setState((state: any) => ({ expenses: state.expenses.filter((x: any) => x.id !== id) }));
  } catch { /* best-effort */ }
}

export function CaptureBar({ items, customers, vendors, currency, saveDocument, savePayment, savePurchase, saveCustomer, saveExpense, openModal, showToast }: any) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  // User's picks when a name matched more than one record — keyed by entity type.
  const [picked, setPicked] = useState<{ item?: any; customer?: any; vendor?: any }>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const fill = (text: string) => {
    setValue(text);
    inputRef.current?.focus();
  };

  const resetAll = () => { setValue(""); setPending(null); setPicked({}); };

  const runImmediate = async (action: CaptureAction) => {
    switch (action.kind) {
      case "new_estimate":
        openModal("estimate", action.customer ? { customerId: action.customer.id } : undefined);
        break;
      case "sale_needs_review":
        showToast(!action.item ? `Couldn't find an item matching "${action.itemName}" — opening a blank estimate` : `Couldn't find a customer matching "${action.customerName}" — opening a blank estimate`);
        openModal("estimate");
        break;
      case "purchase_needs_review":
        showToast(!action.item ? `Couldn't find an item matching "${action.itemName}" — opening Purchases` : `Couldn't find a vendor matching "${action.vendorName}" — opening Purchases`);
        openModal("purchase");
        break;
      case "payment_needs_review":
        showToast(`Couldn't find a customer matching "${action.customerName}" — opening Payments`);
        openModal("payment");
        break;
      default:
        showToast("Couldn't quite parse that — try one of the examples below, or use + New.");
    }
    resetAll();
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || busy || pending) return;
    let action = parseCapture(text, { items, customers, vendors });
    if (action.kind === "unknown") {
      // The regex parser has a fixed vocabulary — anything it can't confidently
      // read falls back to the AI parser (Gemini) before giving up entirely,
      // so unusual phrasing still has a shot at working.
      setBusy(true);
      try {
        const { action: aiResult } = await api.capture.parse(text);
        action = actionFromAiResult(aiResult, { items, customers, vendors });
      } catch (err: any) {
        showToast(err?.message || "Couldn't parse that — try one of the examples below.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (action.kind === "add_customer" && action.existing) {
      showToast(`"${action.existing.name}" already exists — opening their edit form`);
      openModal("customer", { editingCustomer: action.existing });
      resetAll();
      return;
    }
    if (PREVIEWABLE.includes(action.kind as any)) {
      setPending(action as PendingAction);
      return;
    }
    runImmediate(action);
  };

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      switch (pending.kind) {
        case "sale": {
          const item = picked.item ?? pending.item;
          const customer = picked.customer ?? pending.customer;
          const rate = pending.rate ?? (pending.amount ? pending.amount / pending.qty : (item.sellingPrice ?? item.price ?? 0));
          const total = pending.amount ?? rate * pending.qty;
          const doc = await saveDocument("estimate", {
            customerId: customer.id, date: today(), dueDate: today(),
            lines: [{ itemId: item.id, qty: pending.qty, rate }], total, status: "Due",
          });
          showToast(`Estimate created for ${customer.name} · ${fmtMoney(total, currency)}`, doc?.id ? { undo: () => undoEstimate(doc.id), duration: 6000 } : undefined);
          break;
        }
        case "purchase": {
          const item = picked.item ?? pending.item;
          const vendor = picked.vendor ?? pending.vendor;
          const rate = pending.rate ?? item.purchasePrice ?? 0;
          const doc = await savePurchase({ vendorId: vendor.id, itemId: item.id, qty: pending.qty, rate, date: today() });
          showToast(`Purchase recorded from ${vendor.name}`, doc?.id ? { undo: () => undoPurchase(doc.id), duration: 6000 } : undefined);
          break;
        }
        case "payment": {
          const customer = picked.customer ?? pending.customer;
          const doc = await savePayment({ customerId: customer.id, amount: pending.amount, date: today(), method: "Cash" });
          showToast(`Payment of ${fmtMoney(pending.amount, currency)} logged for ${customer.name}`, doc?.id ? { undo: () => undoPayment(doc.id), duration: 6000 } : undefined);
          break;
        }
        case "add_customer": {
          const doc = await saveCustomer({ name: pending.name, location: pending.location || "" });
          // saveCustomer can return undefined (e.g. its own duplicate-name-and-phone
          // check) and already shows its own toast in that case — don't stomp it.
          if (doc?.id) showToast(`Customer "${pending.name}" added`, { undo: () => undoCustomer(doc.id), duration: 6000 });
          break;
        }
        case "expense": {
          const doc = await saveExpense({ category: pending.category, vendor: pending.vendor, amount: pending.amount });
          if (doc?.id) showToast(`Expense of ${fmtMoney(pending.amount, currency)} logged`, { undo: () => undoExpense(doc.id), duration: 6000 });
          break;
        }
      }
      resetAll();
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => { setPending(null); setPicked({}); inputRef.current?.focus(); };

  return (
    <div className="relative overflow-hidden rounded-card bg-sidebar p-5 flex flex-col gap-3.5 shadow-card">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(480px 120px at 15% 0%, rgba(217,80,15,0.16), transparent 70%)" }} />

      {!pending ? (
        <>
          <div className="relative flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#20242c] border border-[#333844] text-white/80">
              <ArrowUp size={14} />
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Sold 50 bags cement to Patel Traders at ₹450 each... or Logged expense of ₹500 for diesel"
              disabled={busy}
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#F5F3EE] placeholder:text-[#6b6f78]"
            />
            <span className={`hidden sm:inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${busy ? "border-orange-500/40 text-orange-300" : "border-[#333844] text-[#7d818a]"}`}>
              {busy ? <><Sparkles size={10} className="animate-pulse" /> thinking…</> : "↵ enter"}
            </span>
          </div>
          <div className="relative flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                onClick={() => fill(c.fill)}
                className="rounded-pill border border-[#2c313b] bg-[#1c2028] px-3 py-1.5 text-[11.5px] text-[#c9cdd6] transition-colors hover:border-orange-500 hover:text-white"
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <PreviewCard
          pending={pending}
          picked={picked}
          setPicked={setPicked}
          currency={currency}
          busy={busy}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

function CandidatePicker({ label, candidates, selected, onPick, nameOf }: { label: string; candidates: MatchCandidate[]; selected: any; onPick: (e: any) => void; nameOf: (e: any) => string }) {
  if (candidates.length <= 1) return null;
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      <span className="text-[10.5px] text-[#7d818a]">Which {label}?</span>
      {candidates.map((c) => {
        const isSelected = (selected ?? candidates[0].entity) === c.entity;
        return (
          <button
            key={c.entity.id}
            onClick={() => onPick(c.entity)}
            className={`rounded-pill border px-2.5 py-1 text-[11px] font-medium transition-colors ${isSelected ? "border-orange-500 bg-orange-500/15 text-white" : "border-[#2c313b] bg-[#1c2028] text-[#c9cdd6] hover:border-[#454b58]"}`}
          >
            {nameOf(c.entity)}
          </button>
        );
      })}
    </div>
  );
}

function PreviewCard({ pending, picked, setPicked, currency, busy, onConfirm, onCancel }: any) {
  let title = "";
  let lines: string[] = [];

  let warning: string | undefined;

  if (pending.kind === "sale") {
    const item = picked.item ?? pending.item;
    const customer = picked.customer ?? pending.customer;
    const rate = pending.rate ?? (pending.amount ? pending.amount / pending.qty : (item.sellingPrice ?? item.price ?? 0));
    const total = pending.amount ?? rate * pending.qty;
    title = "New sale";
    lines = [`${pending.qty} × ${item.name} → ${customer.name}`, `${fmtMoney(total, currency)} · ${fmtMoney(rate, currency)}/unit`];
    warning = pending.priceWarning;
  } else if (pending.kind === "purchase") {
    const item = picked.item ?? pending.item;
    const vendor = picked.vendor ?? pending.vendor;
    const rate = pending.rate ?? item.purchasePrice ?? 0;
    title = "New purchase";
    lines = [`${pending.qty} × ${item.name} ← ${vendor.name}`, rate ? `${fmtMoney(rate, currency)} / unit` : "Rate not specified — will use item default"];
    warning = pending.priceWarning;
  } else if (pending.kind === "payment") {
    const customer = picked.customer ?? pending.customer;
    title = "Payment received";
    lines = [`From ${customer.name}`, fmtMoney(pending.amount, currency)];
  } else if (pending.kind === "expense") {
    title = "New expense";
    lines = [pending.category, `${fmtMoney(pending.amount, currency)}${pending.vendor ? ` · ${pending.vendor}` : ""}`];
  } else if (pending.kind === "add_customer") {
    title = "New customer";
    lines = [pending.name, pending.location || "No location given"];
  }

  return (
    <div className="relative flex flex-col gap-3">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#7d818a] flex items-center gap-1.5">
          {title} — confirm?
          {pending.source === "ai" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold normal-case tracking-normal text-orange-300">
              <Sparkles size={9} /> AI
            </span>
          )}
        </p>
        <p className="mt-1 text-[15px] font-semibold text-white">{lines[0]}</p>
        {lines[1] && <p className="font-mono text-[13px] text-[#c9cdd6]">{lines[1]}</p>}
      </div>

      {warning && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[12px] leading-snug text-amber-300">
          ⚠️ {warning}
        </p>
      )}

      {pending.kind === "sale" && (
        <>
          <CandidatePicker label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <CandidatePicker label="customer" candidates={pending.customerCandidates} selected={picked.customer} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, customer: e }))} />
        </>
      )}
      {pending.kind === "purchase" && (
        <>
          <CandidatePicker label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <CandidatePicker label="vendor" candidates={pending.vendorCandidates} selected={picked.vendor} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, vendor: e }))} />
        </>
      )}
      {pending.kind === "payment" && (
        <CandidatePicker label="customer" candidates={pending.customerCandidates} selected={picked.customer} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, customer: e }))} />
      )}

      <div className="relative flex gap-2 pt-0.5">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-orange-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          <Check size={15} /> {busy ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-pill border border-[#333844] px-4 py-2.5 text-[13px] font-semibold text-[#c9cdd6] hover:border-[#454b58] disabled:opacity-50"
        >
          <X size={15} /> Cancel
        </button>
      </div>
    </div>
  );
}
