import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, Pencil, Printer, ShoppingBag, X } from "lucide-react";
import { Card } from "../common/UIPrimitives";
import { ITEM_CATEGORIES, LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtNum } from "../../lib/format";

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
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
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

export function ToDoTrackingView({ items, settings, orders, openModal }: any) {
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [infoFor, setInfoFor] = useState<string | null>(null);

  const lowItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));
  const categoryFiltered = category === "All" ? items : items.filter((it: any) => (it.category || "Others") === category);
  const allItems = [...categoryFiltered].sort((a: any, b: any) => (a.stock ?? 0) - (b.stock ?? 0));

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
                  <button onClick={() => setInfoFor(it.id)} className="rounded-full p-2 text-ink/40 hover:bg-white"><Info size={15} /></button>
                  <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-white"><Pencil size={15} /></button>
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
            <div className="mb-3 flex flex-wrap gap-2">
              {["All", ...ITEM_CATEGORIES].map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
              ))}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-ink/40">No items added yet. Go to Items to add your first product.</p>
            ) : allItems.length === 0 ? (
              <p className="text-sm text-ink/40">No items match this category.</p>
            ) : (
              <ul className="space-y-2">
                {allItems.map((it: any) => (
                  <li key={it.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{it.name}</p>
                      <p className="text-xs text-ink/40">{it.unit || "unit"} · {it.category || "Others"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className={`font-display text-base font-bold ${stockColor(it)}`}>{stockBreakdown(it)}</p>
                        <p className="text-xs text-ink/40">/ alert ≤{fmtNum(it.lowStock ?? LOW_STOCK_DEFAULT)}</p>
                      </div>
                      <button onClick={() => setInfoFor(it.id)} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Info size={15} /></button>
                      <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Pencil size={15} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {selectedItem && (
        <ItemInfoModal item={selectedItem} orders={orders || []} onClose={() => setInfoFor(null)} />
      )}
    </div>
  );
}
