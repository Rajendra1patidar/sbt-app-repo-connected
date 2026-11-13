import { useEffect, useMemo, useRef, useState } from "react";
import { searchItemsRanked } from "../../lib/itemSearch";
import { inr, inrRate, qtyText } from "../../lib/money";
import { MinusIcon, PlusIcon } from "../ui/icons";
import { PrimaryButton, SearchField, Sheet, StatusChip, TextButton, GroupLabel, Group, cx } from "../ui/kit";
import { QuickAddItemPopup } from "../modals/QuickAddItemPopup";

/**
 * Add item: search, tap a result, set quantity / rate / discount, add.
 * Weight items (Saria) also take the pieces removed, and show the weight expected.
 * Opens on the Canvas colour so the white group of matches stands out.
 */

export interface PickedLine { itemId: string; qty: number; rate: number; discountAmount: number; piecesQty?: number; godownId?: string }

const num = (v: any) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function AddItemSheet({
  items, godowns, lines, usualItems, popularItems = [], popularity, customerName, editIndex, stockAt, onClose, onAdd, onRemove, onQuickAddItem,
}: {
  items: any[]; godowns: any[]; lines: any[]; usualItems: any[]; customerName?: string;
  /** Best sellers overall, shown when this customer has no history. */
  popularItems?: any[];
  /** 0..1 — how often each item is sold across all estimates; breaks ties between equal matches. */
  popularity?: Map<string, number>;
  /** When set, the sheet edits this existing line instead of adding a new one. */
  editIndex?: number | null;
  stockAt: (item: any, godownId?: string) => { stock: number; stockKg: number };
  onClose: () => void;
  onAdd: (line: PickedLine, replaceIndex: number | null) => void;
  onRemove?: (index: number) => void;
  onQuickAddItem?: (v: any) => Promise<any>;
}) {
  const editing = editIndex != null && editIndex >= 0 ? lines[editIndex] : null;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(editing?.itemId || null);
  const [qty, setQty] = useState(editing ? String(editing.qty ?? "") : "1");
  const [rate, setRate] = useState(editing ? String(editing.rate ?? "") : "");
  const [pieces, setPieces] = useState(editing?.piecesQty ? String(editing.piecesQty) : "");
  const [discount, setDiscount] = useState(editing?.discountAmount ? String(editing.discountAmount) : "");
  const [godownId, setGodownId] = useState<string>(editing?.godownId || "");
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const usualIds = useMemo(() => new Set(usualItems.map((u) => u.id)), [usualItems]);
  const boostOf = (it: any) => (usualIds.has(it.id) ? 1 : 0.6 * (popularity?.get(it.id) ?? 0));
  const startItems = usualItems.length > 0 ? usualItems : popularItems;
  useEffect(() => { if (!editing) searchRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!justAdded) return; const t = setTimeout(() => setJustAdded(null), 1800); return () => clearTimeout(t); }, [justAdded]);

  // The top match opens by itself as you type (like the design), until you tap a different one.
  const autoId = !selectedId && !editing && query.trim() ? (searchItemsRanked(items, query.trim(), { limit: 1, boost: boostOf }).items[0]?.id ?? null) : null;
  const currentId = selectedId || autoId;
  const selected = currentId ? items.find((i) => i.id === currentId) : null;
  const isWeight = selected?.trackingMode === "weight";
  const multiGodown = (godowns || []).length > 1;
  const defaultGodown = (godowns || []).find((g: any) => g.isDefault)?.id || godowns?.[0]?.id || "";
  const effectiveGodown = godownId || defaultGodown;

  const prevAuto = useRef<string | null>(null);
  useEffect(() => {
    if (autoId && autoId !== prevAuto.current) {
      const it = items.find((i) => i.id === autoId);
      if (it) { setQty("1"); setRate(String(it.sellingPrice ?? 0)); setPieces(""); setDiscount(""); setGodownId(""); setError(null); }
    }
    prevAuto.current = autoId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoId]);

  const pick = (it: any) => {
    setSelectedId(it.id);
    setQty("1");
    setRate(String(it.sellingPrice ?? 0));
    setPieces("");
    setDiscount("");
    setGodownId("");
    setError(null);
  };

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return startItems;
    return searchItemsRanked(items, q, { limit: 30, boost: boostOf }).items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items, startItems, usualIds, popularity]);

  const others = results.filter((it: any) => it.id !== currentId);
  const onEstimateQty = (id: string) => lines.filter((l, i) => l.itemId === id && i !== editIndex).reduce((s, l) => s + num(l.qty), 0);

  /* ---- numbers for the selected item ---- */
  const q = num(qty), rt = num(rate);
  const gross = r2(q * rt);
  const disc = Math.min(num(discount), gross);
  const net = r2(gross - disc);
  const st = selected ? stockAt(selected, effectiveGodown) : { stock: 0, stockKg: 0 };
  const haveQty = isWeight ? st.stockKg : st.stock;
  const unitWord = isWeight ? "kg" : (selected?.unit || "");
  const short = selected && q > haveQty + 0.005;
  const piecesShort = selected && isWeight && num(pieces) > st.stock + 0.005;
  const avg = num(selected?.avgWeightPerPiece);
  const godownName = (id: string) => godowns?.find((g: any) => String(g.id) === String(id))?.name;

  const submit = () => {
    if (!selected) return;
    if (!(q > 0)) { setError("Enter a quantity."); return; }
    if (isWeight && !(num(pieces) > 0)) { setError("Enter the pieces removed."); return; }
    const line: PickedLine = {
      itemId: selected.id, qty: q, rate: rt, discountAmount: disc,
      ...(isWeight ? { piecesQty: num(pieces) } : {}),
      ...(multiGodown && godownId ? { godownId } : {}),
    };
    onAdd(line, editing ? (editIndex as number) : null);
    if (editing) { onClose(); return; }
    setJustAdded(selected.name);
    setSelectedId(null); setQuery(""); setError(null);
    searchRef.current?.focus();
  };

  const rowSubtitle = (it: any) => {
    const s = stockAt(it);
    const w = it.trackingMode === "weight";
    const have = w ? `${qtyText(s.stockKg)} kg` : `${qtyText(s.stock)}${it.unit ? ` ${it.unit}` : ""}`;
    const unit = w ? "kg" : (it.unit || "unit");
    return { rate: `${inrRate(it.sellingPrice || 0)} a ${unit}`, stock: `${have} in stock` };
  };

  const stockChip = () => {
    if (!selected) return null;
    if (haveQty <= 0) return <StatusChip tone="risk" dot={false}>Out of stock</StatusChip>;
    if (short) return <StatusChip tone="caution" dot={false}>Only {qtyText(haveQty)} in stock</StatusChip>;
    return <StatusChip tone="paid" dot={false}>In stock</StatusChip>;
  };

  const ctaLabel = selected ? `${editing ? "Update" : "Add"} ${selected.name}, ${inr(net)}` : "Choose an item";

  return (
    <>
      <Sheet canvas z={60} onClose={onClose} tall title={editing ? "Edit item" : "Add item"}
        trailing={<TextButton onClick={onClose} className="-mr-1 px-1 font-medium">Done</TextButton>}
        footer={
          <div>
            {error && <p className="mb-2 text-center text-[14px] font-medium text-bad-500">{error}</p>}
            <PrimaryButton disabled={!selected} onClick={submit}>{ctaLabel}</PrimaryButton>
            {editing && onRemove && (
              <div className="mt-1 flex justify-center"><TextButton tone="risk" onClick={() => { onRemove(editIndex as number); onClose(); }}>Remove from estimate</TextButton></div>
            )}
          </div>
        }>
        {!editing && <SearchField inputRef={searchRef} value={query} onChange={setQuery} placeholder="Search items" ariaLabel="Search items" className="!h-11 mt-1.5" />}

        {justAdded && (
          <p className="mt-3 animate-chip-in rounded-control bg-good-50 px-3 py-2 text-[14px] font-medium text-good-600">Added {justAdded}. Search for the next item, or tap Done.</p>
        )}

        {!editing && (
          <GroupLabel className="mt-3.5">
            {query.trim() ? `${results.length} match${results.length === 1 ? "" : "es"}` : usualItems.length > 0 ? `Often sold to ${customerName || "this customer"}` : popularItems.length > 0 ? "Best sellers" : `${items.length} items. Type to search.`}
          </GroupLabel>
        )}

        {(selected || others.length > 0) && (
          <Group className={editing ? "mt-1" : ""}>
            {selected && (
              <div className="px-4 pb-3 pt-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-ink">{selected.name}</p>
                    <p className="truncate text-caption text-mute">
                      {[selected.brand, `${qtyText(haveQty)} ${unitWord}`.trim() + (multiGodown ? ` in ${godownName(effectiveGodown) || "godown"}` : " in stock")].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  {stockChip()}
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-micro text-mute">Quantity{unitWord ? ` in ${unitWord}` : ""}</div>
                    <div className="flex h-11 items-center justify-between rounded-control bg-paper">
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(String(Math.max(0, r2(q - 1))))} className="flex h-11 w-11 items-center justify-center text-ink active:opacity-50">
                        <MinusIcon size={16} />
                      </button>
                      <input value={qty} inputMode="decimal" aria-label="Quantity" onFocus={(e) => e.target.select()}
                        onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="w-full min-w-0 bg-transparent text-center text-[16px] font-semibold tabular-nums text-ink outline-none" />
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(String(r2(q + 1)))} className="flex h-11 w-11 items-center justify-center text-ink active:opacity-50">
                        <PlusIcon size={16} />
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <div className="mb-1 text-micro text-mute">Rate per {isWeight ? "kg" : (selected.unit || "unit")}</div>
                    <input value={rate} inputMode="decimal" aria-label="Rate" onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="h-11 w-full rounded-control bg-paper px-3 text-[16px] tabular-nums text-ink outline-none focus:ring-2 focus:ring-brand-500/40" />
                  </label>
                  {isWeight && (
                    <label className="block">
                      <div className="mb-1 text-micro text-mute">Pieces removed</div>
                      <input value={pieces} inputMode="numeric" aria-label="Pieces removed" placeholder="0" onChange={(e) => setPieces(e.target.value.replace(/[^0-9]/g, ""))}
                        className={cx("h-11 w-full rounded-control bg-paper px-3 text-[16px] tabular-nums text-ink outline-none focus:ring-2 focus:ring-brand-500/40", error?.includes("pieces") && "ring-2 ring-bad-500/50")} />
                    </label>
                  )}
                  <label className="block">
                    <div className="mb-1 text-micro text-mute">Discount</div>
                    <input value={discount} inputMode="decimal" aria-label="Discount" placeholder="0" onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="h-11 w-full rounded-control bg-paper px-3 text-[16px] tabular-nums text-ink outline-none focus:ring-2 focus:ring-brand-500/40" />
                  </label>
                  {multiGodown && (
                    <label className="col-span-2 block">
                      <div className="mb-1 text-micro text-mute">Dispatch from</div>
                      <select value={effectiveGodown} onChange={(e) => setGodownId(e.target.value)} className="h-11 w-full rounded-control bg-paper px-3 text-[16px] text-ink outline-none">
                        {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}{g.isDefault ? " (default)" : ""}</option>)}
                      </select>
                    </label>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <span className="text-caption text-mute">
                    {isWeight
                      ? (num(pieces) > 0 ? `${qtyText(num(pieces))} piece${num(pieces) === 1 ? "" : "s"}${avg > 0 ? `, about ${qtyText(Math.round(avg * num(pieces) * 10) / 10)} kg expected` : ""}` : "Count the pieces you took out")
                      : onEstimateQty(selected.id) > 0 ? `${qtyText(onEstimateQty(selected.id))} already on this estimate` : disc > 0 ? `${inr(gross)} less ${inr(disc)} discount` : " "}
                  </span>
                  <span className="text-[20px] font-semibold tabular-nums text-ink">{inr(net)}</span>
                </div>
                {(short || piecesShort) && <p className="mt-1 text-caption text-warn-700">{piecesShort ? `Only ${qtyText(st.stock)} pieces in stock.` : `Only ${qtyText(haveQty)} ${unitWord} in stock. You can keep going, but saving will stop you.`}</p>}
              </div>
            )}

            {others.map((it: any) => {
              const sub = rowSubtitle(it);
              return (
                <button key={it.id} type="button" onClick={() => pick(it)} aria-label={`Add ${it.name}`}
                  className="flex h-[60px] w-full items-center justify-between gap-3 border-t border-line px-4 text-left first:border-t-0 active:bg-paper">
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-medium text-ink">{it.name}</span>
                    <span className="block truncate text-caption text-mute"><span className="tabular-nums">{sub.rate}</span>, {sub.stock}</span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-500 text-brand-500"><PlusIcon size={18} /></span>
                </button>
              );
            })}
          </Group>
        )}

        {query.trim() && results.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[15px] text-mute">No item matches “{query.trim()}”.</p>
            {onQuickAddItem && <TextButton className="mt-1" onClick={() => setQuickAdd(true)}>Add it as a new item</TextButton>}
          </div>
        )}
        <div className="h-3" />
      </Sheet>

      {quickAdd && onQuickAddItem && (
        <QuickAddItemPopup saving={adding} onCancel={() => setQuickAdd(false)}
          onSave={async (v: any) => {
            setAdding(true);
            try {
              const it = await onQuickAddItem(v);
              if (it) { setQuickAdd(false); pick(it); }
            } finally { setAdding(false); }
          }} />
      )}
    </>
  );
}
