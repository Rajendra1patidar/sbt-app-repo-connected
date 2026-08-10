import React, { useMemo } from "react";
import { AlertTriangle, Package } from "lucide-react";
import { LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtMoney, fmtNum } from "../../lib/format";

const MAX_TILES = 16;

type Urgency = "bad" | "warn" | "good";
type SizeTier = "xl" | "l" | "m" | "s";

const URGENCY_GRADIENT: Record<Urgency, string> = {
  good: "linear-gradient(160deg,#357C5C,#245c43)",
  warn: "linear-gradient(160deg,#C28A2E,#96691f)",
  bad: "linear-gradient(160deg,#C1493A,#932e22)",
};

const SIZE_SPAN: Record<SizeTier, { col: number; row: number }> = {
  xl: { col: 3, row: 3 },
  l: { col: 2, row: 2 },
  m: { col: 2, row: 1 },
  s: { col: 1, row: 1 },
};

function computeUrgency(stock: number, threshold: number): Urgency {
  if (stock <= threshold) return "bad";
  if (stock <= threshold * 1.5) return "warn";
  return "good";
}

function sizeTierFor(shareOfTotal: number): SizeTier {
  if (shareOfTotal >= 0.2) return "xl";
  if (shareOfTotal >= 0.1) return "l";
  if (shareOfTotal >= 0.04) return "m";
  return "s";
}

export function StockTreemap({ items, currency, onSelect }: any) {
  const tiles = useMemo(() => {
    const withValue = items
      .filter((it: any) => !it.deleted)
      .map((it: any) => {
        const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
        const stock = Number(it.stock || 0);
        const unitCost = Number(it.purchasePrice || it.sellingPrice || it.price || 0);
        const value = stock * unitCost;
        return { item: it, threshold, stock, value, urgency: computeUrgency(stock, threshold) };
      })
      .sort((a: any, b: any) => b.value - a.value);

    const total = Math.max(1, withValue.reduce((s: number, w: any) => s + w.value, 0));
    return withValue.slice(0, MAX_TILES).map((w: any) => ({ ...w, size: sizeTierFor(w.value / total) }));
  }, [items]);

  const hiddenCount = Math.max(0, items.filter((it: any) => !it.deleted).length - tiles.length);

  if (tiles.length === 0) return null;

  return (
    <div className="rounded-card bg-card border border-line shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h2 className="font-display text-[15px] font-medium text-ink">Stock — sized by value, colored by urgency</h2>
        {hiddenCount > 0 && <span className="text-[11px] text-ink/40">+{hiddenCount} more below</span>}
      </div>
      <div className="overflow-x-auto px-4 pb-4 pt-2">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(6, minmax(84px, 1fr))", gridAutoRows: 50, minWidth: 560 }}
        >
          {tiles.map(({ item, threshold, stock, value, urgency, size }: any) => {
            const span = SIZE_SPAN[size as SizeTier];
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                style={{ gridColumn: `span ${span.col}`, gridRow: `span ${span.row}`, background: URGENCY_GRADIENT[urgency as Urgency] }}
                className="relative flex flex-col justify-between overflow-hidden rounded-xl border-none p-2.5 text-left text-white transition-transform duration-150 hover:scale-[1.02] active:scale-95"
              >
                <Package size={size === "xl" ? 20 : 16} className="absolute right-2 top-2 opacity-30" />
                <span className={`font-semibold leading-tight ${size === "xl" ? "text-base" : size === "l" ? "text-sm" : "text-[11.5px]"} max-w-[80%]`}>
                  {item.name}
                </span>
                <div>
                  <span className="block font-mono text-[10px] opacity-90">
                    {fmtNum(stock)} {item.unit || "unit"} · {fmtMoney(value, currency)}
                  </span>
                  {urgency === "bad" && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">
                      <AlertTriangle size={9} /> reorder now
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
