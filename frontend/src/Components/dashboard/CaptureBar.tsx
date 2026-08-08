import React, { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { parseCapture } from "../../lib/captureParser";
import { today } from "../../lib/format";

const CHIPS = [
  { label: "Sold cement", fill: "Sold 40 bags OPC Cement to " },
  { label: "Received saria", fill: "Received 2 12mm Saria from " },
  { label: "Logged payment", fill: "Logged payment of ₹ from " },
  { label: "New estimate", fill: "New estimate for " },
];

export function CaptureBar({ items, customers, vendors, saveDocument, savePayment, savePurchase, openModal, showToast }: any) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fill = (text: string) => {
    setValue(text);
    inputRef.current?.focus();
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;
    const action = parseCapture(text, { items, customers, vendors });
    setBusy(true);
    try {
      switch (action.kind) {
        case "sale": {
          const rate = action.amount ? action.amount / action.qty : (action.item.sellingPrice ?? action.item.price ?? 0);
          const total = action.amount ?? rate * action.qty;
          await saveDocument("estimate", {
            customerId: action.customer.id,
            date: today(),
            dueDate: today(),
            lines: [{ itemId: action.item.id, qty: action.qty, rate }],
            total,
            status: "Due",
          });
          setValue("");
          break;
        }
        case "purchase": {
          const rate = action.rate ?? action.item.purchasePrice ?? 0;
          await savePurchase({ vendorId: action.vendor.id, itemId: action.item.id, qty: action.qty, rate, date: today() });
          setValue("");
          break;
        }
        case "payment": {
          await savePayment({ customerId: action.customer.id, amount: action.amount, date: today(), method: "Cash" });
          setValue("");
          break;
        }
        case "new_estimate": {
          openModal("estimate", action.customer ? { customerId: action.customer.id } : undefined);
          setValue("");
          break;
        }
        case "sale_needs_review": {
          showToast(!action.item ? `Couldn't find an item matching "${action.itemName}" — opening a blank estimate` : `Couldn't find a customer matching "${action.customerName}" — opening a blank estimate`);
          openModal("estimate");
          setValue("");
          break;
        }
        case "purchase_needs_review": {
          showToast(!action.item ? `Couldn't find an item matching "${action.itemName}" — opening Purchases` : `Couldn't find a vendor matching "${action.vendorName}" — opening Purchases`);
          openModal("purchase");
          setValue("");
          break;
        }
        case "payment_needs_review": {
          showToast(`Couldn't find a customer matching "${action.customerName}" — opening Payments`);
          openModal("payment");
          setValue("");
          break;
        }
        default: {
          showToast("Couldn't quite parse that — try one of the examples below, or use + New.");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-card bg-ink p-5 flex flex-col gap-3.5 shadow-card">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(480px 120px at 15% 0%, rgba(217,80,15,0.16), transparent 70%)" }} />
      <div className="relative flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#20242c] border border-[#333844] text-white/80">
          <ArrowUp size={14} />
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Sold 50 bags cement to Patel Traders, ₹22,500..."
          disabled={busy}
          className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#F5F3EE] placeholder:text-[#6b6f78]"
        />
        <span className="hidden sm:inline-block whitespace-nowrap rounded-md border border-[#333844] px-1.5 py-0.5 font-mono text-[10px] text-[#7d818a]">
          {busy ? "working…" : "↵ enter"}
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
    </div>
  );
}
