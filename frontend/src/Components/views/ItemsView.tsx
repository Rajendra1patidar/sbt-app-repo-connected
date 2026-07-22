import React, { useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { ITEM_CATEGORIES, LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtMoney, fmtNum } from "../../lib/format";

/* ---- Items (with stock display) ---- */

export function ItemsView({ items, openModal, removeItem, currency }: any) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = items.filter((it: any) => {
    const matchesSearch = !search.trim() || it.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = category === "All" || (it.category || "Others") === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{items.length} item{items.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("item")}><Plus size={16} /> New Item</PillButton>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {["All", ...ITEM_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
        ))}
      </div>
      {items.length === 0
        ? <Card><EmptyState text="Add items you sell." cta="New Item" onCta={() => openModal("item")} /></Card>
        : filtered.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No items match your search/filter.</p></Card>
        : filtered.map((it: any) => {
          const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
          const isLow = (it.stock ?? 0) <= threshold;
          return (
            <Card key={it.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink truncate">{it.name}</p>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink/50">{it.category || "Others"}</span>
                  {isLow && <span className="rounded-full bg-warn-100 px-2 py-0.5 text-xs font-semibold text-warn-700 flex items-center gap-1"><AlertTriangle size={10} /> Low stock</span>}
                </div>
                <p className="text-xs text-ink/40">{it.unit || "unit"} · Stock: <span className={`font-semibold ${isLow ? "text-warn-600" : "text-ink/80"}`}>{fmtNum(it.stock ?? 0)}</span> (alert at ≤{fmtNum(threshold)})</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-ink/40">Sell: <span className="font-bold text-ink">{fmtMoney(it.sellingPrice ?? it.price, currency)}</span></p>
                  {it.purchasePrice > 0 && <p className="text-xs text-ink/40">Buy: <span className="font-semibold text-ink/70">{fmtMoney(it.purchasePrice, currency)}</span></p>}
                </div>
                <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Pencil size={16} /></button>
                <button onClick={() => removeItem(it.id)} className="rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={16} /></button>
              </div>
            </Card>
          );
        })
      }
    </div>
  );
}
