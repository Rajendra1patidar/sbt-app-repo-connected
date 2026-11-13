import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../common/UIPrimitives";
import { Group, GroupLabel, GroupRow, InsightNote, LargeTitle, PrimaryButton, RoundButton, SecondaryButton, Segmented, cx } from "../ui/kit";
import { SearchIcon } from "../ui/icons";
import { NAV, NAV_BLURB, TABS } from "../../lib/constants";
import { inr, inrRate, qtyText } from "../../lib/money";
import { bubbleSize, computeCover, groupByCategory, sortForMap, TIER_LABEL, type CoverRow, type CoverTier } from "../../lib/stockCover";

/* ---- Stock ----
 * Not a table: a map of how long each thing will last. Bubble size is the value
 * of stock on hand; colour is days of cover (14+ blue, 7 to 14 yellow, 5 to 7
 * orange, under 5 red). Tap a bubble for the number and the next step. */

const TIER_STYLE: Record<CoverTier, { bg: string; fg: string }> = {
  ok: { bg: "rgb(var(--c-brand-100))", fg: "rgb(var(--c-brand-600))" },
  watch: { bg: "#F1C21B", fg: "#161616" },
  soon: { bg: "#FF832B", fg: "#161616" },
  now: { bg: "#DA1E28", fg: "#FFFFFF" },
};
const URGENCY: Record<CoverTier, number> = { now: 0, soon: 1, watch: 2, ok: 3 };

function Bubble({ row, size, selected, onSelect }: { row: CoverRow; size: number; selected: boolean; onSelect: () => void }) {
  const s = TIER_STYLE[row.tier];
  const flagged = row.tier !== "ok";
  const aria = `${row.name}, ${row.days != null ? `${row.days} day${row.days === 1 ? "" : "s"} of cover` : row.low ? "low on stock" : "no recent sales"}${selected ? ", selected" : ""}`;
  return (
    <button type="button" onClick={onSelect} aria-label={aria} aria-pressed={selected}
      style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size >= 40 ? 12 : 11, boxShadow: selected ? "0 0 0 3px rgb(var(--color-card)), 0 0 0 5px rgb(var(--c-brand-500))" : undefined }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold transition-transform active:scale-90">
      {flagged ? row.label : ""}
    </button>
  );
}

function BubbleRows({ groups, maxValue, selectedId, onSelect }: { groups: { label: string; rows: CoverRow[] }[]; maxValue: number; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 text-caption text-mute">{g.label}</div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {g.rows.map((r) => <Bubble key={r.id} row={r} size={bubbleSize(r.value, maxValue, r.tier !== "ok")} selected={selectedId === r.id} onSelect={() => onSelect(r.id)} />)}
          </div>
        </div>
      ))}
    </>
  );
}

export function StockHealthView({ items, estimates, purchases, vendors, godowns, reorderSuggestions, currency, openModal, go, onSearch }: any) {
  const [mode, setMode] = useState<"cover" | "godown" | "value">("cover");
  const cover = useMemo(() => computeCover({ items, estimates, purchases, vendors, godowns, reorderSuggestions }), [items, estimates, purchases, vendors, godowns, reorderSuggestions]);
  const maxValue = useMemo(() => Math.max(1, ...cover.map((r) => r.value)), [cover]);

  // Start on what matters most: of what's running short, the one that costs the most per day it's out.
  const urgent = useMemo(() => {
    const short = cover.filter((r) => r.tier === "now" || r.tier === "soon").sort((a, b) => b.dailyValue - a.dailyValue || (a.days ?? 999) - (b.days ?? 999));
    return short[0] || [...cover].sort((a, b) => URGENCY[a.tier] - URGENCY[b.tier] || (a.days ?? 999) - (b.days ?? 999) || b.value - a.value)[0];
  }, [cover]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (!selectedId || !cover.some((r) => r.id === selectedId)) setSelectedId(urgent?.id ?? null); }, [cover, urgent, selectedId]);
  const selected = cover.find((r) => r.id === selectedId) || null;

  const byCategory = useMemo(() => groupByCategory(cover), [cover]);
  const byGodown = useMemo(() => {
    return (godowns || []).map((g: any) => ({
      label: g.name as string,
      rows: sortForMap(cover.filter((r) => r.holdings.some((h) => h.id === String(g.id)))),
    })).filter((g: any) => g.rows.length > 0);
  }, [cover, godowns]);
  const byValue = useMemo(() => [...cover].filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 12), [cover]);
  const totalValue = useMemo(() => cover.reduce((s, r) => s + r.value, 0), [cover]);

  const members = TABS.find((t) => t.id === "stock")!.members.map((id) => NAV.find((n) => n.id === id)).filter(Boolean) as any[];

  /* ---- the panel under the map ---- */
  const panel = (r: CoverRow) => {
    const main = r.holdings.find((h) => h.id === r.mainGodownId) || r.holdings[0];
    const donor = r.holdings.filter((h) => h.id !== main?.id)[0];
    const multi = (godowns || []).length > 1;
    const where = multi && main ? `${main.name}, ${qtyText(main.qty)} ${r.unit} left` : `${qtyText(r.stock)} ${r.unit} left`;
    const unknown = r.days == null;
    const hero = unknown ? `${qtyText(r.stock)} ${r.unit}` : r.days! <= 0 ? "Out" : `${r.days} day${r.days === 1 ? "" : "s"}`;
    const sub = unknown
      ? (r.low ? "in stock, below the level you set for this item" : "in stock, not enough recent sales to measure cover")
      : r.days! <= 0 ? "of stock left" : `of cover at about ${qtyText(r.perDay || 0)} ${r.unit} a day`;
    const suggestion = r.suggestQty > 0
      ? `Order ${qtyText(r.suggestQty)} ${r.unit}${r.vendorName ? ` from ${r.vendorName}` : ""}.${r.lastRate ? ` Last price ${inrRate(r.lastRate, currency)} a ${r.unit}.` : ""}`
      : null;
    const need = r.perDay && main ? Math.ceil(r.perDay * 14 - main.qty) : 0;
    const moveQty = donor && need > 0 ? Math.min(Math.floor(donor.qty), need) : undefined;

    return (
      <div className="mt-3 rounded-[20px] border border-line bg-card px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[20px] font-semibold leading-[26px] text-ink">{r.name}</span>
          <span className="shrink-0 text-caption text-mute">{where}</span>
        </div>
        <p className="mt-0.5 text-hero-md tabular-nums text-ink">{hero}</p>
        <p className="text-caption text-mute">{sub}</p>
        {suggestion ? (
          <InsightNote className="mt-2.5 !rounded-[12px] !py-[9px]">{suggestion}</InsightNote>
        ) : (
          <p className="mt-2.5 text-[14px] text-mute">{unknown ? "Sell a few more and a pace will show here." : "Plenty of cover. Nothing to order yet."}</p>
        )}
        <div className="mt-2.5 flex gap-2">
          <PrimaryButton size="md" full={false} className="flex-1" onClick={() => openModal("order", { itemId: r.id, qty: r.suggestQty || undefined, vendorId: r.vendorId, rate: r.lastRate })}>Create purchase</PrimaryButton>
          {donor && multi && (
            <SecondaryButton full={false} className="flex-1 !leading-tight" onClick={() => openModal("stockTransfer", { itemId: r.id, fromGodownId: donor.id, toGodownId: main?.id, qty: moveQty })}>
              Move from {donor.name}
            </SecondaryButton>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      <LargeTitle title="Stock" right={<RoundButton label="Search" onClick={onSearch}><SearchIcon size={22} /></RoundButton>} />

      {cover.length === 0 ? (
        <Group className="mt-4"><EmptyState text="Add items to see how long your stock will last." cta="New item" onCta={() => openModal("item")} /></Group>
      ) : (
        <>
          <div className="mt-3.5">
            <Segmented ariaLabel="Stock view" options={[{ value: "cover", label: "By cover" }, { value: "godown", label: "By godown" }, { value: "value", label: "By value" }]} value={mode} onChange={(v) => setMode(v as any)} />
          </div>

          <div className="mt-3.5 rounded-group border border-line bg-card px-4 py-3.5">
            {mode === "cover" && <BubbleRows groups={byCategory} maxValue={maxValue} selectedId={selectedId} onSelect={setSelectedId} />}
            {mode === "godown" && (
              byGodown.length > 0
                ? <BubbleRows groups={byGodown} maxValue={maxValue} selectedId={selectedId} onSelect={setSelectedId} />
                : <p className="py-2 text-[14px] text-mute">Stock isn't split across godowns yet.</p>
            )}
            {mode === "value" && (
              <div className="-mx-1">
                {byValue.map((r) => (
                  <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} aria-pressed={selectedId === r.id}
                    className={cx("relative mb-1.5 flex h-11 w-full items-center justify-between gap-3 overflow-hidden rounded-control px-3 text-left", selectedId === r.id && "ring-2 ring-brand-500")}>
                    <span className="absolute inset-y-0 left-0 rounded-control" style={{ width: `${Math.max(4, (r.value / (byValue[0]?.value || 1)) * 100)}%`, background: TIER_STYLE[r.tier].bg, opacity: r.tier === "ok" ? 0.55 : 0.3 }} />
                    <span className="relative min-w-0 truncate text-[15px] font-medium text-ink">{r.name}</span>
                    <span className="relative shrink-0 text-[15px] tabular-nums text-ink">{inr(r.value, currency)}</span>
                  </button>
                ))}
                <p className="px-1 pt-1 text-micro text-mute">Total at purchase price, {inr(totalValue, currency)}.</p>
              </div>
            )}

            <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-micro text-mute">
              {(["ok", "watch", "soon", "now"] as CoverTier[]).map((t) => (
                <span key={t} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-md" style={{ background: TIER_STYLE[t].bg }} />{TIER_LABEL[t]}</span>
              ))}
            </div>
            <p className="mt-1.5 text-micro text-mute">{mode === "value" ? "Bars show the value of stock on hand." : "Bubble size shows the value of stock on hand."}</p>
          </div>

          {selected && panel(selected)}
        </>
      )}

      <GroupLabel className="mt-6">More in Stock</GroupLabel>
      <Group>
        {members.map((n) => (
          <GroupRow key={n.id} onClick={() => go(n.id)} chevron className="min-h-[60px] py-2">
            <p className="text-[16px] text-ink">{n.label}</p>
            <p className="text-micro text-mute">{NAV_BLURB[n.id]}</p>
          </GroupRow>
        ))}
      </Group>
    </div>
  );
}
