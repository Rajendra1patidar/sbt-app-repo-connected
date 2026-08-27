import React, { useMemo, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
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

export function ItemDetailDrawer({ item, items, godowns, open, onClose, currency, purchases, estimates, openModal, applyStockAdjustments }: any) {
  const days = useMemo(() => last7Days(), []);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [newStock, setNewStock] = useState("");
  const [newStockKg, setNewStockKg] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // `item` is a snapshot taken at the moment the drawer was opened, so after
  // a quick adjustment updates the store, this drawer would otherwise keep
  // showing the stale "before" stock until closed and reopened. Resolving
  // against the live `items` list (when available) keeps the drawer itself
  // in sync with what was just adjusted.
  const liveItem = useMemo(() => {
    if (!item) return item;
    return (items || []).find((it: any) => it.id === item.id) || item;
  }, [item, items]);

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

  const threshold = liveItem.lowStock ?? LOW_STOCK_DEFAULT;
  const isWeight = liveItem.trackingMode === "weight";
  const stock = Number(liveItem.stock || 0);
  const stockKg = Number(liveItem.stockKg || 0);
  const unitCost = Number(liveItem.purchasePrice || liveItem.sellingPrice || liveItem.price || 0);
  // For weight-mode items, purchasePrice is ₹/kg (see stockService), so value
  // is costed against stockKg, not the piece count.
  const value = (isWeight ? stockKg : stock) * unitCost;
  const gateStock = isWeight ? stockKg : stock;
  const isBad = gateStock <= threshold;
  const isWarn = !isBad && gateStock <= threshold * 1.5;
  const statusLabel = isBad ? "Below reorder line — order recommended" : isWarn ? "Watch — approaching reorder line" : "Healthy";
  const statusColor = isBad ? "text-bad-600" : isWarn ? "text-warn-600" : "text-good-600";
  const iconBg = isBad ? "#B23A2E" : isWarn ? "#B27B1E" : "#2E7D5B";

  const maxAbs = Math.max(1, ...movement.map((m) => Math.abs(m.net)));
  const suggestedQty = Math.max(1, threshold * 2 - gateStock);

  const openAdjust = () => {
    setNewStock(String(stock));
    setNewStockKg(String(stockKg));
    setReason("");
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    const n = Number(newStock);
    if (Number.isNaN(n) || n < 0 || !applyStockAdjustments) return;
    let nKg: number | undefined;
    if (isWeight) {
      nKg = Number(newStockKg);
      if (Number.isNaN(nKg) || nKg < 0) return;
    }
    setSubmitting(true);
    await applyStockAdjustments(
      [{ itemId: liveItem.id, newStock: n, newStockKg: nKg, reason: reason || undefined }],
      reason || "Manual adjustment"
    );
    setSubmitting(false);
    setAdjustOpen(false);
  };

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-[1px] animate-fade-in" />}
      <aside className={`fixed z-[71] inset-y-0 right-0 w-full sm:w-[380px] transform bg-card border-l border-line shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-full flex-col overflow-y-auto p-6">
          <button onClick={onClose} className="mb-4 self-end rounded-full bg-paper p-1.5 hover:bg-line/50"><X size={16} /></button>

          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: iconBg }}>
            <span className="font-display text-sm font-semibold">{(liveItem.name || "?").slice(0, 2).toUpperCase()}</span>
          </div>
          <h3 className="font-display text-xl font-medium text-ink">{liveItem.name}</h3>
          <p className="text-xs text-ink/40">{liveItem.category || "Others"}{liveItem.brand ? ` · ${liveItem.brand}` : ""}</p>

          <div className="mt-3 divide-y divide-line/70">
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink/60">On hand</span>
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold text-ink">
                  {isWeight ? `${fmtNum(stockKg)}kg / ${fmtNum(stock)}pc` : `${fmtNum(stock)} ${liveItem.unit || "unit"}`}
                </span>
                {applyStockAdjustments && (
                  <button onClick={openAdjust} className="text-xs font-semibold text-brand-500">Adjust</button>
                )}
              </span>
            </div>
            {godowns && godowns.length > 1 && (liveItem.stockByGodown || []).length > 0 && (
              <div className="py-2.5 text-sm">
                <span className="mb-1.5 block text-xs font-semibold text-ink/40">By location</span>
                <div className="space-y-1">
                  {liveItem.stockByGodown
                    .filter((g: any) => g.stock > 0 || g.stockKg > 0)
                    .map((g: any) => {
                      const gd = godowns.find((x: any) => x.id === String(g.godownId));
                      return (
                        <div key={String(g.godownId)} className="flex items-center justify-between text-xs">
                          <span className="text-ink/60">{gd?.name || "Unknown godown"}</span>
                          <span className="font-mono font-medium text-ink">
                            {isWeight ? `${fmtNum(g.stockKg || 0)}kg / ${fmtNum(g.stock || 0)}pc` : `${fmtNum(g.stock || 0)} ${liveItem.unit || "unit"}`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink/60">Stock value</span>
              <span className="font-mono font-semibold text-ink">{fmtMoney(value, currency)}</span>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink/60">Status</span>
              <span className={`font-semibold text-right ${statusColor}`}>{statusLabel}</span>
            </div>
          </div>

          {adjustOpen && (
            <div className="mt-3 rounded-xl border border-line bg-paper p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink/60">Correct stock to</p>
                <button onClick={() => setAdjustOpen(false)} className="text-ink/30 hover:text-bad-500"><X size={13} /></button>
              </div>
              <div>
                {isWeight && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/35">Pieces</p>}
                <input
                  type="number"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold"
                />
              </div>
              {isWeight && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/35">Weight (kg) — re-weigh, don't estimate</p>
                  <input
                    type="number"
                    value={newStockKg}
                    onChange={(e) => setNewStockKg(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold"
                  />
                </div>
              )}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional) — e.g. Physical count, Damage"
                className="w-full rounded-lg border border-line px-3 py-2 text-xs"
              />
              <button
                onClick={submitAdjust}
                disabled={submitting || newStock.trim() === "" || Number.isNaN(Number(newStock)) || (isWeight && (newStockKg.trim() === "" || Number.isNaN(Number(newStockKg))))}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Save correction
              </button>
            </div>
          )}

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
            onClick={() => { openModal("order", { itemId: liveItem.id, qty: suggestedQty }); onClose(); }}
            className="mt-auto rounded-xl bg-ink py-3.5 text-sm font-semibold text-paper"
          >
            Create purchase order
          </button>
        </div>
      </aside>
    </>
  );
}
