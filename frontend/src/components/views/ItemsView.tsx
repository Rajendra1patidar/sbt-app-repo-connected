import { useMemo, useState } from "react";
import { EmptyNote, FilterChips } from "../ui/blocks";
import { ChevronDownIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, SearchField, StatusChip, cx } from "../ui/kit";
import { ItemSheet } from "../items/ItemSheet";
import { QuantityMapGroup } from "../items/QuantityMapGroup";
import { ITEM_CATEGORIES } from "../../lib/constants";
import { inrCompact, inrRate } from "../../lib/money";
import { stockState, stockText, stockValue, unitName } from "../../lib/stockStatus";

/* ---- Items ----
 * What you sell, with the price and what is on hand. Grouped by category (the first two open, the
 * rest folded), narrowed by category and brand chips, or searched across everything.
 * Tap a row for the item's sheet: stock by godown, value, margin, the last 7 days, and the actions
 * (correct stock, edit, delete), so nothing on a row can be changed by a stray tap. */

const SEARCH_CAP = 80;
const GROUP_CAP = 40;

const byName = (a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });

export function ItemsView({ items, categories, brands, openModal, removeItem, currency, purchases, estimates, applyStockAdjustments, godowns, reorderSuggestions, deadStock }: any) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [brand, setBrand] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [uncapped, setUncapped] = useState<Record<string, boolean>>({});

  const active = useMemo(() => (items || []).filter((it: any) => !it.deleted), [items]);
  const configured: string[] = categories?.length ? categories : ITEM_CATEGORIES;

  // Chips list only what exists: a category with no items would be a dead end.
  const categoryOptions = useMemo(() => {
    const present = new Set<string>(active.map((it: any) => it.category || "Others"));
    const ordered = [...configured.filter((c) => present.has(c)), ...[...present].filter((c) => !configured.includes(c)).sort()];
    return [{ value: "All", label: "All" }, ...ordered.map((c) => ({ value: c, label: c }))];
  }, [active, configured]);
  const brandOptions = useMemo(() => {
    const present = [...new Set<string>(active.map((it: any) => it.brand || "").filter(Boolean))].sort();
    return present.length > 1 ? [{ value: "All", label: "All brands" }, ...present.map((b) => ({ value: b, label: b }))] : [];
  }, [active]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => active.filter((it: any) => {
    const matchesSearch = !q
      || String(it.name || "").toLowerCase().includes(q)
      || String(it.brand || "").toLowerCase().includes(q)
      || String(it.category || "").toLowerCase().includes(q)
      || String(it.unit || "").toLowerCase().includes(q);
    return matchesSearch && (category === "All" || (it.category || "Others") === category) && (brand === "All" || (it.brand || "") === brand);
  }).sort(byName), [active, q, category, brand]);

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const it of filtered) { const c = it.category || "Others"; if (!map.has(c)) map.set(c, []); map.get(c)!.push(it); }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, list]) => ({ key, list, value: list.reduce((s, it) => s + stockValue(it), 0) }));
  }, [filtered]);

  const totalValue = active.reduce((s: number, it: any) => s + stockValue(it), 0);
  const attention = active.filter((it: any) => { const st = stockState(it); return st === "low" || st === "out"; }).length;
  const narrowed = category !== "All" || brand !== "All";
  const opened = openId ? active.find((it: any) => it.id === openId) : null;
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);

  const row = (it: any, showCategory: boolean) => {
    const state = stockState(it);
    const price = Number(it.sellingPrice ?? it.price ?? 0);
    const caption = [showCategory ? it.category || "Others" : "", it.brand, `${inrRate(price, currency)} a ${unitName(it)}`].filter(Boolean).join(", ");
    return (
      <GroupRow key={it.id} onClick={() => setOpenId(it.id)} className="min-h-[64px] py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{it.name}</p>
            <p className="truncate text-caption text-mute">{caption}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={cx("text-lead font-medium tabular-nums", state === "out" ? "text-bad-600" : state === "low" ? "text-warn-700" : "text-ink")}>{stockText(it)}</p>
            {state === "out" && <StatusChip tone="risk" small className="mt-1">Out</StatusChip>}
            {state === "low" && <StatusChip tone="caution" small className="mt-1">Low</StatusChip>}
          </div>
        </div>
      </GroupRow>
    );
  };

  const capped = (key: string, list: any[], cap: number) => (uncapped[key] ? list : list.slice(0, cap));
  const showAll = (key: string, list: any[], cap: number, noun: string) => !uncapped[key] && list.length > cap && (
    <button type="button" onClick={() => setUncapped({ ...uncapped, [key]: true })} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {list.length} {noun}</button>
  );

  return (
    <div className="px-5 pb-28 md:pb-12">
      {active.length > 0 && (
        <p className="mt-3 px-1 text-caption text-mute">
          {active.length} item{active.length === 1 ? "" : "s"}, {inrCompact(totalValue, currency)} in stock at cost
          {attention > 0 && <span className="text-warn-700">, {attention} low or out</span>}
        </p>
      )}
      <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search name, brand or category" />
      {categoryOptions.length > 2 && <FilterChips className="mt-3" ariaLabel="Category" options={categoryOptions} value={category} onChange={setCategory} />}
      {brandOptions.length > 0 && <FilterChips className="mt-2" ariaLabel="Brand" options={brandOptions} value={brand} onChange={setBrand} />}

      {active.length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Add the items you sell, with their price and how many you hold." cta="New item" onCta={() => openModal("item")} /></Group>
      ) : filtered.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">No items match{q ? ` “${search}”` : " these filters"}.</p></Group>
      ) : (
        <>
          {!q && !narrowed && <QuantityMapGroup className="mt-4" items={filtered} onSelectItem={(it: any) => setOpenId(it.id)} />}

          {q || narrowed ? (
            <>
              <GroupLabel right={<span>{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>}>{q ? "Results" : [category !== "All" ? category : "", brand !== "All" ? brand : ""].filter(Boolean).join(", ")}</GroupLabel>
              <Group>{capped("flat", filtered, q ? SEARCH_CAP : GROUP_CAP).map((it: any) => row(it, !!q))}</Group>
              {showAll("flat", filtered, q ? SEARCH_CAP : GROUP_CAP, "items")}
            </>
          ) : (
            groups.map((g, i) => {
              const folded = isCollapsed(g.key, i);
              return (
                <div key={g.key}>
                  <GroupLabel right={<span className="tabular-nums">{inrCompact(g.value, currency)}</span>}>
                    <button type="button" onClick={() => setCollapsed({ ...collapsed, [g.key]: !folded })} aria-expanded={!folded} className="inline-flex min-h-[28px] items-center gap-1">
                      <ChevronDownIcon size={14} className={cx("transition-transform", folded && "-rotate-90")} />
                      {g.key} <span className="text-faint">· {g.list.length}</span>
                    </button>
                  </GroupLabel>
                  {!folded && (
                    <>
                      <Group>{capped(g.key, g.list, GROUP_CAP).map((it: any) => row(it, false))}</Group>
                      {showAll(g.key, g.list, GROUP_CAP, g.key.toLowerCase())}
                    </>
                  )}
                </div>
              );
            })
          )}
        </>
      )}

      {opened && (
        <ItemSheet
          item={opened} items={items} godowns={godowns} currency={currency} purchases={purchases} estimates={estimates}
          reorderSuggestions={reorderSuggestions} deadStock={deadStock}
          openModal={openModal} applyStockAdjustments={applyStockAdjustments} removeItem={removeItem}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
