import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney } from "../../lib/format";

interface AlertItem { tone: "bad" | "warn" | "brand"; text: string; onClick?: () => void; detail?: React.ReactNode; cta?: { label: string; onClick: () => void } }

const TONE_TEXT: Record<AlertItem["tone"], string> = { bad: "text-ink", warn: "text-ink", brand: "text-brand-700" };
const TONE_ACCENT: Record<AlertItem["tone"], string> = { bad: "bg-bad-500", warn: "bg-warn-500", brand: "bg-brand-500" };

export function AlertStrip({ alerts }: { alerts: AlertItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (alerts.length === 0) return null;
  const open = openIndex != null ? alerts[openIndex] : null;

  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ink/30">Needs attention</p>
      <div className="flex gap-0 overflow-x-auto">
        {alerts.map((a, i) => {
          const isOpen = openIndex === i;
          const isLast = i === alerts.length - 1;
          return (
            <button
              key={i}
              onClick={() => (a.detail ? setOpenIndex(isOpen ? null : i) : a.cta?.onClick())}
              className={`group flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md py-1 pl-1 pr-4 text-left transition-colors duration-150 hover:bg-ink/[0.04] ${!isLast ? "mr-3.5 border-r border-line" : ""}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_ACCENT[a.tone]}`} />
              <span className={`text-[13px] font-medium ${TONE_TEXT[a.tone]}`}>{a.text}</span>
              {a.detail && <ChevronDown size={12} className={`text-ink/25 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />}
            </button>
          );
        })}
      </div>

      <div
        className="grid overflow-hidden transition-all duration-250 ease-out"
        style={{ gridTemplateRows: open?.detail ? "1fr" : "0fr", opacity: open?.detail ? 1 : 0, marginTop: open?.detail ? 12 : 0 }}
      >
        <div className="min-h-0 overflow-hidden">
          {open?.detail && (
            <div className="border-t border-line pt-3">
              {open.detail}
              {open.cta && (
                <button onClick={open.cta.onClick} className="mt-3 text-[11.5px] font-semibold text-brand-700 hover:underline">
                  {open.cta.label} →
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
      text: lowStockItems.length === 1 ? `${first.name} low on stock` : `${lowStockItems.length} items low on stock`,
      detail: (
        <div className="space-y-2">
          {lowStockItems.slice(0, 5).map((it: any) => {
            const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
            const paceSuggestion = paceSuggestionByItem?.get(it.id);
            const suggestedQty = paceSuggestion ? Math.max(1, paceSuggestion.suggestedQty) : Math.max(1, threshold * 2 - (it.stock ?? 0));
            return (
              <div key={it.id} className="flex items-center justify-between text-[12.5px]">
                <span className="text-ink/70">
                  {it.name} <span className="text-ink/35">({it.stock ?? 0} left{paceSuggestion?.daysLeft != null ? ` · ~${paceSuggestion.daysLeft}d` : ""})</span>
                </span>
                <button onClick={() => openModal?.("order", { itemId: it.id, qty: suggestedQty })} className="shrink-0 font-semibold text-brand-700 hover:underline">Reorder</button>
              </div>
            );
          })}
          {lowStockItems.length > 5 && <p className="text-[11px] text-ink/35">+{lowStockItems.length - 5} more</p>}
        </div>
      ),
      cta: { label: "View all items", onClick: () => go("items") },
    });
  }
  if (overdueEstimates.length > 0) {
    alerts.push({
      tone: "warn",
      text: `${overdueEstimates.length} overdue · ${fmtMoney(overdueAmount, currency)}`,
      detail: (
        <div className="space-y-2">
          {overdueEstimates.slice(0, 5).map((e: any) => (
            <div key={e.id} className="flex items-center justify-between text-[12.5px]">
              <span className="text-ink/70">{e.number || "Estimate"}</span>
              <span className="font-mono font-semibold text-ink">{fmtMoney(Number(e.total || 0) - Number(e.amountPaid || 0), currency)}</span>
            </div>
          ))}
          {overdueEstimates.length > 5 && <p className="text-[11px] text-ink/35">+{overdueEstimates.length - 5} more</p>}
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
