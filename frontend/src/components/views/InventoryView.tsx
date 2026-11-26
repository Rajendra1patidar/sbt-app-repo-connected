import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyNote, FilterChips, StatRow } from "../ui/blocks";
import { Group, GroupLabel, GroupRow, HeroMoney, PrimaryButton, SearchField, SecondaryButton, Segmented, StatusChip, cx } from "../ui/kit";
import { ItemSheet } from "../items/ItemSheet";
import { FoldedGroup } from "../items/FoldedGroup";
import { QuantityMapGroup } from "../items/QuantityMapGroup";
import { ValueBars } from "../items/ValueBars";
import { StockTakeModal } from "../modals/StockTakeModal";
import { ITEM_CATEGORIES } from "../../lib/constants";
import { notice } from "../../lib/confirm";
import { fmtMoney } from "../../lib/format";
import { inr, qtyText } from "../../lib/money";
import { stockState, stockText, stockValue } from "../../lib/stockStatus";

/* ---- Inventory: what you hold, and the stock take ----
 * The numbers at the top, the Stock take button (count a shelf, paste the list, check it, apply it),
 * then every item with its stock and value, filtered by All / Low / Dead / Reorder.
 * Tap an item for the same sheet Items opens: where it sits, last sold, last bought, margin, the
 * reorder advice, and the way to correct its stock. */

type Tab = "all" | "low" | "dead" | "reorder";
type Sort = "stock" | "value" | "name";
const PAGE = 50;

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function ToDoTrackingView({ items, settings, categories, openModal, reorderSuggestions, deadStock, applyStockAdjustments, godowns, purchases, estimates, removeItem }: any) {
  const navigate = useNavigate();
  const currency = settings?.currency;
  const active = useMemo(() => (items || []).filter((it: any) => !it.deleted), [items]);

  const deadById: Map<string, any> = useMemo(() => new Map((deadStock || []).map((d: any) => [String(d.itemId), d])), [deadStock]);
  const reorderById: Map<string, any> = useMemo(() => new Map((reorderSuggestions || []).filter((s: any) => s.mode === "pace").map((s: any) => [String(s.itemId), s])), [reorderSuggestions]);

  const lowItems = active.filter((it: any) => { const st = stockState(it); return st === "low" || st === "out"; });
  const deadItems = active.filter((it: any) => deadById.has(String(it.id)));
  const reorderItems = active.filter((it: any) => reorderById.has(String(it.id)));

  // Open on whatever needs attention first. Only on mount, so a later refresh never overrides the person's own choice.
  const initialTab = useMemo((): Tab => (lowItems.length > 0 ? "low" : deadItems.length > 0 ? "dead" : reorderItems.length > 0 ? "reorder" : "all"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<Sort>("stock");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);

  const configured: string[] = categories?.length ? categories : ITEM_CATEGORIES;
  const categoryOptions = useMemo(() => {
    const present = new Set<string>(active.map((it: any) => it.category || "Others"));
    const ordered = [...configured.filter((c) => present.has(c)), ...[...present].filter((c) => !configured.includes(c)).sort()];
    return ordered.length > 1 ? [{ value: "All", label: "All" }, ...ordered.map((c) => ({ value: c, label: c }))] : [];
  }, [active, configured]);

  const totalValue = active.reduce((s: number, it: any) => s + stockValue(it), 0);
  const deadValue = (deadStock || []).reduce((s: number, d: any) => s + (d.value || 0), 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of active) map.set(it.category || "Others", (map.get(it.category || "Others") || 0) + stockValue(it));
    return [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [active]);

  const tabItems = tab === "low" ? lowItems : tab === "dead" ? deadItems : tab === "reorder" ? reorderItems : active;
  const q = search.trim().toLowerCase();
  const list = useMemo(() => [...tabItems
    .filter((it: any) => category === "All" || (it.category || "Others") === category)
    .filter((it: any) => !q || String(it.name || "").toLowerCase().includes(q))]
    .sort((a: any, b: any) => sortBy === "value" ? stockValue(b) - stockValue(a) : sortBy === "name" ? String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true }) : (a.stock ?? 0) - (b.stock ?? 0)),
  [tabItems, category, q, sortBy]);
  const shown = list.slice(0, limit);
  const opened = openId ? active.find((it: any) => it.id === openId) : null;
  const reset = () => setLimit(PAGE);

  // Which godown an item sits in, once there is more than one to tell apart.
  const locationLabel = (it: any): string | null => {
    if (!godowns || godowns.length <= 1) return null;
    const present = (it.stockByGodown || []).filter((g: any) => (g.stock ?? 0) > 0 || (g.stockKg ?? 0) > 0);
    if (present.length === 0) return null;
    if (present.length > 1) return `${present.length} godowns`;
    return godowns.find((g: any) => String(g.id) === String(present[0].godownId))?.name || null;
  };

  const printInventory = () => {
    const rowsHtml = active.map((it: any) =>
      `<tr><td>${esc(it.name)}</td><td>${esc(it.unit || "unit")}</td><td style="text-align:right;">${esc(stockText(it))}</td><td style="text-align:right;">${esc(fmtMoney(stockValue(it), currency))}</td></tr>`
    ).join("");
    const w = window.open("", "_blank", "width=560,height=760");
    if (!w) { void notice({ title: "Allow pop-ups to print", message: "Your browser blocked the print window. Allow pop-ups for this site, then tap Print again." }); return; }
    w.document.write(`<!doctype html><html><head><title>Inventory</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
      h1 { font-size: 16px; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 4px 6px; border-bottom: 0.2mm solid #e2e8f0; font-size: 11px; }
      th { color: #64748b; font-weight: 600; }
    </style></head><body>
      <h1>${esc(settings?.orgName || "Business")} — Inventory</h1>
      <table><thead><tr><th>Item</th><th>Unit</th><th style="text-align:right;">In stock</th><th style="text-align:right;">Value</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const row = (it: any) => {
    const st = stockState(it);
    const dead = deadById.get(String(it.id));
    const where = locationLabel(it);
    return (
      <GroupRow key={it.id} onClick={() => setOpenId(it.id)} className="min-h-[64px] py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{it.name}</p>
            <p className="truncate text-caption text-mute">{[it.category || "Others", where].filter(Boolean).join(", ")}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={cx("text-lead font-medium tabular-nums", st === "out" ? "text-bad-600" : st === "low" ? "text-warn-700" : "text-ink")}>{stockText(it)}</p>
            <p className="text-caption tabular-nums text-mute">{inr(stockValue(it), currency)}</p>
            {st === "out" ? <StatusChip tone="risk" small className="mt-1">Out</StatusChip>
              : st === "low" ? <StatusChip tone="caution" small className="mt-1">Low</StatusChip>
              : dead ? <StatusChip tone="neutral" small dot={false} className="mt-1">No sale 90d</StatusChip> : null}
          </div>
        </div>
      </GroupRow>
    );
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "low", label: `Low ${lowItems.length}` },
    { value: "dead", label: `Dead ${deadItems.length}` },
    { value: "reorder", label: `Reorder ${reorderItems.length}` },
  ];
  const emptyText = tab === "low" ? "Nothing is low on stock." : tab === "dead" ? "Everything has sold in the last 90 days." : tab === "reorder" ? "Nothing needs reordering yet." : "No items match.";

  return (
    <div className="px-5 pb-28 md:pb-12">
      <div className="mt-4">
        <p className="text-caption text-mute">Stock at cost</p>
        <HeroMoney value={totalValue} currency={currency} size="md" showPaise={false} />
      </div>
      <div className="mt-3">
        <StatRow stats={[
          { label: "Items", value: qtyText(active.length) },
          { label: "Low or out", value: qtyText(lowItems.length), tone: lowItems.length > 0 ? "warn" : undefined },
          { label: "Dead stock", value: inr(deadValue, currency) },
        ]} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <PrimaryButton size="md" onClick={() => setStockTakeOpen(true)}>Start a stock take</PrimaryButton>
        <SecondaryButton onClick={() => navigate("/stock-adjustments")}>Past corrections</SecondaryButton>
      </div>

      {active.length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Add your items first, then come back to count them." cta="New item" onCta={() => openModal("item")} /></Group>
      ) : (
        <>
          <QuantityMapGroup className="mt-4" items={active} onSelectItem={(it: any) => setOpenId(it.id)} />
          {byCategory.length > 1 && (
            <FoldedGroup title="Value by category" className="mt-3"><ValueBars bare rows={byCategory} currency={currency} /></FoldedGroup>
          )}

          <div className="mt-5">
            <Segmented ariaLabel="Which items" options={tabs} value={tab} onChange={(v) => { setTab(v as Tab); reset(); }} />
          </div>
          <SearchField className="mt-3 !h-11" value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Search items" />
          {categoryOptions.length > 0 && <FilterChips className="mt-3" ariaLabel="Category" options={categoryOptions} value={category} onChange={(v) => { setCategory(v); reset(); }} />}
          <div className="mt-3">
            <Segmented ariaLabel="Sort" options={[{ value: "stock", label: "Lowest first" }, { value: "value", label: "Most value" }, { value: "name", label: "A to Z" }]} value={sortBy} onChange={(v) => { setSortBy(v as Sort); reset(); }} />
          </div>

          <GroupLabel right={<button type="button" onClick={printInventory} className="min-h-[28px] text-[13px] font-medium text-brand-600">Print all</button>}>{list.length} item{list.length === 1 ? "" : "s"}</GroupLabel>
          {list.length === 0 ? (
            <Group><p className="px-4 py-8 text-center text-[15px] text-mute">{emptyText}</p></Group>
          ) : (
            <>
              <Group>{shown.map(row)}</Group>
              {list.length > shown.length && (
                <button type="button" onClick={() => setLimit(limit + PAGE)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show {Math.min(PAGE, list.length - shown.length)} more</button>
              )}
            </>
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
      {stockTakeOpen && (
        <StockTakeModal items={items} godowns={godowns} applyStockAdjustments={applyStockAdjustments} onClose={() => setStockTakeOpen(false)} />
      )}
    </div>
  );
}
