import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ClipboardList, MapPin, Pencil, Printer, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card } from "../common/UIPrimitives";
import { ITEM_CATEGORIES, LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtMoney, fmtNum } from "../../lib/format";
import { waLink } from "../../lib/contactLinks";
import { StockTakeModal } from "../modals/StockTakeModal";

type Tab = "all" | "low" | "dead" | "reorder";

// Same "value" basis as the backend's stockValuation(): weighted-average
// purchasePrice × whatever's on hand (kg for weight-tracked items, pieces
// otherwise) — cost basis, not what it'd sell for.
function itemValue(it: any): number {
  const qty = it.trackingMode === "weight" ? (it.stockKg ?? 0) : (it.stock ?? 0);
  return qty * (it.purchasePrice ?? 0);
}

function stockBreakdown(it: any): string {
  if (it.trackingMode === "box" && it.piecesPerBox > 0) {
    const boxes = Math.floor((it.stock ?? 0) / it.piecesPerBox);
    const loose = (it.stock ?? 0) % it.piecesPerBox;
    return `${boxes} boxes + ${loose} pcs`;
  }
  return fmtNum(it.stock ?? 0);
}

/** Value tied up per category, for the at-a-glance breakdown bar. Sorted
 * highest-value first so the categories actually worth attention lead. */
function CategoryValueCard({ items, currency }: any) {
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const cat = it.category || "Others";
      map.set(cat, (map.get(cat) || 0) + itemValue(it));
    }
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [items]);

  if (byCategory.length === 0) return null;
  const max = byCategory[0][1];

  return (
    <Card>
      <p className="mb-2.5 text-xs font-semibold text-ink/40">Value by category</p>
      <div className="space-y-2">
        {byCategory.map(([cat, value]) => (
          <div key={cat} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-xs text-ink/70">{cat}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-xs text-ink/50">{fmtMoney(value, currency)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ToDoTrackingView({ items, settings, categories, orders, openModal, reorderSuggestions, deadStock, applyStockAdjustments, godowns }: any) {
  const initialTab = useMemo((): Tab => {
    const lowCount = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT)).length;
    if (lowCount > 0) return "low";
    const deadCount = (deadStock || []).length;
    if (deadCount > 0) return "dead";
    const reorderCount = (reorderSuggestions || []).filter((s: any) => s.mode === "pace").length;
    if (reorderCount > 0) return "reorder";
    return "all";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount — user's own tab clicks shouldn't get overridden by later data refreshes

  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"stock" | "value" | "name">("stock");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);
  const cats = categories?.length ? categories : ITEM_CATEGORIES;

  const deadStockById: Map<string, any> = new Map((deadStock || []).map((d: any) => [d.itemId, d]));
  const reorderById: Map<string, any> = new Map((reorderSuggestions || []).filter((s: any) => s.mode === "pace").map((s: any) => [s.itemId, s]));

  const lowItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));
  const deadItems = items.filter((it: any) => deadStockById.has(it.id));
  const reorderItems = items.filter((it: any) => reorderById.has(it.id));

  const tabItems = tab === "low" ? lowItems : tab === "dead" ? deadItems : tab === "reorder" ? reorderItems : items;
  const categoryFiltered = category === "All" ? tabItems : tabItems.filter((it: any) => (it.category || "Others") === category);
  const searchFiltered = search.trim()
    ? categoryFiltered.filter((it: any) => it.name?.toLowerCase().includes(search.trim().toLowerCase()))
    : categoryFiltered;
  const allItems = [...searchFiltered].sort((a: any, b: any) => {
    if (sortBy === "value") return itemValue(b) - itemValue(a);
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    return (a.stock ?? 0) - (b.stock ?? 0);
  });

  const totalValue = items.reduce((sum: number, it: any) => sum + itemValue(it), 0);
  const deadStockValue = (deadStock || []).reduce((sum: number, d: any) => sum + (d.value || 0), 0);

  // Which godown(s) an item actually sits in, for the location tag in the
  // list — only meaningful once there's more than one godown to distinguish.
  const locationLabel = (it: any): string | null => {
    if (!godowns || godowns.length <= 1) return null;
    const present = (it.stockByGodown || []).filter((g: any) => (g.stock ?? 0) > 0 || (g.stockKg ?? 0) > 0);
    if (present.length === 0) return null;
    if (present.length > 1) return `${present.length} locations`;
    const gd = godowns.find((g: any) => String(g.id) === String(present[0].godownId));
    return gd?.name || null;
  };

  const stockColor = (it: any) => {
    const s = it.stock ?? 0;
    const t = it.lowStock ?? LOW_STOCK_DEFAULT;
    if (s === 0) return "text-bad-600";
    if (s <= t) return "text-warn-600";
    return "text-good-600";
  };

  // Last confirmed sale for whichever item is currently expanded — computed
  // on demand rather than for every row, since scanning `orders` per item is
  // only cheap one at a time.
  const lastOrderFor = (itemId: string) =>
    (orders || [])
      .filter((o: any) => o.itemId === itemId)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  // Full Inventory Stock can run into the hundreds or thousands of rows for a
  // godown with a large catalogue. Rendering every row at once was fine for a
  // few dozen items but starts to visibly lag scrolling well before that —
  // virtualizing keeps scroll smooth regardless of catalogue size. Rows can
  // now expand in place (value/last-sold/pace/reorder detail), so heights are
  // measured dynamically rather than assumed fixed.
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 62,
    overscan: 8,
  });

  const printInventory = () => {
    const rowsHtml = items.map((it: any) =>
      `<tr><td>${it.name}</td><td>${it.unit || "unit"}</td><td style="text-align:right;">${stockBreakdown(it)}</td><td style="text-align:right;">${fmtMoney(itemValue(it), settings?.currency)}</td></tr>`
    ).join("");
    const w = window.open("", "_blank", "width=560,height=760");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Inventory</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
      h1 { font-size: 16px; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 4px 6px; border-bottom: 0.2mm solid #e2e8f0; font-size: 11px; }
      th { color: #64748b; font-weight: 600; }
    </style></head><body>
      <h1>${settings?.orgName || "Business"} — Inventory</h1>
      <table><thead><tr><th>Item</th><th>Unit</th><th style="text-align:right;">In stock</th><th style="text-align:right;">Value</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: items.length },
    { key: "low", label: "Low", count: lowItems.length },
    { key: "dead", label: "Dead", count: deadItems.length },
    { key: "reorder", label: "Reorder", count: reorderItems.length },
  ];

  return (
    <div className="space-y-4 px-5 pb-28">

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStockTakeOpen(true)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink/80"
        >
          <ClipboardList size={16} /> Stock take
        </button>
        <Link
          to="/stock-adjustments"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink/60"
        >
          History
        </Link>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-ink/40">Stock value</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(totalValue, settings?.currency)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink/40">Items tracked</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtNum(items.length)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink/40">Low stock</p>
            <p className={`mt-1 font-mono text-lg font-semibold ${lowItems.length > 0 ? "text-warn-600" : "text-ink"}`}>{fmtNum(lowItems.length)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink/40">Dead stock tied up</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(deadStockValue, settings?.currency)}</p>
          </div>
        </div>
      </Card>

      <CategoryValueCard items={items} currency={settings?.currency} />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-ink">Inventory</h3>
          <button onClick={printInventory} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink/80">
            <Printer size={12} /> Print
          </button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setExpandedId(null); }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                tab === t.key
                  ? "bg-brand-500 text-white"
                  : t.key === "low" && t.count > 0
                  ? "bg-warn-100 text-warn-700"
                  : "bg-paper text-ink/70"
              }`}
            >
              {t.label} {t.count}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items"
              className="w-full rounded-xl border border-line py-2 pl-8 pr-3 text-sm"
            />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-xl border border-line px-2 py-2 text-xs font-semibold text-ink/70">
            <option value="stock">Stock ↑</option>
            <option value="value">Value ↓</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {["All", ...cats].map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-ink text-white" : "bg-paper text-ink/70"}`}>{c}</button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-ink/40">No items added yet. Go to Items to add your first product.</p>
        ) : allItems.length === 0 ? (
          <p className="text-sm text-ink/40">No items match this search, category, or filter.</p>
        ) : (
          <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const it = allItems[virtualRow.index];
                const isExpanded = expandedId === it.id;
                const isLow = (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT);
                const dead = deadStockById.get(it.id);
                const reorder = reorderById.get(it.id);
                const lastOrder = isExpanded ? lastOrderFor(it.id) : null;
                return (
                  <div
                    key={it.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                    className="pb-2"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : it.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(isExpanded ? null : it.id); } }}
                      className="w-full cursor-pointer rounded-xl border border-line px-4 py-2.5 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{it.name}</p>
                          <p className="text-xs text-ink/40">
                            {it.unit || "unit"} · {it.category || "Others"}
                            {locationLabel(it) && (
                              <span className="ml-1 inline-flex items-center gap-0.5"><MapPin size={9} className="inline" /> {locationLabel(it)}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="h-4">
                              {isLow ? (
                                <span className="inline-block rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-bold text-warn-700">Low</span>
                              ) : dead ? (
                                <span className="inline-block rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink/40">No sale 90d+</span>
                              ) : null}
                            </div>
                            <p className={`font-display text-base font-bold ${stockColor(it)}`}>{stockBreakdown(it)}</p>
                            <p className="text-xs text-ink/40">{fmtMoney(itemValue(it), settings?.currency)}</p>
                          </div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); openModal("item", { editingItem: it }); }} className="rounded-full p-2 text-ink/40 hover:bg-paper">
                            <Pencil size={15} />
                          </button>
                          <ChevronDown size={15} className={`shrink-0 text-ink/30 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-1.5 border-t border-line/70 pt-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-ink/40">Value on hand</span>
                            <span className="font-semibold text-ink">{fmtMoney(itemValue(it), settings?.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-ink/40">Last sold</span>
                            <span className="font-semibold text-ink">
                              {dead?.lastSaleDate ? dead.lastSaleDate : lastOrder ? new Date(lastOrder.date).toLocaleDateString() : "No sales yet"}
                            </span>
                          </div>
                          {reorder && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-ink/40">Sales pace</span>
                              <span className="font-semibold text-ink">{reorder.daysLeft != null ? `~${reorder.daysLeft} days of cover left` : "Pace unavailable"}</span>
                            </div>
                          )}
                          {reorder?.vendor && (
                            <a
                              href={waLink(reorder.vendor.phone, `Hi ${reorder.vendor.name}, I'd like to order ${fmtNum(reorder.suggestedQty)} ${it.unit || "unit"} of ${it.name}.`)}
                              target="_blank" rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink/80"
                            >
                              Reorder +{fmtNum(reorder.suggestedQty)} from {reorder.vendor.name} ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {stockTakeOpen && (
        <StockTakeModal items={items} godowns={godowns} applyStockAdjustments={applyStockAdjustments} onClose={() => setStockTakeOpen(false)} />
      )}
    </div>
  );
}
