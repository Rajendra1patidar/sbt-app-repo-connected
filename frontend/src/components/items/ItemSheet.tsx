import { useEffect, useMemo, useState } from "react";
import { ActionRow, DetailRow, FormSheet, SelectInput } from "../ui/blocks";
import { EditIcon, TrashIcon, WhatsAppIcon } from "../ui/icons";
import { Field, Group, GroupLabel, InsightNote, PrimaryButton, Sheet, StatusChip, TextInput, cx, type ChipTone } from "../ui/kit";
import { api } from "../../lib/api";
import { waLink } from "../../lib/contactLinks";
import { localToday } from "../../lib/estimates";
import { inr, inrRate, qtyText, shortDate } from "../../lib/money";
import { alertLevel, isWeightItem, onHand, stockState, stockText, stockValue, unitName, type StockState } from "../../lib/stockStatus";

/* ---- One item ----
 * Everything about an item in one sheet: what is on hand (and where), what it is worth, what it sells
 * and costs for, the last seven days, when it last sold and was last bought, and the reorder advice.
 * Items and Inventory both open this. Correcting stock, editing and deleting are the actions at the
 * bottom, so a stray tap on a list row can't change anything. */

const STATE_CHIP: Record<StockState, { tone: ChipTone; label: string }> = {
  out: { tone: "risk", label: "Out of stock" },
  low: { tone: "caution", label: "Low" },
  watch: { tone: "neutral", label: "Getting low" },
  ok: { tone: "paid", label: "In stock" },
};

const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

function last7Days(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(localToday(d));
  }
  return out;
}

export function ItemSheet({ item, items, godowns, currency, purchases, estimates, reorderSuggestions, deadStock, openModal, applyStockAdjustments, removeItem, onClose }: any) {
  const [insight, setInsight] = useState<any>(undefined); // undefined = loading, null = unavailable
  const [correcting, setCorrecting] = useState(false);
  const days = useMemo(() => last7Days(), []);

  // `item` is the row that was tapped. Resolve it against the live list so a correction made from this
  // sheet shows straight away instead of the stock as it was when the sheet opened.
  const live = useMemo(() => (items || []).find((it: any) => it.id === item.id) || item, [item, items]);

  useEffect(() => {
    let cancelled = false;
    setInsight(undefined);
    api.items.insights(item.id).then((d: any) => { if (!cancelled) setInsight(d); }).catch(() => { if (!cancelled) setInsight(null); });
    return () => { cancelled = true; };
  }, [item.id]);

  const movement = useMemo(() => days.map((day) => {
    const inQty = (purchases || [])
      .filter((p: any) => p.itemId === live.id && String(p.date).slice(0, 10) === day)
      .reduce((s: number, p: any) => s + Number(p.qty || 0), 0);
    const outQty = (estimates || [])
      .filter((e: any) => !e.deleted && String(e.date).slice(0, 10) === day)
      .reduce((s: number, e: any) => s + (e.lines || []).filter((ln: any) => ln.itemId === live.id).reduce((ls: number, ln: any) => ls + Number(ln.qty || 0), 0), 0);
    return { day, inQty, outQty, net: inQty - outQty };
  }), [live.id, days, purchases, estimates]);

  const state = stockState(live);
  const chip = STATE_CHIP[state];
  const weight = isWeightItem(live);
  const sell = Number(live.sellingPrice ?? live.price ?? 0);
  const cost = Number(live.purchasePrice) || 0;
  const level = alertLevel(live);
  const multi = Array.isArray(godowns) && godowns.length > 1;
  const here = (live.stockByGodown || []).filter((g: any) => (g.stock ?? 0) > 0 || (g.stockKg ?? 0) > 0);
  const reorder = (reorderSuggestions || []).find((s: any) => s.mode === "pace" && String(s.itemId) === String(live.id));
  const dead = (deadStock || []).find((d: any) => String(d.itemId) === String(live.id));
  const suggestedQty = reorder?.suggestedQty > 0 ? reorder.suggestedQty : Math.max(1, level * 2 - onHand(live));

  const totalIn = movement.reduce((s, m) => s + m.inQty, 0);
  const totalOut = movement.reduce((s, m) => s + m.outQty, 0);
  const maxAbs = Math.max(1, ...movement.map((m) => Math.abs(m.net)));

  const marginText = insight?.margin
    ? `${inr(insight.margin.perUnit, currency)}${insight.margin.percent != null ? ` (${qtyText(insight.margin.percent)}%)` : ""}`
    : cost > 0 && sell > 0 ? `${inr(sell - cost, currency)} (${qtyText(Math.round(((sell - cost) / cost) * 1000) / 10)}%)` : null;

  const lastSaleDate = insight?.lastSale?.date ?? dead?.lastSaleDate ?? null;

  const act = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <>
      <Sheet onClose={onClose} label={`Item ${live.name}`}
        footer={<PrimaryButton onClick={act(() => openModal("order", { itemId: live.id, qty: suggestedQty }))}>Create purchase order</PrimaryButton>}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-section text-ink">{live.name}</h2>
            <p className="mt-0.5 text-[15px] text-mute">{live.category || "Others"}{live.brand ? `, ${live.brand}` : ""}</p>
          </div>
          <StatusChip tone={chip.tone} className="mt-1">{chip.label}</StatusChip>
        </div>

        <Group className="mt-4">
          <DetailRow label="On hand" tone={state === "out" ? "bad" : state === "low" ? "warn" : undefined}>
            {weight ? `${stockText(live)} · ${qtyText(live.stock || 0)} pc` : stockText(live)}
          </DetailRow>
          <DetailRow label="Stock value">{inr(stockValue(live), currency)}</DetailRow>
          <DetailRow label="Selling price">{inrRate(sell, currency)} a {unitName(live)}</DetailRow>
          {cost > 0 && <DetailRow label="Average cost">{inrRate(cost, currency)} a {unitName(live)}</DetailRow>}
          {marginText && <DetailRow label="Margin" tone="good">{marginText}</DetailRow>}
          <DetailRow label="Alert at">{qtyText(level)} {weight ? "pc" : unitName(live)} or less</DetailRow>
        </Group>

        {multi && here.length > 0 && (
          <>
            <GroupLabel>By godown</GroupLabel>
            <Group>
              {here.map((g: any) => {
                const gd = godowns.find((x: any) => String(x.id) === String(g.godownId));
                return <DetailRow key={String(g.godownId)} label={gd?.name || "Unknown godown"}>{stockText(live, g.stock || 0, g.stockKg || 0)}</DetailRow>;
              })}
            </Group>
          </>
        )}

        {(reorder || dead) && (
          <div className="mt-4 space-y-2">
            {reorder && (
              <InsightNote>
                At {qtyText(reorder.dailyRate)} a day{reorder.daysLeft != null ? `, about ${qtyText(reorder.daysLeft)} days of cover are left` : ""}. Stock won't last the vendor's usual {reorder.leadTimeDays}-day lead time, so ordering now keeps you covered.
              </InsightNote>
            )}
            {dead && (
              <InsightNote>No sale for 90 days or more{dead.value ? `, with ${inr(dead.value, currency)} tied up in it` : ""}.</InsightNote>
            )}
          </div>
        )}
        {reorder?.vendor && (
          <Group className="mt-3">
            <ActionRow icon={<WhatsAppIcon size={20} />} label={`Order ${qtyText(reorder.suggestedQty)} from ${reorder.vendor.name}`}
              href={waLink(reorder.vendor.phone, `Hi ${reorder.vendor.name}, I'd like to order ${qtyText(reorder.suggestedQty)} ${unitName(live)} of ${live.name}.`)} />
          </Group>
        )}

        <GroupLabel>History</GroupLabel>
        <Group>
          <HistoryRow label="Last sold"
            main={insight === undefined && !lastSaleDate ? "Loading…" : lastSaleDate ? shortDate(lastSaleDate) : "No sales yet"}
            sub={lastSaleDate && insight?.lastSale?.rate != null ? `At ${inrRate(insight.lastSale.rate, currency)}` : undefined} />
          <HistoryRow label="Last bought"
            main={insight === undefined ? "Loading…" : insight?.lastPurchase ? shortDate(insight.lastPurchase.date) : "No purchases yet"}
            sub={insight?.lastPurchase ? `${stockText(live, insight.lastPurchase.qty, insight.lastPurchase.qtyKg)} at ${inrRate(insight.lastPurchase.rate, currency)}${insight.lastPurchase.vendor ? `, ${insight.lastPurchase.vendor.name}` : ""}` : undefined} />
        </Group>

        <GroupLabel right={totalIn + totalOut > 0 ? <span className="tabular-nums">In {qtyText(totalIn)}, out {qtyText(totalOut)}</span> : undefined}>Last 7 days</GroupLabel>
        {totalIn + totalOut === 0 ? (
          <Group><p className="px-4 py-5 text-center text-[15px] text-mute">No stock moved in the last 7 days.</p></Group>
        ) : (
          <Group className="px-4 pb-2 pt-4">
            <div className="flex h-[72px] items-end gap-1.5" role="img" aria-label={`Stock in ${qtyText(totalIn)} and out ${qtyText(totalOut)} over the last 7 days`}>
              {movement.map((m) => (
                <div key={m.day} className="flex flex-1 flex-col justify-end">
                  <div className={cx("w-full rounded-t-[3px]", m.net > 0 ? "bg-good-500" : m.net < 0 ? "bg-bad-400" : "bg-line")} style={{ height: Math.max(4, (Math.abs(m.net) / maxAbs) * 72) }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
              {movement.map((m) => <span key={m.day} className="flex-1 text-center text-micro text-mute">{DAY_LETTER[new Date(`${m.day}T00:00:00`).getDay()]}</span>)}
            </div>
          </Group>
        )}

        <GroupLabel>Manage</GroupLabel>
        <Group>
          {applyStockAdjustments && <ActionRow icon={<EditIcon size={20} />} label="Correct stock" hint="After a count" onClick={() => setCorrecting(true)} />}
          <ActionRow icon={<EditIcon size={20} />} label="Edit item" onClick={act(() => openModal("item", { editingItem: live }))} />
          <ActionRow icon={<TrashIcon size={20} />} label="Delete item" danger onClick={act(() => removeItem(live.id))} />
        </Group>
        <div className="h-3" />
      </Sheet>

      {correcting && (
        <StockCorrectionSheet item={live} godowns={godowns} applyStockAdjustments={applyStockAdjustments} onClose={() => setCorrecting(false)} />
      )}
    </>
  );
}

/** A label on the left, a main value with an optional second line on the right: wraps, never cuts the sentence off. */
function HistoryRow({ label, main, sub }: { label: string; main: string; sub?: string }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-4 border-t border-line px-4 py-2 first:border-t-0">
      <span className="shrink-0 text-[16px] text-mute">{label}</span>
      <span className="min-w-0 text-right">
        <span className="block text-[16px] text-ink">{main}</span>
        {sub && <span className="block text-caption text-mute">{sub}</span>}
      </span>
    </div>
  );
}

/* ---- Correct one item's stock after a count ---- */

function StockCorrectionSheet({ item, godowns, applyStockAdjustments, onClose }: any) {
  const multi = Array.isArray(godowns) && godowns.length > 1;
  const weight = isWeightItem(item);
  const defaultGodown = (godowns || []).find((g: any) => g.isDefault)?.id || (godowns || [])[0]?.id || "";

  // A count is made at one place, so the starting numbers are what that godown holds, not the item's total.
  const at = (gid: string) => {
    if (!multi) return { stock: Number(item.stock) || 0, stockKg: Number(item.stockKg) || 0 };
    const e = (item.stockByGodown || []).find((g: any) => String(g.godownId) === String(gid));
    return { stock: e?.stock ?? 0, stockKg: e?.stockKg ?? 0 };
  };
  const [godownId, setGodownId] = useState<string>(defaultGodown);
  const start = at(godownId);
  const [pieces, setPieces] = useState(String(start.stock));
  const [kg, setKg] = useState(String(start.stockKg));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const changeGodown = (gid: string) => { setGodownId(gid); const n = at(gid); setPieces(String(n.stock)); setKg(String(n.stockKg)); };
  const valid = pieces.trim() !== "" && !Number.isNaN(Number(pieces)) && Number(pieces) >= 0 && (!weight || (kg.trim() !== "" && !Number.isNaN(Number(kg)) && Number(kg) >= 0));
  const changed = pieces !== String(start.stock) || (weight && kg !== String(start.stockKg));
  const dirty = touched || reason.trim() !== "";

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await applyStockAdjustments(
        [{ itemId: item.id, newStock: Number(pieces), newStockKg: weight ? Number(kg) : undefined, reason: reason.trim() || undefined }],
        reason.trim() || "Manual adjustment",
        multi ? godownId : undefined,
      );
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <FormSheet z={70} title="Correct stock" onClose={onClose} dirty={dirty} canSave={valid && changed} saving={saving} saveLabel="Save correction" onSave={save}>
      <p className="-mt-1 mb-4 text-[15px] leading-[21px] text-mute">{item.name}. Type what you counted, not what changed.</p>
      <div className="space-y-4">
        {multi && (
          <Field label="Counted at">
            <SelectInput value={godownId} onChange={(e) => { setTouched(true); changeGodown(e.target.value); }}>
              {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          </Field>
        )}
        <Field label={weight ? "Pieces counted" : `Counted (${item.unit || "unit"})`}>
          <TextInput autoFocus type="number" inputMode="decimal" min="0" value={pieces} onChange={(e) => { setTouched(true); setPieces(e.target.value); }} />
        </Field>
        {weight && (
          <Field label="Weight in kg" hint="Weigh it again. Don't estimate.">
            <TextInput type="number" inputMode="decimal" min="0" value={kg} onChange={(e) => { setTouched(true); setKg(e.target.value); }} />
          </Field>
        )}
        <Field label="Reason" hint="Optional. For example: physical count, damage.">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Physical count" autoComplete="off" />
        </Field>
      </div>
    </FormSheet>
  );
}
