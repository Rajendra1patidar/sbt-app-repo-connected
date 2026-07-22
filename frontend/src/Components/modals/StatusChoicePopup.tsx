import React, { useState } from "react";
import { CheckCircle2, Clock, PackageCheck } from "lucide-react";
import { fmtMoney } from "../../lib/format";

const CHOICES = [
  {
    key: "paid", status: "Paid", advance: false,
    icon: CheckCircle2, iconBg: "bg-good-50", iconFg: "text-good-500",
    title: "Paid", desc: "Customer has paid in full",
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
  const choice = CHOICES.find((c) => c.key === selected);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-xl">
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
                  isSelected ? "border-brand-500 bg-brand-50/60" : "border-line bg-white hover:border-brand-200"
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
                    isSelected ? "border-brand-500 bg-brand-500" : "border-line bg-white"
                  }`}
                >
                  {isSelected && "✓"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/50">
            Back to editing
          </button>
          <button
            onClick={() => choice && onChoose(choice.status, choice.advance)}
            disabled={!choice}
            className="flex-1 rounded-full bg-brand-500 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
