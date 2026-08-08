import React, { useRef, useState } from "react";
import { ArrowUp, Check, X } from "lucide-react";
import { parseCapture, CaptureAction, MatchCandidate } from "../../lib/captureParser";
import { fmtMoney, today } from "../../lib/format";

const CHIPS = [
  { label: "Sold cement", fill: "Sold 40 bags OPC Cement to " },
  { label: "Received saria", fill: "Received 2 12mm Saria from " },
  { label: "Logged payment", fill: "Logged payment of ₹ from " },
  { label: "New estimate", fill: "New estimate for " },
  { label: "Add customer", fill: "Add customer " },
];

// Kinds that get a preview-and-confirm step before anything is written.
type PendingAction = Extract<CaptureAction, { kind: "sale" | "purchase" | "payment" | "add_customer" }>;
const PREVIEWABLE: PendingAction["kind"][] = ["sale", "purchase", "payment", "add_customer"];

export function CaptureBar({ items, customers, vendors, currency, saveDocument, savePayment, savePurchase, saveCustomer, openModal, showToast }: any) {
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

  const submit = () => {
    const text = value.trim();
    if (!text || busy || pending) return;
    const action = parseCapture(text, { items, customers, vendors });
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
          const rate = pending.amount ? pending.amount / pending.qty : (item.sellingPrice ?? item.price ?? 0);
          const total = pending.amount ?? rate * pending.qty;
          await saveDocument("estimate", {
            customerId: customer.id, date: today(), dueDate: today(),
            lines: [{ itemId: item.id, qty: pending.qty, rate }], total, status: "Due",
          });
          showToast(`Estimate created for ${customer.name} · ${fmtMoney(total, currency)}`);
          break;
        }
        case "purchase": {
          const item = picked.item ?? pending.item;
          const vendor = picked.vendor ?? pending.vendor;
          const rate = pending.rate ?? item.purchasePrice ?? 0;
          await savePurchase({ vendorId: vendor.id, itemId: item.id, qty: pending.qty, rate, date: today() });
          showToast(`Purchase recorded from ${vendor.name}`);
          break;
        }
        case "payment": {
          const customer = picked.customer ?? pending.customer;
          await savePayment({ customerId: customer.id, amount: pending.amount, date: today(), method: "Cash" });
          showToast(`Payment of ${fmtMoney(pending.amount, currency)} logged for ${customer.name}`);
          break;
        }
        case "add_customer": {
          await saveCustomer({ name: pending.name, location: pending.location || "" });
          showToast(`Customer "${pending.name}" added`);
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
              placeholder="Sold 50 bags cement to Patel Traders, ₹22,500... or Add customer Ramesh Traders, Sarangpur Road"
              disabled={busy}
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#F5F3EE] placeholder:text-[#6b6f78]"
            />
            <span className="hidden sm:inline-block whitespace-nowrap rounded-md border border-[#333844] px-1.5 py-0.5 font-mono text-[10px] text-[#7d818a]">
              ↵ enter
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

  if (pending.kind === "sale") {
    const item = picked.item ?? pending.item;
    const customer = picked.customer ?? pending.customer;
    const rate = pending.amount ? pending.amount / pending.qty : (item.sellingPrice ?? item.price ?? 0);
    const total = pending.amount ?? rate * pending.qty;
    title = "New sale";
    lines = [`${pending.qty} × ${item.name} → ${customer.name}`, fmtMoney(total, currency)];
  } else if (pending.kind === "purchase") {
    const item = picked.item ?? pending.item;
    const vendor = picked.vendor ?? pending.vendor;
    const rate = pending.rate ?? item.purchasePrice ?? 0;
    title = "New purchase";
    lines = [`${pending.qty} × ${item.name} ← ${vendor.name}`, rate ? `${fmtMoney(rate, currency)} / unit` : "Rate not specified — will use item default"];
  } else if (pending.kind === "payment") {
    const customer = picked.customer ?? pending.customer;
    title = "Payment received";
    lines = [`From ${customer.name}`, fmtMoney(pending.amount, currency)];
  } else if (pending.kind === "add_customer") {
    title = "New customer";
    lines = [pending.name, pending.location || "No location given"];
  }

  return (
    <div className="relative flex flex-col gap-3">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#7d818a]">{title} — confirm?</p>
        <p className="mt-1 text-[15px] font-semibold text-white">{lines[0]}</p>
        {lines[1] && <p className="font-mono text-[13px] text-[#c9cdd6]">{lines[1]}</p>}
      </div>

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
