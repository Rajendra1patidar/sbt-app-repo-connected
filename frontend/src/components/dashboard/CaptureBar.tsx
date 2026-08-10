import React, { useRef, useState } from "react";
import { ArrowUp, Check, Sparkles, X } from "lucide-react";
import { parseCapture, actionFromAiResult, CaptureAction, MatchCandidate } from "../../lib/captureParser";
import { fmtMoney, today } from "../../lib/format";
import { api } from "../../lib/api";
import { useAppStore } from "../../store/useAppStore";
import { StatusChoicePopup } from "../modals/StatusChoicePopup";

const CHIPS = [
  { label: "Sold cement", fill: "Sold 40 bags OPC Cement to " },
  { label: "Received saria", fill: "Received 2 12mm Saria from " },
  { label: "Logged payment", fill: "Logged payment of ₹ from " },
  { label: "Log return", fill: "Returned 2 12mm Saria from " },
  { label: "Logged expense", fill: "Logged expense of ₹ for " },
  { label: "New estimate", fill: "New estimate for " },
  { label: "Add customer", fill: "Add customer " },
];

// Kinds that get a preview-and-confirm step before anything is written.
type PendingAction = Extract<CaptureAction, { kind: "sale" | "purchase" | "payment" | "return" | "expense" | "add_customer" }>;
const PREVIEWABLE: PendingAction["kind"][] = ["sale", "purchase", "payment", "return", "expense", "add_customer"];

// A "sale" doesn't just get a single preview/confirm — it walks through a
// full invoice: item & customer first, then discount, labour, freight, and
// contractor one at a time, then a final paid/partial/due choice. Each step
// is skippable (a plain "Skip" moves on with 0 / blank), and any value the
// parser already pulled out of the typed sentence (e.g. "...discount 500...")
// pre-fills that step instead of being asked again from scratch.
type SaleWizardStep = "review" | "discount" | "labour" | "freight" | "contractor";
const SALE_STEP_ORDER: SaleWizardStep[] = ["review", "discount", "labour", "freight", "contractor"];
interface SaleExtras { discountAmount?: number; labourCost?: number; freightCost?: number; contractorName?: string }

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

export function CaptureBar({ items, customers, vendors, estimates, currency, saveDocument, savePayment, savePurchase, saveCustomer, saveExpense, saveReturn, openModal, showToast }: any) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  // User's picks when a name matched more than one record — keyed by entity type.
  const [picked, setPicked] = useState<{ item?: any; customer?: any; vendor?: any; doc?: any }>({});
  // Sale-only invoice wizard: which step we're on, the discount/labour/freight/
  // contractor values collected along the way, and whether the final
  // paid/partial/due popup is showing.
  const [saleStep, setSaleStep] = useState<SaleWizardStep>("review");
  const [saleExtras, setSaleExtras] = useState<SaleExtras>({});
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fill = (text: string) => {
    setValue(text);
    inputRef.current?.focus();
  };

  const resetAll = () => {
    setValue(""); setPending(null); setPicked({});
    setSaleStep("review"); setSaleExtras({}); setShowStatusPopup(false);
  };

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
      case "return_needs_review":
        showToast(
          !action.item ? `Couldn't find an item matching "${action.itemName}" — open the customer's estimate to log the return manually.`
          : !action.customer ? `Couldn't find a customer matching "${action.customerName}" — open the customer's estimate to log the return manually.`
          : `No returnable "${action.item.name}" found on an estimate for ${action.customer.name} — open that estimate to log the return manually.`
        );
        break;
      default:
        showToast("Couldn't quite parse that — try one of the examples below, or use + New.");
    }
    resetAll();
  };

  const NEEDS_AI_FALLBACK = new Set(["unknown", "sale_needs_review", "purchase_needs_review", "payment_needs_review", "return_needs_review"]);

  const submit = async () => {
    const text = value.trim();
    if (!text || busy || pending) return;
    let action = parseCapture(text, { items, customers, vendors, estimates });
    if (NEEDS_AI_FALLBACK.has(action.kind)) {
      // The regex parser has a fixed vocabulary and exact-ish name matching —
      // typos, unfamiliar phrasing, or names it can't resolve land here (as a
      // "needs_review" guess or a flat "unknown"). Try the AI parser (Gemini)
      // before falling back to opening a blank form, so unusual phrasing or a
      // misspelled name still has a shot at resolving correctly.
      setBusy(true);
      try {
        const { action: aiResult } = await api.capture.parse(text);
        const resolved = actionFromAiResult(aiResult, { items, customers, vendors, estimates });
        // Keep the AI's read whenever it managed to produce anything at all —
        // even a "needs_review" from AI usually has a better fuzzy-matched
        // guess at the name than the regex parser's stricter matching did.
        // Only fall back to the regex parser's own guess if AI drew a total
        // blank too.
        if (resolved.kind !== "unknown") action = resolved;
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
      const p = action as PendingAction;
      setPending(p);
      // Pre-fill the invoice wizard with anything the typed sentence already
      // gave us (e.g. "...discount 500 labour 200...") so those steps just
      // need a tap to confirm instead of being re-typed.
      if (p.kind === "sale") {
        setSaleExtras({
          discountAmount: p.discountAmount, labourCost: p.labourCost,
          freightCost: p.freightCost, contractorName: p.contractorName,
        });
      }
      return;
    }
    runImmediate(action);
  };

  // Shared math for the sale wizard — used both by the live step previews
  // and by the final save, so what the person sees while stepping through
  // is exactly what gets written.
  const saleTotals = () => {
    if (pending?.kind !== "sale") return null;
    const item = picked.item ?? pending.item;
    const customer = picked.customer ?? pending.customer;
    const rate = pending.rate ?? (pending.amount ? pending.amount / pending.qty : (item.sellingPrice ?? item.price ?? 0));
    const subtotal = pending.amount ?? rate * pending.qty;
    // Server rejects a discount that exceeds the line's own subtotal — clamp
    // here too so a misheard/misread discount can't silently fail the whole
    // estimate at save time.
    const discountAmount = Math.min(saleExtras.discountAmount ?? 0, subtotal);
    const labourCost = saleExtras.labourCost ?? 0;
    const freightCost = saleExtras.freightCost ?? 0;
    const contractorName = saleExtras.contractorName || "";
    // labour/freight are flat charges on the whole estimate (not the item
    // line) — same total formula the estimate form itself uses.
    const total = (subtotal - discountAmount) + labourCost + freightCost;
    return { item, customer, rate, subtotal, discountAmount, labourCost, freightCost, contractorName, total };
  };

  // Item & customer step confirmed — move into the discount → labour →
  // freight → contractor walk-through instead of saving right away.
  const startSaleWizard = () => setSaleStep("discount");

  const saleStepBack = () => {
    const idx = SALE_STEP_ORDER.indexOf(saleStep);
    if (idx > 0) setSaleStep(SALE_STEP_ORDER[idx - 1]);
  };
  const saleStepNext = () => {
    const idx = SALE_STEP_ORDER.indexOf(saleStep);
    if (idx < SALE_STEP_ORDER.length - 1) setSaleStep(SALE_STEP_ORDER[idx + 1]);
    else setShowStatusPopup(true); // contractor was the last step — ask paid/partial/due
  };

  // Final step: paid in full, partial, due, or an advance booking. Only then
  // does anything actually get written.
  const finalizeSale = async (status: string, isAdvanceBooking: boolean, partialAmountPaid?: number) => {
    const totals = saleTotals();
    if (pending?.kind !== "sale" || !totals || busy) return;
    setBusy(true);
    try {
      const { item, customer, rate, discountAmount, labourCost, freightCost, contractorName, total } = totals;
      const doc = await saveDocument("estimate", {
        customerId: customer.id, date: today(), dueDate: today(),
        lines: [{ itemId: item.id, qty: pending.qty, rate, discountAmount }], total, status,
        labourCost, freightCost, contractorName, isAdvanceBooking,
        ...(partialAmountPaid ? { partialAmountPaid } : {}),
      });
      showToast(`Estimate created for ${customer.name} · ${fmtMoney(total, currency)}`, doc?.id ? { undo: () => undoEstimate(doc.id), duration: 6000 } : undefined);
      resetAll();
    } finally {
      setBusy(false);
      setShowStatusPopup(false);
    }
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
        case "return": {
          const item = picked.item ?? pending.item;
          const doc = picked.doc ?? pending.doc;
          await saveReturn(doc.id, [{ itemId: item.id, qty: pending.qty }]);
          showToast(`Return of ${pending.qty} × ${item.name} recorded against ${doc.number}`, { duration: 6000 });
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

  const cancel = () => {
    setPending(null); setPicked({});
    setSaleStep("review"); setSaleExtras({}); setShowStatusPopup(false);
    inputRef.current?.focus();
  };

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
      ) : pending.kind === "sale" && saleStep !== "review" ? (
        <SaleWizardCard
          step={saleStep}
          extras={saleExtras}
          setExtras={setSaleExtras}
          totals={saleTotals()}
          currency={currency}
          onBack={saleStepBack}
          onNext={saleStepNext}
          onCancel={cancel}
        />
      ) : (
        <PreviewCard
          pending={pending}
          picked={picked}
          setPicked={setPicked}
          currency={currency}
          busy={busy}
          onConfirm={pending.kind === "sale" ? startSaleWizard : confirm}
          onCancel={cancel}
        />
      )}

      {showStatusPopup && (
        <StatusChoicePopup
          total={saleTotals()?.total ?? 0}
          currency={currency}
          onChoose={finalizeSale}
          onCancel={() => setShowStatusPopup(false)}
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
    const subtotal = pending.amount ?? rate * pending.qty;
    const discountAmount = Math.min(pending.discountAmount ?? 0, subtotal);
    const labourCost = pending.labourCost ?? 0;
    const freightCost = pending.freightCost ?? 0;
    const total = (subtotal - discountAmount) + labourCost + freightCost;
    title = "New sale";
    lines = [
      `${pending.qty} × ${item.name} → ${customer.name}`,
      discountAmount > 0
        ? `${fmtMoney(total, currency)} (${fmtMoney(subtotal, currency)} − ${fmtMoney(discountAmount, currency)} discount) · ${fmtMoney(rate, currency)}/unit`
        : `${fmtMoney(total, currency)} · ${fmtMoney(rate, currency)}/unit`,
    ];
    const extras: string[] = [];
    if (labourCost > 0) extras.push(`Labour ${fmtMoney(labourCost, currency)}`);
    if (freightCost > 0) extras.push(`Freight ${fmtMoney(freightCost, currency)}`);
    if (pending.contractorName) extras.push(`Contractor: ${pending.contractorName}`);
    if (extras.length) lines.push(extras.join(" · "));
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
  } else if (pending.kind === "return") {
    const item = picked.item ?? pending.item;
    const doc = picked.doc ?? pending.doc;
    const line = (doc.lines || []).find((l: any) => l.itemId === item.id);
    const refund = (line?.rate || 0) * pending.qty;
    title = "Return items";
    lines = [
      `${pending.qty} × ${item.name} ← ${pending.customer.name}`,
      `${doc.number}${refund > 0 ? ` · Refund ${fmtMoney(refund, currency)}` : ""}`,
    ];
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
          {title} {pending.kind === "sale" ? "— item & customer right?" : "— confirm?"}
          {pending.source === "ai" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold normal-case tracking-normal text-orange-300">
              <Sparkles size={9} /> AI
            </span>
          )}
        </p>
        <p className="mt-1 text-[15px] font-semibold text-white">{lines[0]}</p>
        {lines[1] && <p className="font-mono text-[13px] text-[#c9cdd6]">{lines[1]}</p>}
        {lines[2] && <p className="mt-0.5 text-[12px] text-[#9a9ea8]">{lines[2]}</p>}
      </div>

      {warning && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[12px] leading-snug text-amber-300">
          ⚠️ {warning}
        </p>
      )}

      {pending.kind === "sale" && (
        <>
          <CandidatePicker label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={(e) => e.brand ? `${e.name} (${e.brand})` : e.name} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <CandidatePicker label="customer" candidates={pending.customerCandidates} selected={picked.customer} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, customer: e }))} />
        </>
      )}
      {pending.kind === "purchase" && (
        <>
          <CandidatePicker label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={(e) => e.brand ? `${e.name} (${e.brand})` : e.name} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <CandidatePicker label="vendor" candidates={pending.vendorCandidates} selected={picked.vendor} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, vendor: e }))} />
        </>
      )}
      {pending.kind === "payment" && (
        <CandidatePicker label="customer" candidates={pending.customerCandidates} selected={picked.customer} nameOf={(e) => e.name} onPick={(e) => setPicked((p: any) => ({ ...p, customer: e }))} />
      )}
      {pending.kind === "return" && (
        <>
          <CandidatePicker label="item" candidates={pending.itemCandidates} selected={picked.item} nameOf={(e) => e.brand ? `${e.name} (${e.brand})` : e.name} onPick={(e) => setPicked((p: any) => ({ ...p, item: e }))} />
          <CandidatePicker label="estimate" candidates={pending.docCandidates} selected={picked.doc} nameOf={(e) => e.number} onPick={(e) => setPicked((p: any) => ({ ...p, doc: e }))} />
        </>
      )}

      <div className="relative flex gap-2 pt-0.5">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-orange-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          <Check size={15} /> {busy ? "Saving…" : pending.kind === "sale" ? "Next →" : "Confirm"}
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

const SALE_STEP_META: Record<Exclude<SaleWizardStep, "review">, { title: string; hint: string }> = {
  discount: { title: "Any discount?", hint: "Leave it blank and skip if there isn't one." },
  labour: { title: "Any labour cost?", hint: "A flat labour charge to add on top of the item total." },
  freight: { title: "Any freight / transport cost?", hint: "Delivery or transport charge to add on top." },
  contractor: { title: "Contractor name?", hint: "Who's this job or delivery for — optional." },
};

/** The step-by-step invoice walk-through shown after a "sale" capture's
 *  item & customer are confirmed: discount → labour → freight → contractor,
 *  one question at a time, each skippable. The final paid/partial/due choice
 *  is handled separately by StatusChoicePopup once this card's last step
 *  is passed. */
function SaleWizardCard({ step, extras, setExtras, totals, currency, onBack, onNext, onCancel }: {
  step: Exclude<SaleWizardStep, "review">;
  extras: SaleExtras;
  setExtras: React.Dispatch<React.SetStateAction<SaleExtras>>;
  totals: { item: any; customer: any; subtotal: number; discountAmount: number; labourCost: number; freightCost: number; contractorName: string; total: number } | null;
  currency: string;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const meta = SALE_STEP_META[step];
  const isAmountStep = step === "discount" || step === "labour" || step === "freight";
  const field: "discountAmount" | "labourCost" | "freightCost" | "contractorName" =
    step === "discount" ? "discountAmount" : step === "labour" ? "labourCost" : step === "freight" ? "freightCost" : "contractorName";

  const skip = () => {
    setExtras((e) => ({ ...e, [field]: isAmountStep ? undefined : "" }));
    onNext();
  };

  return (
    <div className="relative flex flex-col gap-3">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#7d818a]">
          Invoice for {totals?.customer?.name} — {meta.title}
        </p>
        <p className="mt-1 text-[12px] text-[#9a9ea8]">{meta.hint}</p>
      </div>

      {totals && (
        <p className="font-mono text-[12px] text-[#7d818a]">
          Running total: <span className="text-[#c9cdd6]">{fmtMoney(totals.total, currency)}</span>
        </p>
      )}

      {isAmountStep ? (
        <div className="flex items-center gap-2">
          <span className="text-[15px] text-[#c9cdd6]">₹</span>
          <input
            type="number" min="0" inputMode="decimal" autoFocus
            value={(extras[field as "discountAmount" | "labourCost" | "freightCost"] as number | undefined) ?? ""}
            onChange={(e) => setExtras((ex) => ({ ...ex, [field]: e.target.value === "" ? undefined : Number(e.target.value) }))}
            onKeyDown={(e) => { if (e.key === "Enter") onNext(); }}
            placeholder="0"
            className="flex-1 rounded-lg border border-[#333844] bg-[#1c2028] px-3 py-2.5 text-[15px] text-white outline-none focus:border-orange-500"
          />
        </div>
      ) : (
        <input
          type="text" autoFocus
          value={(extras.contractorName as string | undefined) ?? ""}
          onChange={(e) => setExtras((ex) => ({ ...ex, contractorName: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") onNext(); }}
          placeholder="Contractor name"
          className="rounded-lg border border-[#333844] bg-[#1c2028] px-3 py-2.5 text-[15px] text-white outline-none focus:border-orange-500"
        />
      )}

      <div className="relative flex gap-2 pt-0.5">
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 rounded-pill border border-[#333844] px-4 py-2.5 text-[13px] font-semibold text-[#c9cdd6] hover:border-[#454b58]"
        >
          Back
        </button>
        <button
          onClick={skip}
          className="flex items-center justify-center gap-1.5 rounded-pill border border-[#333844] px-4 py-2.5 text-[13px] font-semibold text-[#c9cdd6] hover:border-[#454b58]"
        >
          Skip
        </button>
        <button
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-orange-500 py-2.5 text-[13px] font-semibold text-white hover:bg-orange-600"
        >
          <Check size={15} /> {step === "contractor" ? "Continue → payment" : "Continue"}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center justify-center rounded-pill border border-[#333844] px-3 py-2.5 text-[#c9cdd6] hover:border-[#454b58]"
          aria-label="Cancel"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}