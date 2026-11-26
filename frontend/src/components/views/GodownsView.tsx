import { useMemo, useState } from "react";
import { ArrowLeftRight, Pencil, Star, Trash2, Warehouse } from "lucide-react";
import { ActionRow, DetailRow, EmptyNote } from "../ui/blocks";
import { Group, GroupLabel, GroupRow, SearchField, Sheet, StatusChip } from "../ui/kit";
import { inr, inrCompact, qtyText } from "../../lib/money";
import { stockState, stockText } from "../../lib/stockStatus";
import { ValueBars } from "../items/ValueBars";
import { GodownsMapCard } from "./GodownsMapCard";

/* ---- Godowns ----
 * Where your stock is kept. One row per godown with what it holds and its share of the whole.
 * Tap a row for the sheet: the numbers, the categories that make up its value, the items inside,
 * and the actions (move stock out of it, make it the default, edit, archive). */

const ITEM_PREVIEW = 8;

export function GodownsView({ godowns, items, openModal, removeGodown, setDefaultGodown, settings, deadStock }: any) {
  const [openId, setOpenId] = useState<string | null>(null);
  const currency = settings?.currency;
  const deadIds = useMemo(() => new Set((deadStock || []).map((d: any) => String(d.itemId))), [deadStock]);

  // Cost-basis value of what sits in one godown: purchase price × quantity there (kg for weight items,
  // pieces otherwise). Low / dead reflect the item overall; stock is tracked per item, not per godown.
  const itemsAt = (godownId: string) =>
    (items || [])
      .filter((it: any) => !it.deleted)
      .map((it: any) => {
        const entry = (it.stockByGodown || []).find((g: any) => String(g.godownId) === String(godownId));
        if (!entry) return null;
        const qty = it.trackingMode === "weight" ? (entry.stockKg ?? 0) : (entry.stock ?? 0);
        if (qty <= 0) return null;
        const st = stockState(it);
        return {
          id: it.id, name: it.name, category: it.category || "Others",
          qtyText: stockText(it, entry.stock ?? 0, entry.stockKg ?? 0),
          value: qty * (it.purchasePrice ?? 0),
          low: st === "low" || st === "out", dead: deadIds.has(String(it.id)),
        };
      })
      .filter(Boolean) as { id: string; name: string; category: string; qtyText: string; value: number; low: boolean; dead: boolean }[];

  const stats = useMemo(() => (godowns || []).map((g: any) => {
    const list = itemsAt(g.id);
    return { g, list, count: list.length, value: list.reduce((s, i) => s + i.value, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [godowns, items, deadIds]);
  const totalValue = stats.reduce((s: number, x: any) => s + x.value, 0);
  const opened = openId ? stats.find((x: any) => x.g.id === openId) : null;

  return (
    <div className="px-5 pb-28 md:pb-12">
      {(godowns || []).length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Add your warehouses and storage places to track stock by location." cta="New godown" onCta={() => openModal("godown")} /></Group>
      ) : (
        <>
          <p className="mt-3 px-1 text-caption text-mute">{godowns.length} godown{godowns.length === 1 ? "" : "s"}, {inrCompact(totalValue, currency)} in stock at cost</p>
          <GodownsMapCard godowns={godowns} />

          {godowns.length > 1 && (
            <Group className="mt-4">
              <GroupRow onClick={() => openModal("stockTransfer")} chevron className="h-[52px]">
                <span className="flex items-center gap-3 text-[16px] text-ink"><ArrowLeftRight size={20} className="text-mute" /> Transfer stock between godowns</span>
              </GroupRow>
            </Group>
          )}

          <GroupLabel>Godowns</GroupLabel>
          <Group>
            {stats.map(({ g, count, value }: any) => {
              const share = totalValue > 0 ? (value / totalValue) * 100 : 0;
              return (
                <GroupRow key={g.id} onClick={() => setOpenId(g.id)} className="min-h-[72px] py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600"><Warehouse size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lead font-medium text-ink">{g.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {g.isDefault && <StatusChip tone="action" small dot={false}>Default</StatusChip>}
                        <p className="min-w-0 truncate text-caption text-mute">{g.location || g.manager || "No location set"}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lead font-medium tabular-nums text-ink">{inrCompact(value, currency)}</p>
                      <p className="text-caption tabular-nums text-mute">{count} item{count === 1 ? "" : "s"}, {Math.round(share)}%</p>
                    </div>
                  </div>
                </GroupRow>
              );
            })}
          </Group>
        </>
      )}

      {opened && (
        <GodownSheet
          godown={opened.g} list={opened.list} value={opened.value} totalValue={totalValue} currency={currency} canTransfer={godowns.length > 1}
          onClose={() => setOpenId(null)}
          onTransfer={() => { setOpenId(null); openModal("stockTransfer", { fromGodownId: opened.g.id }); }}
          onDefault={() => { setOpenId(null); setDefaultGodown(opened.g.id); }}
          onEdit={() => { setOpenId(null); openModal("godown", { editingGodown: opened.g }); }}
          onArchive={() => { setOpenId(null); removeGodown(opened.g.id); }}
        />
      )}
    </div>
  );
}

function GodownSheet({ godown: g, list, value, totalValue, currency, canTransfer, onClose, onTransfer, onDefault, onEdit, onArchive }: any) {
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const share = totalValue > 0 ? (value / totalValue) * 100 : 0;

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of list) map.set(it.category, (map.get(it.category) || 0) + it.value);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [list]);

  const q = search.trim().toLowerCase();
  const sorted = useMemo(() => [...list].filter((it: any) => !q || it.name.toLowerCase().includes(q)).sort((a: any, b: any) => b.value - a.value), [list, q]);
  const visible = all || q ? sorted : sorted.slice(0, ITEM_PREVIEW);

  return (
    <Sheet onClose={onClose} label={`Godown ${g.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-section text-ink">{g.name}</h2>
          <p className="mt-0.5 text-[15px] text-mute">{g.location || "No location set"}</p>
        </div>
        {g.isDefault && <StatusChip tone="action" dot={false} className="mt-1">Default</StatusChip>}
      </div>

      <Group className="mt-4">
        <DetailRow label="Stock value">{inr(value, currency)}</DetailRow>
        <DetailRow label="Items">{list.length}</DetailRow>
        <DetailRow label="Share of all stock">{Math.round(share)}%</DetailRow>
        {g.manager && <DetailRow label="Manager">{g.manager}</DetailRow>}
        {g.capacity != null && g.capacity !== "" && <DetailRow label="Capacity">{qtyText(g.capacity)}</DetailRow>}
        {g.notes && <DetailRow label="Notes">{g.notes}</DetailRow>}
      </Group>

      {categories.length > 1 && (
        <>
          <GroupLabel>What it is worth</GroupLabel>
          <ValueBars rows={categories} currency={currency} />
        </>
      )}

      <GroupLabel right={list.length > ITEM_PREVIEW && !q ? <span>{list.length} items</span> : undefined}>{all || q ? "Items here" : "Biggest by value"}</GroupLabel>
      {list.length > 8 && <SearchField className="mb-2 !h-11" value={search} onChange={setSearch} placeholder="Search this godown" />}
      <Group>
        {list.length === 0 ? <p className="px-4 py-6 text-center text-[15px] text-mute">Nothing is stored here yet.</p>
          : visible.length === 0 ? <p className="px-4 py-6 text-center text-[15px] text-mute">No items match.</p>
          : visible.map((it: any) => (
            <div key={it.id} className="flex min-h-[56px] items-center justify-between gap-3 border-t border-line px-4 py-2 first:border-t-0">
              <div className="min-w-0">
                <p className="truncate text-[16px] text-ink">{it.name}</p>
                <p className="truncate text-caption tabular-nums text-mute">{it.qtyText}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {it.low && <StatusChip tone="caution" small>Low</StatusChip>}
                {!it.low && it.dead && <StatusChip tone="neutral" small dot={false}>No sale 90d</StatusChip>}
                <span className="text-[16px] tabular-nums text-ink">{inrCompact(it.value, currency)}</span>
              </div>
            </div>
          ))}
      </Group>
      {!all && !q && list.length > ITEM_PREVIEW && (
        <button type="button" onClick={() => setAll(true)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {list.length} items</button>
      )}

      <GroupLabel>Manage</GroupLabel>
      <Group>
        {canTransfer && <ActionRow icon={<ArrowLeftRight size={20} />} label="Move stock out of here" onClick={onTransfer} />}
        {!g.isDefault && <ActionRow icon={<Star size={20} />} label="Make default godown" hint="New stock arrives here" onClick={onDefault} />}
        <ActionRow icon={<Pencil size={20} />} label="Edit godown" onClick={onEdit} />
        <ActionRow icon={<Trash2 size={20} />} label="Archive godown" danger onClick={onArchive} />
      </Group>
      <div className="h-3" />
    </Sheet>
  );
}
