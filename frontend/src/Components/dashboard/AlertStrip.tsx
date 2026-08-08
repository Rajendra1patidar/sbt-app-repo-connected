import React from "react";
import { fmtMoney } from "../../lib/format";

interface AlertItem { tone: "bad" | "warn" | "brand"; text: string; onClick?: () => void }

const TONE_BORDER: Record<AlertItem["tone"], string> = { bad: "border-l-bad-500", warn: "border-l-warn-500", brand: "border-l-brand-500" };

export function AlertStrip({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
      {alerts.map((a, i) => (
        <button
          key={i}
          onClick={a.onClick}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-line ${TONE_BORDER[a.tone]} border-l-[3px] bg-card px-3.5 py-2.5 text-left text-[12px] shadow-card`}
        >
          <span className="font-semibold text-ink">{a.text}</span>
        </button>
      ))}
    </div>
  );
}

export function buildDashboardAlerts({ lowStockItems, overdueEstimates, overdueAmount, payable, currency, go }: any): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (lowStockItems.length > 0) {
    const first = lowStockItems[0];
    alerts.push({
      tone: "bad",
      text: lowStockItems.length === 1 ? `${first.name} is low on stock` : `${lowStockItems.length} items low on stock`,
      onClick: () => go("items"),
    });
  }
  if (overdueEstimates.length > 0) {
    alerts.push({
      tone: "warn",
      text: `${overdueEstimates.length} overdue estimate${overdueEstimates.length !== 1 ? "s" : ""} · ${fmtMoney(overdueAmount, currency)}`,
      onClick: () => go("estimates"),
    });
  }
  if (payable > 0) {
    alerts.push({ tone: "brand", text: `${fmtMoney(payable, currency)} owed to vendors`, onClick: () => go("purchases") });
  }
  return alerts;
}
