import React, { useMemo } from "react";
import { X } from "lucide-react";
import { LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtMoney, fmtNum, today } from "../../lib/format";

function last7Days(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function ItemDetailDrawer({ item, open, onClose, currency, purchases, estimates, openModal }: any) {
  const days = useMemo(() => last7Days(), []);

  const movement = useMemo(() => {
    if (!item) return [];
    return days.map((day) => {
      const inQty = (purchases || [])
        .filter((p: any) => p.itemId === item.id && String(p.date).slice(0, 10) === day)
        .reduce((s: number, p: any) => s + Number(p.qty || 0), 0);
      const outQty = (estimates || [])
        .filter((e: any) => !e.deleted && String(e.date).slice(0, 10) === day)
        .reduce((s: number, e: any) => s + (e.lines || []).filter((ln: any) => ln.itemId === item.id).reduce((ls: number, ln: any) => ls + Number(ln.qty || 0), 0), 0);
      return { day, net: inQty - outQty };
    });
  }, [item, days, purchases, estimates]);

  if (!item) return null;

  const threshold = item.lowStock ?? LOW_STOCK_DEFAULT;
  const stock = Number(item.stock || 0);
  const unitCost = Number(item.purchasePrice || item.sellingPrice || item.price || 0);
  const value = stock * unitCost;
  const isBad = stock <= threshold;
  const isWarn = !isBad && stock <= threshold * 1.5;
  const statusLabel = isBad ? "Below reorder line — order recommended" : isWarn ? "Watch — approaching reorder line" : "Healthy";
  const statusColor = isBad ? "text-bad-600" : isWarn ? "text-warn-600" : "text-good-600";
  const iconBg = isBad ? "#B23A2E" : isWarn ? "#B27B1E" : "#2E7D5B";

  const maxAbs = Math.max(1, ...movement.map((m) => Math.abs(m.net)));
  const suggestedQty = Math.max(1, threshold * 2 - stock);

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-[1px] animate-fade-in" />}
      <aside className={`fixed z-[71] inset-y-0 right-0 w-full sm:w-[380px] transform bg-card border-l border-line shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-full flex-col overflow-y-auto p-6">
          <button onClick={onClose} className="mb-4 self-end rounded-full bg-paper p-1.5 hover:bg-line/50"><X size={16} /></button>

          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: iconBg }}>
            <span className="font-display text-sm font-semibold">{(item.name || "?").slice(0, 2).toUpperCase()}</span>
          </div>
          <h3 className="font-display text-xl font-medium text-ink">{item.name}</h3>
          <p className="text-xs text-ink/40">{item.category || "Others"}</p>

          <div className="mt-3 divide-y divide-line/70">
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink/60">On hand</span>
              <span className="font-mono font-semibold text-ink">{fmtNum(stock)} {item.unit || "unit"}</span>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink/60">Stock value</span>
              <span className="font-mono font-semibold text-ink">{fmtMoney(value, currency)}</span>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink/60">Status</span>
              <span className={`font-semibold text-right ${statusColor}`}>{statusLabel}</span>
            </div>
          </div>

          <div className="mt-4 text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">Last 7 days movement</div>
          <div className="mt-3 flex h-[70px] items-end gap-1.5">
            {movement.map((m) => {
              const h = Math.max(4, (Math.abs(m.net) / maxAbs) * 70);
              const color = m.net > 0 ? "bg-good-500" : m.net < 0 ? "bg-bad-400" : "bg-line";
              return (
                <div key={m.day} className="group relative flex-1">
                  <div className={`w-full rounded-t-[3px] ${color} opacity-85`} style={{ height: h }} />
                  <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[9px] font-semibold text-paper opacity-0 transition-opacity group-hover:opacity-100">
                    {m.net > 0 ? "+" : ""}{fmtNum(m.net)}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => { openModal("order", { itemId: item.id, qty: suggestedQty }); onClose(); }}
            className="mt-auto rounded-xl bg-ink py-3.5 text-sm font-semibold text-paper"
          >
            Create purchase order
          </button>
        </div>
      </aside>
    </>
  );
}
