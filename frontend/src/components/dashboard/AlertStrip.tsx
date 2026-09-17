import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney } from "../../lib/format";

interface AlertItem { tone: "bad" | "warn" | "brand"; text: string; onClick?: () => void; detail?: React.ReactNode; cta?: { label: string; onClick: () => void } }

const TONE: Record<AlertItem["tone"], { text: string }> = {
  bad: { text: "text-bad-600" },
  warn: { text: "text-warn-600" },
  brand: { text: "text-brand-600" },
};

export function AlertStrip({ alerts }: { alerts: AlertItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (alerts.length === 0) return null;
  const open = openIndex != null ? alerts[openIndex] : null;

  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ink/30">Needs attention</p>
      <div className="-mx-5 flex gap-0 overflow-x-auto px-5 pb-1">
        {alerts.map((a, i) => {
          const tone = TONE[a.tone];
          const isOpen = openIndex === i;
          const isLast = i === alerts.length - 1;
          return (
            <button
              key={i}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap py-1 pr-4 text-left text-[13px] transition-colors duration-150 ${isLast ? "" : "mr-4 border-r border-line"} ${isOpen ? tone.text : "text-ink"}`}
            >
              <span className={`font-medium ${a.tone === "brand" ? tone.text : ""}`}>{a.text}</span>
              {a.detail && <ChevronDown size={12} className={`text-ink/30 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />}
            </button>
          );
        })}
      </div>

      <div
        className="grid overflow-hidden transition-all duration-250 ease-out"
        style={{ gridTemplateRows: open?.detail ? "1fr" : "0fr", opacity: open?.detail ? 1 : 0, marginTop: open?.detail ? 8 : 0 }}
      >
        <div className="min-h-0 overflow-hidden">
          {open?.detail && (
            <div className={`rounded-xl border border-line bg-card p-3.5 shadow-card`}>
              {open.detail}
              {open.cta && (
                <button
                  onClick={open.cta.onClick}
                  className={`mt-3 w-full rounded-pill py-2 text-[12px] font-semibold text-white ${open.tone === "bad" ? "bg-bad-500" : open.tone === "warn" ? "bg-warn-500" : "bg-brand-500"}`}
                >
                  {open.cta.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function buildDashboardAlerts({ lowStockItems, overdueEstimates, overdueAmount, payable, currency, go, paceSuggestionByItem, LOW_STOCK_DEFAULT, openModal }: any): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (lowStockItems.length > 0) {
    const first = lowStockItems[0];
    alerts.push({
      tone: "bad",
      text: lowStockItems.length === 1 ? `${first.name} is low on stock` : `${lowStockItems.length} items low on stock`,
      detail: (
        <div className="space-y-1.5">
          {lowStockItems.slice(0, 5).map((it: any) => {
            const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
            const paceSuggestion = paceSuggestionByItem?.get(it.id);
            const suggestedQty = paceSuggestion ? Math.max(1, paceSuggestion.suggestedQty) : Math.max(1, threshold * 2 - (it.stock ?? 0));
            return (
              <div key={it.id} className="flex items-center justify-between rounded-lg bg-bad-50/60 px-2.5 py-2">
                <p className="text-[11.5px] font-semibold text-bad-700 truncate pr-2">
                  {it.name} <span className="font-normal text-bad-500">({it.stock ?? 0} left{paceSuggestion?.daysLeft != null ? ` · ~${paceSuggestion.daysLeft}d` : ""})</span>
                </p>
                <button onClick={() => openModal?.("order", { itemId: it.id, qty: suggestedQty })} className="shrink-0 rounded-pill bg-bad-500 px-2.5 py-1 text-[10px] font-semibold text-white">Reorder</button>
              </div>
            );
          })}
          {lowStockItems.length > 5 && <p className="pt-0.5 text-[10.5px] text-ink/40">+{lowStockItems.length - 5} more</p>}
        </div>
      ),
      cta: { label: "View all items", onClick: () => go("items") },
    });
  }
  if (overdueEstimates.length > 0) {
    alerts.push({
      tone: "warn",
      text: `${overdueEstimates.length} overdue estimate${overdueEstimates.length !== 1 ? "s" : ""} · ${fmtMoney(overdueAmount, currency)}`,
      detail: (
        <div className="space-y-1.5">
          {overdueEstimates.slice(0, 5).map((e: any) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg bg-warn-50/60 px-2.5 py-2">
              <p className="text-[11.5px] font-semibold text-warn-700 truncate pr-2">{e.number || "Estimate"}</p>
              <span className="shrink-0 font-mono text-[11px] font-semibold text-warn-700">{fmtMoney(Number(e.total || 0) - Number(e.amountPaid || 0), currency)}</span>
            </div>
          ))}
          {overdueEstimates.length > 5 && <p className="pt-0.5 text-[10.5px] text-ink/40">+{overdueEstimates.length - 5} more</p>}
        </div>
      ),
      cta: { label: "View overdue estimates", onClick: () => go("estimates", "filter=overdue") },
    });
  }
  if (payable > 0) {
    alerts.push({
      tone: "brand",
      text: `${fmtMoney(payable, currency)} owed to vendors`,
      cta: { label: "View purchases", onClick: () => go("purchases") },
    });
  }
  return alerts;
}
