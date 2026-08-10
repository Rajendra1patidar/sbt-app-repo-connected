import React, { useState } from "react";
import { CheckCircle2, Clock, PackageCheck, Wallet } from "lucide-react";
import { fmtMoney } from "../../lib/format";

const CHOICES = [
  {
    key: "paid", status: "Paid", advance: false,
    icon: CheckCircle2, iconBg: "bg-good-50", iconFg: "text-good-500",
    title: "Paid", desc: "Customer has paid in full",
  },
  {
    key: "partial", status: "Due", advance: false,
    icon: Wallet, iconBg: "bg-brand-50", iconFg: "text-brand-500",
    title: "Partial Payment", desc: "Customer is paying part of it now",
  },
  {
    key: "due", status: "Due", advance: false,
    icon: Clock, iconBg: "bg-warn-50", iconFg: "text-warn-500",
    title: "Due", desc: "Payment pending",
  },
  {
    key: "advance", status: "Paid", advance: true,
    icon: PackageCheck, iconBg: "bg-brand-50", iconFg: "text-brand-500",
    title: "Advance Booking", desc: "Paid now, collected in batches",
  },
];

export function StatusChoicePopup({ total, currency, onChoose, onCancel }: any) {
  const [selected, setSelected] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const choice = CHOICES.find((c) => c.key === selected);
  const isPartial = selected === "partial";
  const partialNum = Number(partialAmount || 0);
  const partialValid = !isPartial || (partialNum > 0 && partialNum < total);
  const canConfirm = !!choice && (!isPartial || partialValid);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-card p-6 shadow-xl">
        <h3 className="font-display text-lg font-bold text-ink">Is this estimate paid?</h3>
        <p className="mt-1 text-sm text-ink/50">Total amount: <span className="font-semibold text-ink/80">{fmtMoney(total, currency)}</span></p>

        <div className="mt-5 space-y-2">
          {CHOICES.map((c) => {
            const Icon = c.icon;
            const isSelected = selected === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setSelected(c.key)}
                className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition-all duration-150 ${
                  isSelected ? "border-brand-500 bg-brand-50/60" : "border-line bg-card hover:border-brand-200"
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconBg} ${c.iconFg}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">{c.title}</span>
                  <span className="block text-xs text-ink/50">{c.desc}</span>
                </span>
                <span
                  className={`h-5 w-5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-bold text-white transition-colors ${
                    isSelected ? "border-brand-500 bg-brand-500" : "border-line bg-card"
                  }`}
                >
                  {isSelected && "✓"}
                </span>
              </button>
            );
          })}
        </div>

        {isPartial && (
          <div className="mt-3 rounded-2xl border border-line bg-paper/60 p-3">
            <label className="mb-1 block text-xs font-semibold text-ink/50">Amount received now</label>
            <input
              type="number" min="0" max={total} autoFocus
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-ink/50">Balance due</span>
              <span className="font-semibold text-ink/80">{fmtMoney(Math.max(total - partialNum, 0), currency)}</span>
            </div>
            {partialAmount !== "" && !partialValid && (
              <p className="mt-1 text-[11px] text-bad-600">Enter an amount more than 0 and less than {fmtMoney(total, currency)}.</p>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/50">
            Back to editing
          </button>
          <button
            onClick={() => choice && canConfirm && onChoose(choice.status, choice.advance, isPartial ? partialNum : undefined)}
            disabled={!canConfirm}
            className="flex-1 rounded-full bg-brand-500 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
