import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Archive, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Info, MapPin, Pencil, Printer, Search, ShoppingBag, TrendingDown, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card } from "../common/UIPrimitives";
import { ITEM_CATEGORIES, LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtMoney, fmtNum } from "../../lib/format";
import { waLink } from "../../lib/contactLinks";
import { StockTakeModal } from "../modals/StockTakeModal";

function ItemInfoModal({ item, orders, onClose }: any) {
  const stockBreakdown = (it: any): string => {
    if (it.trackingMode === "box" && it.piecesPerBox > 0) {
      const boxes = Math.floor((it.stock ?? 0) / it.piecesPerBox);
      const loose = (it.stock ?? 0) % it.piecesPerBox;
      return `${boxes} boxes + ${loose} pcs`;
    }
    return `${fmtNum(it.stock ?? 0)} ${it.unit || "unit"}`;
  };

  const lastOrder = orders
    .filter((o: any) => o.itemId === item.id)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">{item.name}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-paper px-4 py-3">
            <p className="text-xs font-semibold text-ink/50 mb-1">Stock on hand</p>
            <p className="font-display text-lg font-bold text-ink">{stockBreakdown(item)}</p>
            {item.trackingMode === "box" && item.piecesPerBox > 0 && (
              <p className="text-xs text-ink/40 mt-1">Box size: {item.piecesPerBox} pieces</p>
            )}
          </div>

          {lastOrder && (
            <div className="rounded-xl bg-paper px-4 py-3">
              <p className="text-xs font-semibold text-ink/50 mb-1">Last order</p>
              <p className="text-sm font-semibold text-ink">{fmtNum(lastOrder.qty)} pieces</p>
              <p className="text-xs text-ink/40 mt-1">{new Date(lastOrder.date).toLocaleDateString()}</p>
              {lastOrder.notes && <p className="text-xs text-ink/50 mt-1 italic">{lastOrder.notes}</p>}
            </div>
          )}
        </div>

        <button onClick={onClose} className="mt-6 w-full rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Close</button>
      </div>
    </div>
  );
}

function ReorderSuggestionsCard({ suggestions }: any) {
  const paceRows = (suggestions || []).filter((s: any) => s.mode === "pace");
  if (paceRows.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <TrendingDown size={18} className="text-brand-500" />
        <h3 className="font-display text-base font-bold text-ink">Reorder Suggestions</h3>
        <span className="ml-auto rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">{paceRows.length}</span>
      </div>
      <p className="mb-3 text-xs text-ink/40">Based on actual sales pace over the last 30 days — nothing is sent automatically.</p>
      <ul className="space-y-2">
        {paceRows.map((s: any) => (
          <li key={s.itemId} className="rounded-xl bg-brand-50/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">{s.name}</p>
              <p className="font-display text-base font-bold text-brand-700">+{fmtNum(s.suggestedQty)} {s.unit || "unit"}</p>
            </div>
            <p className="text-xs text-ink/50">
              {fmtNum(s.stock)} left · {s.daysLeft != null ? `~${s.daysLeft} days of cover at current pace` : "pace unavailable"}
            </p>
            {s.vendor && (
              <a
                href={waLink(s.vendor.phone, `Hi ${s.vendor.name}, I'd like to order ${fmtNum(s.suggestedQty)} ${s.unit || "unit"} of ${s.name}.`)}
                target="_blank" rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink/80"
              >
                Message {s.vendor.name} on WhatsApp
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DeadStockCard({ items, currency }: any) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Archive size={18} className="text-ink/40" />
        <h3 className="font-display text-base font-bold text-ink">Dead Stock</h3>
        <span className="ml-auto rounded-full bg-warn-100 px-2.5 py-0.5 text-xs font-bold text-warn-700">{items.length}</span>
      </div>
      <p className="mb-3 text-xs text-ink/40">No sales in 90+ days — nothing is discounted or archived automatically.</p>
      <ul className="space-y-2">
        {items.map((d: any) => (
          <li key={d.itemId} className="rounded-xl bg-paper px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">{d.name}</p>
              <p className="font-display text-sm font-bold text-ink/70">{fmtMoney(d.value, currency)} tied up</p>
            </div>
            <p className="text-xs text-ink/50">
              {d.isWeight ? `${fmtNum(d.stockKg || 0)}kg / ${fmtNum(d.stock || 0)}pc` : `${fmtNum(d.stock || 0)} on hand`}
              {" · "}{d.lastSaleDate ? `last sold ${d.lastSaleDate}` : "never sold"}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ToDoTrackingView({ items, settings, categories, orders, openModal, reorderSuggestions, deadStock, applyStockAdjustments, godowns }: any) {
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"stock" | "value" | "name">("stock");
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);
  const cats = categories?.length ? categories : ITEM_CATEGORIES;

  // Same "value" basis as the backend's stockValuation(): weighted-average
  // purchasePrice × whatever's on hand (kg for weight-tracked items, pieces
  // otherwise) — cost basis, not what it'd sell for.
  const itemValue = (it: any): number => {
    const qty = it.trackingMode === "weight" ? (it.stockKg ?? 0) : (it.stock ?? 0);
    return qty * (it.purchasePrice ?? 0);
  };

  const deadStockIds = new Set((deadStock || []).map((d: any) => d.itemId));

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

  // Full Inventory Stock can run into the hundreds or thousands of rows for a
  // godown with a large catalogue. Rendering every <li> at once was fine for
  // a few dozen items but starts to visibly lag scrolling well before that —
  // virtualizing this list keeps scroll smooth regardless of catalogue size,
  // since only the ~10 rows actually on screen are ever in the DOM.
  const scrollRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 78; // px — matches the row's padding + badge slot + qty + value lines

  const lowItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));
  const categoryFiltered = category === "All" ? items : items.filter((it: any) => (it.category || "Others") === category);
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

  const rowVirtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const stockColor = (it: any) => {
    const s = it.stock ?? 0;
    const t = it.lowStock ?? LOW_STOCK_DEFAULT;
    if (s === 0) return "text-bad-600";
    if (s <= t) return "text-warn-600";
    return "text-good-600";
  };

  const stockBreakdown = (it: any): string => {
    if (it.trackingMode === "box" && it.piecesPerBox > 0) {
      const boxes = Math.floor((it.stock ?? 0) / it.piecesPerBox);
      const loose = (it.stock ?? 0) % it.piecesPerBox;
      return `${boxes} boxes + ${loose} pcs`;
    }
    return fmtNum(it.stock ?? 0);
  };

  const printInventory = () => {
    const rowsHtml = allItems.map((it: any) =>
      `<tr><td>${it.name}</td><td>${it.unit || "unit"}</td><td style="text-align:right;">${stockBreakdown(it)}</td><td style="text-align:right;">${fmtNum(it.lowStock ?? LOW_STOCK_DEFAULT)}</td></tr>`
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
      <table><thead><tr><th>Item</th><th>Unit</th><th style="text-align:right;">In stock</th><th style="text-align:right;">Alert ≤</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const selectedItem = infoFor ? items.find((it: any) => it.id === infoFor) : null;

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

      <ReorderSuggestionsCard suggestions={reorderSuggestions} />
      <DeadStockCard items={deadStock} currency={settings?.currency} />

      {/* Low inventory alerts */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-warn-500" />
          <h3 className="font-display text-base font-bold text-ink">Low Inventory Alerts</h3>
          {lowItems.length > 0 && (
            <span className="ml-auto rounded-full bg-warn-100 px-2.5 py-0.5 text-xs font-bold text-warn-700">{lowItems.length}</span>
          )}
        </div>
        {lowItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-good-50 px-4 py-3">
            <CheckCircle2 size={18} className="text-good-500" />
            <p className="text-sm font-semibold text-good-700">All items are well-stocked!</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lowItems.map((it: any) => (
              <li key={it.id} className="flex items-center justify-between rounded-xl bg-warn-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{it.name}</p>
                  <p className="text-xs text-ink/50">{it.unit || "unit"} · Alert threshold: {fmtNum(it.lowStock ?? LOW_STOCK_DEFAULT)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={`font-display text-xl font-bold ${(it.stock ?? 0) === 0 ? "text-bad-600" : "text-warn-600"}`}>{fmtNum(it.stock ?? 0)}</p>
                    <p className="text-xs text-ink/40">in stock</p>
                  </div>
                  <button onClick={() => setInfoFor(it.id)} className="rounded-full p-2 text-ink/40 hover:bg-card"><Info size={15} /></button>
                  <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-card"><Pencil size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Full inventory — collapsible */}
      <Card>
        <button
          onClick={() => setInventoryOpen((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <ShoppingBag size={17} className="text-ink/50" />
            <h3 className="font-display text-base font-bold text-ink">Full Inventory Stock</h3>
            <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink/50">{items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span onClick={(e) => { e.stopPropagation(); printInventory(); }} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink/80"><Printer size={12} /> Print</span>
            {inventoryOpen ? <ChevronUp size={18} className="text-ink/40" /> : <ChevronDown size={18} className="text-ink/40" />}
          </div>
        </button>

        {inventoryOpen && (
          <div className="mt-4">
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
                <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
              ))}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-ink/40">No items added yet. Go to Items to add your first product.</p>
            ) : allItems.length === 0 ? (
              <p className="text-sm text-ink/40">No items match this search or category.</p>
            ) : (
              <div ref={scrollRef} className="max-h-[480px] overflow-y-auto">
                <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const it = allItems[virtualRow.index];
                    return (
                      <div
                        key={it.id}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                        className="pb-2"
                      >
                        <div className="flex h-full items-center justify-between rounded-xl border border-line px-4 py-2.5">
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
                                {(it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT) ? (
                                  <span className="inline-block rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-bold text-warn-700">Low</span>
                                ) : deadStockIds.has(it.id) ? (
                                  <span className="inline-block rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink/40">No sale 90d+</span>
                                ) : null}
                              </div>
                              <p className={`font-display text-base font-bold ${stockColor(it)}`}>{stockBreakdown(it)}</p>
                              <p className="text-xs text-ink/40">{fmtMoney(itemValue(it), settings?.currency)}</p>
                            </div>
                            <button onClick={() => setInfoFor(it.id)} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Info size={15} /></button>
                            <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Pencil size={15} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {selectedItem && (
        <ItemInfoModal item={selectedItem} orders={orders || []} onClose={() => setInfoFor(null)} />
      )}
      {stockTakeOpen && (
        <StockTakeModal items={items} applyStockAdjustments={applyStockAdjustments} onClose={() => setStockTakeOpen(false)} />
      )}
    </div>
  );
}
