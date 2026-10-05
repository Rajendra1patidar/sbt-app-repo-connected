import React, { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { fmtMoney } from "../../lib/format";
import { queryWords, searchItems } from "../../lib/itemSearch";

// Bottom-sheet item picker: search, filter by category, tap to select many
// items, type each quantity right on its card, then add them all in one go.
export function ItemPickerSheet({ items, customerName, usualItems, onTheEstimateIds, stockLabel, onConfirm, onClose, onAddNew }: {
  items: any[];
  customerName?: string;
  usualItems: any[];
  onTheEstimateIds: Set<string>;
  stockLabel: (it: any) => string;
  onConfirm: (picked: { itemId: string; qty: number }[]) => void;
  onClose: () => void;
  onAddNew?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [pick, setPick] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => { if (it.category) set.add(it.category); });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const tokens = useMemo(() => queryWords(query), [query]);
  const MAX_SHOWN = 100;
  const list = useMemo(() => {
    const pool = cat === "All" ? items : items.filter((it) => it.category === cat);
    if (tokens.length) return searchItems(pool, query, MAX_SHOWN);
    return [...pool].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_SHOWN);
  }, [items, cat, query, tokens]);

  const toggle = (id: string) => setPick((p) => {
    const next = { ...p };
    if (id in next) delete next[id]; else next[id] = "1";
    return next;
  });

  const ids = Object.keys(pick);
  const itemOf = (id: string) => items.find((it) => it.id === id);
  const validPicks = ids.filter((id) => Number(pick[id]) > 0);
  const allValid = ids.length > 0 && validPicks.length === ids.length;
  const total = ids.reduce((s, id) => s + Number(pick[id] || 0) * Number(itemOf(id)?.sellingPrice || 0), 0);

  const confirm = () => {
    if (!allValid) return;
    onConfirm(ids.map((id) => ({ itemId: id, qty: Number(pick[id]) })));
  };

  const highlight = (label: string) => {
    const low = label.toLowerCase();
    for (const t of tokens) {
      const i = low.indexOf(t);
      if (i > -1) return (<>{label.slice(0, i)}<mark className="rounded-sm bg-brand-100 text-brand-800">{label.slice(i, i + t.length)}</mark>{label.slice(i + t.length)}</>);
    }
    return label;
  };

  const showUsual = !query.trim() && cat === "All" && usualItems.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 animate-fade-in" onClick={onClose}>
      <div className="animate-sheet-up flex h-[88vh] w-full flex-col rounded-t-3xl bg-card shadow-xl sm:max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-ink">Add items</h3>
            <div className="flex items-center gap-2">
              {onAddNew && (
                <button type="button" onClick={onAddNew}
                  className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-1.5 pr-3 text-xs font-bold text-brand-700 hover:bg-brand-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"><Plus size={12} /></span>New item
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border-2 border-brand-300 bg-card px-3 focus-within:border-brand-500">
            <Search size={17} className="shrink-0 text-ink/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
              placeholder="Search name, brand, size, category"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="shrink-0 rounded-full p-1 text-ink/40 hover:bg-paper"><X size={15} /></button>}
          </div>
        </div>

        {categories.length > 2 && (
          <div className="flex gap-1.5 overflow-x-auto px-5 py-2.5 [scrollbar-width:none]">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${c === cat ? "border-transparent bg-brand-600 text-white" : "border-line bg-paper text-ink/60"}`}>{c}</button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {showUsual && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-ink/50">{customerName ? `${customerName} usually buys` : "Usually bought"}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {usualItems.map((it) => (
                  <button key={it.id} type="button" onClick={() => toggle(it.id)}
                    className={`max-w-[10rem] shrink-0 rounded-xl border px-2.5 py-1.5 text-left ${it.id in pick ? "border-brand-300 bg-brand-50" : "border-line bg-paper"}`}>
                    <span className="line-clamp-2 block text-xs font-semibold leading-tight text-ink">{it.name}</span>
                    <span className="mt-0.5 block text-[11px] text-ink/50">{fmtMoney(Number(it.sellingPrice || 0), "")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {list.length === 0 ? (
            <p className="py-6 text-sm text-ink/50">
              No match{query.trim() ? ` for "${query.trim()}"` : ""}.{" "}
              {onAddNew && <button type="button" onClick={onAddNew} className="font-semibold text-brand-600">Add as new item</button>}
            </p>
          ) : list.map((it) => {
            const sel = it.id in pick;
            const unit = it.trackingMode === "weight" ? "kg" : (it.unit || "");
            const bad = sel && !(Number(pick[it.id]) > 0);
            return (
              <div key={it.id} onClick={() => toggle(it.id)}
                className={`mb-1.5 flex cursor-pointer gap-2.5 rounded-xl border p-2.5 ${sel ? "border-brand-300 bg-brand-50" : "border-line bg-card"}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${sel ? "border-brand-600 bg-brand-600 text-white" : "border-line"}`}>
                  {sel && <Check size={12} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-words text-sm font-semibold leading-snug text-ink">{highlight(it.name)}</p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{fmtMoney(Number(it.sellingPrice || 0), "")}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-ink/50">
                    {it.category ? `${it.category} · ` : ""}{stockLabel(it)}
                    {onTheEstimateIds.has(it.id) && <span className="font-semibold text-good-600"> · on estimate</span>}
                  </p>
                  {sel && (
                    <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-ink/50">{it.trackingMode === "weight" ? "Weight" : "Qty"}</span>
                      <input type="number" inputMode="decimal" min="0.01" step="0.01" value={pick[it.id]}
                        onChange={(e) => setPick((p) => ({ ...p, [it.id]: e.target.value }))}
                        className={`h-8 w-20 rounded-lg border bg-card px-1 text-center text-sm font-semibold ${bad ? "border-bad-300" : "border-line"}`} />
                      <span className="text-xs text-ink/50">{unit}</span>
                      <span className="ml-auto text-sm font-semibold tabular-nums text-ink">{fmtMoney(Number(pick[it.id] || 0) * Number(it.sellingPrice || 0), "")}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {list.length >= MAX_SHOWN && <p className="py-2 text-center text-[11px] text-ink/40">Showing the first {MAX_SHOWN}. Search to narrow it down.</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {ids.length > 0 && <button type="button" onClick={() => setPick({})} className="px-1 text-sm font-semibold text-ink/50">Clear</button>}
          <button type="button" disabled={!allValid} onClick={confirm}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {ids.length === 0 ? "Select items to add" : `Add ${ids.length} item${ids.length > 1 ? "s" : ""} · ${fmtMoney(total, "")}`}
          </button>
        </div>
      </div>
    </div>
  );
}