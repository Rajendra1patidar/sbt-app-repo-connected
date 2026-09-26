import React, { useMemo, useState } from "react";
import { LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtNum } from "../../lib/format";

/* ---- Item quantity map ----
 * Replaces the old value-sized treemap (StockTreemap), which let the 2-3
 * heaviest-value categories (cement, sand, saria) swallow the whole grid.
 * This groups by category first (sized by quantity on hand, square-root
 * scaled so a 10x-bigger quantity only looks ~3x bigger, not 10x), and taps
 * drill into that category's own items — so every one of the 300+ items is
 * reachable without any single item dominating the view. */

type Health = "ok" | "low" | "reorder";

const PALETTE = [
  { bg: "bg-brand-50", text: "text-brand-700" },
  { bg: "bg-good-50", text: "text-good-700" },
  { bg: "bg-warn-50", text: "text-warn-700" },
  { bg: "bg-advance-50", text: "text-advance-700" },
  { bg: "bg-bad-50", text: "text-bad-700" },
  { bg: "bg-paper", text: "text-ink/70" },
];

const RING: Record<Health, string> = {
  ok: "",
  low: "outline outline-2 outline-offset-2 outline-warn-400",
  reorder: "outline outline-2 outline-offset-2 outline-bad-400",
};

function qtyOf(it: any): number {
  return it.trackingMode === "weight" ? Number(it.stockKg || 0) : Number(it.stock || 0);
}

function healthOf(it: any): Health {
  const qty = qtyOf(it);
  const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
  if (qty <= 0) return "reorder";
  if (qty <= threshold) return "low";
  return "ok";
}

function worstHealth(list: Health[]): Health {
  if (list.includes("reorder")) return "reorder";
  if (list.includes("low")) return "low";
  return "ok";
}

// Square-root scaling: area (not radius) grows proportionally with quantity,
// which is what a viewer actually perceives — a linear radius scale makes
// big values look disproportionately dominant.
function sizePx(qty: number, max: number): number {
  if (max <= 0) return 56;
  return Math.round(52 + Math.sqrt(Math.max(0, qty) / max) * 78);
}

export function ItemQuantityMap({ items, onSelectItem }: any) {
  const [openCat, setOpenCat] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const it of items || []) {
      if (it.deleted) continue;
      const cat = it.category || "Others";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    return [...map.entries()]
      .map(([name, its]) => ({
        name,
        qty: its.reduce((s, it) => s + qtyOf(it), 0),
        health: worstHealth(its.map(healthOf)),
        items: [...its].sort((a, b) => qtyOf(b) - qtyOf(a)),
      }))
      .filter((c) => c.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }, [items]);

  if (categories.length === 0) return null;

  const maxCatQty = categories[0].qty;
  const active = categories.find((c) => c.name === openCat) || null;
  const maxItemQty = active ? Math.max(1, ...active.items.map(qtyOf)) : 1;
  const activeIndex = active ? categories.findIndex((c) => c.name === active.name) : 0;

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Item quantity map</p>
        {active && (
          <button onClick={() => setOpenCat(null)} className="text-xs font-semibold text-brand-600">← Back</button>
        )}
      </div>
      <p className="mb-3 text-xs text-ink/40">{active ? active.name : "By category, sized by quantity on hand"}</p>

      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        {!active
          ? categories.map((c, i) => {
              const px = sizePx(c.qty, maxCatQty);
              const palette = PALETTE[i % PALETTE.length];
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setOpenCat(c.name)}
                  style={{ width: px, height: px }}
                  className={`flex shrink-0 flex-col items-center justify-center rounded-full p-1 text-center leading-tight ${palette.bg} ${palette.text} ${RING[c.health]}`}
                >
                  <span className="max-w-full truncate px-1 text-[12px] font-semibold">{c.name}</span>
                  <span className="text-[10px]">{fmtNum(c.qty)}</span>
                </button>
              );
            })
          : active.items.map((it: any) => {
              const px = sizePx(qtyOf(it), maxItemQty);
              const palette = PALETTE[activeIndex % PALETTE.length];
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelectItem?.(it)}
                  style={{ width: px, height: px }}
                  className={`flex shrink-0 flex-col items-center justify-center rounded-full p-1 text-center leading-tight ${palette.bg} ${palette.text} ${RING[healthOf(it)]}`}
                >
                  <span className="max-w-full truncate px-1 text-[11px] font-semibold">{it.name}</span>
                  <span className="text-[10px]">{fmtNum(qtyOf(it))} {it.unit || ""}</span>
                </button>
              );
            })}
      </div>

      <div className="mt-2 flex justify-center gap-4 text-[11px] text-ink/40">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-bad-400" /> Reorder</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn-400" /> Low</span>
      </div>
    </div>
  );
}
