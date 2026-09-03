import React from "react";
import { X } from "lucide-react";

export interface DetailRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

/** Generic read-only "what is this?" popup used across the dashboard —
 *  Activity River dots and Recent Transactions rows all funnel into this
 *  same shell so tapping any of them feels consistent, without needing a
 *  dedicated full edit modal for things like expenses/refunds that don't
 *  have one. */
export function TransactionDetailModal({ title, subtitle, rows, accent = "brand", onClose }: {
  title: string; subtitle?: string; rows: DetailRow[]; accent?: "brand" | "good" | "bad" | "warn"; onClose: () => void;
}) {
  const accentClass: Record<string, string> = {
    brand: "text-brand-600 bg-brand-50",
    good: "text-good-600 bg-good-50",
    bad: "text-bad-600 bg-bad-50",
    warn: "text-warn-600 bg-warn-50",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line sm:hidden" />
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${accentClass[accent]}`}>{title}</span>
            {subtitle && <p className="mt-1.5 text-base font-semibold text-ink truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper shrink-0"><X size={18} /></button>
        </div>
        <div className="divide-y divide-line">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-ink/40">{r.label}</span>
              <span className={`text-right font-mono ${r.emphasis ? "font-bold text-ink" : "font-medium text-ink/80"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
