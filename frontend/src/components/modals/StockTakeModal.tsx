import { useMemo, useState } from "react";
import { FormSheet, SelectInput, TextArea } from "../ui/blocks";
import { CloseIcon } from "../ui/icons";
import { Field, Group, IconButton, PrimaryButton, Sheet, StatusChip, TextButton, TextInput, cx } from "../ui/kit";
import { qtyText } from "../../lib/money";
import { matchStockTakeLines, parseStockTakeText, StockTakeMatch } from "../../lib/stockTakeParser";

type Step = "paste" | "review" | "done";

interface RowState {
  match: StockTakeMatch;
  itemId: string | null; // editable — starts as match.item?.id, "" means "skip this line"
  newStock: string; // editable text, starts as match.qty
  // Weight-mode items only: the paste format gives one number per line (read
  // into newStock as the piece count), so the kg recount has no source to
  // parse from — it's always entered manually here, never guessed.
  newStockKg: string;
}

const deltaText = (d: number | null, unit = "") => (d === null || d === 0 ? "" : ` (${d > 0 ? "+" : "−"}${qtyText(Math.abs(d))}${unit})`);
const deltaTone = (d: number | null) => (d === null || d === 0 ? "text-mute" : d > 0 ? "text-good-600" : "text-bad-600");

export function StockTakeModal({ items, godowns, onClose, applyStockAdjustments }: any) {
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  // A stock take is done at one physical location at a time — every line in
  // this batch gets counted against, and corrects, this godown only. Stock
  // sitting at any other godown is left exactly as it is. Defaults to the
  // default godown when the owner has more than one.
  const hasMultipleGodowns = Array.isArray(godowns) && godowns.length > 1;
  const [godownId, setGodownId] = useState<string>(() => (godowns || []).find((g: any) => g.isDefault)?.id || (godowns || [])[0]?.id || "");

  // Current stock AT the selected godown (falling back to the item's single
  // total when the owner has 0-1 godowns) — this is the baseline a physical
  // count should be compared against, not the item's company-wide total.
  const stockAtGodown = (it: any) => {
    if (!it) return { stock: 0, stockKg: 0 };
    if (!hasMultipleGodowns) return { stock: it.stock ?? 0, stockKg: it.stockKg ?? 0 };
    const entry = (it.stockByGodown || []).find((g: any) => String(g.godownId) === String(godownId));
    return { stock: entry?.stock ?? 0, stockKg: entry?.stockKg ?? 0 };
  };

  const parse = () => {
    const lines = parseStockTakeText(text);
    const matched = matchStockTakeLines(lines, items);
    setRows(
      matched
        .filter((m) => m.qty !== null) // a line with no readable number can't be applied — drop it silently, it's usually a header/blank
        .map((m) => ({ match: m, itemId: m.item?.id || null, newStock: String(m.qty), newStockKg: "" }))
    );
    setStep("review");
  };

  const setRowItemId = (idx: number, itemId: string) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, itemId: itemId || null } : r)));
  const setRowStock = (idx: number, v: string) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, newStock: v } : r)));
  const setRowStockKg = (idx: number, v: string) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, newStockKg: v } : r)));
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const itemById = useMemo(() => new Map<string, any>(items.map((it: any) => [it.id, it])), [items]);

  const isRowWeight = (r: RowState) => (r.itemId ? itemById.get(r.itemId)?.trackingMode === "weight" : false);
  const rowReady = (r: RowState) =>
    !!r.itemId && r.newStock.trim() !== "" && !Number.isNaN(Number(r.newStock)) &&
    (!isRowWeight(r) || (r.newStockKg.trim() !== "" && !Number.isNaN(Number(r.newStockKg))));

  const unmatchedCount = rows.filter((r) => !r.itemId).length;
  const readyCount = rows.filter(rowReady).length;
  const godownName = godowns?.find((g: any) => g.id === godownId)?.name;

  const submit = async () => {
    const lines = rows
      .filter(rowReady)
      .map((r) => ({
        itemId: r.itemId as string,
        newStock: Number(r.newStock),
        newStockKg: isRowWeight(r) ? Number(r.newStockKg) : undefined,
      }));
    if (!lines.length) return;
    setSubmitting(true);
    try {
      const res = await applyStockAdjustments(lines, "Stock take", hasMultipleGodowns ? godownId : undefined);
      setResult(res);
      setStep("done");
    } finally { setSubmitting(false); }
  };

  /* ---- 1. paste the counted list ---- */
  if (step === "paste") {
    return (
      <FormSheet tall title="Stock take" onClose={onClose} dirty={text.trim() !== ""} canSave={text.trim() !== ""} saveLabel="Read the list" onSave={parse}>
        <div className="space-y-4 pt-1">
          {hasMultipleGodowns && (
            <Field label="Counting at" hint="Every line is counted against this godown only. Stock at your other godowns is left as it is.">
              <SelectInput value={godownId} onChange={(e) => setGodownId(e.target.value)}>
                {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </SelectInput>
            </Field>
          )}
          <Field label="Your counted list" hint={'One item per line, like "3. Duraguard PPC - 245". Each line is matched to an item, and you check them before anything is saved.'}>
            <TextArea autoFocus rows={10} className="font-mono !text-[15px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={"1. Wonder plus - 223\n2. Wonder PPC - 795\n..."} />
          </Field>
        </div>
      </FormSheet>
    );
  }

  /* ---- 3. what happened ---- */
  if (step === "done") {
    const failed = (result?.results || []).filter((r: any) => !r.ok);
    return (
      <Sheet onClose={onClose} title="Stock take done" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="min-h-[190px]">
          <div className="flex items-center gap-2 pt-1">
            <StatusChip tone={result?.failed ? "caution" : "paid"}>{result?.succeeded ?? 0} of {result?.total ?? 0} lines applied{result?.failed ? `, ${result.failed} failed` : ""}</StatusChip>
          </div>
          <p className="mt-3 text-[15px] leading-[21px] text-mute">
            {result?.failed ? "The lines that went through are saved. Fix the ones below and count them again." : "Your stock and its value are updated. Each correction is listed under Past corrections."}
          </p>
        {failed.length > 0 && (
          <Group className="mt-4">
            {failed.map((r: any, i: number) => (
              <div key={i} className="border-t border-line px-4 py-3 first:border-t-0">
                <p className="text-[16px] text-ink">{itemById.get(r.itemId)?.name || r.itemId}</p>
                <p className="text-caption text-bad-600">{r.message}</p>
              </div>
            ))}
          </Group>
        )}
        </div>
        <div className="h-3" />
      </Sheet>
    );
  }

  /* ---- 2. check each line ---- */
  return (
    <FormSheet tall title="Check the counts" onClose={onClose} dirty canSave={readyCount > 0} saving={submitting}
      saveLabel={`Apply ${readyCount} count${readyCount === 1 ? "" : "s"}`} savingLabel="Applying…" onSave={submit}>
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="min-w-0 text-[15px] leading-[21px] text-mute">
          {rows.length} line{rows.length === 1 ? "" : "s"} read, {readyCount} ready{unmatchedCount ? `, ${unmatchedCount} need a match` : ""}
          {hasMultipleGodowns && godownName ? `. Counting at ${godownName}.` : "."}
        </p>
        <TextButton className="-mr-1 shrink-0 px-1" onClick={() => setStep("paste")}>Edit list</TextButton>
      </div>

      <div className="mt-3 space-y-2.5">
        {rows.map((r, idx) => {
          const currentItem = r.itemId ? itemById.get(r.itemId) : null;
          const isWeight = currentItem?.trackingMode === "weight";
          const atGodown = stockAtGodown(currentItem);
          const delta = currentItem && r.newStock.trim() !== "" ? Number(r.newStock) - (atGodown.stock ?? 0) : null;
          const deltaKg = isWeight && r.newStockKg.trim() !== "" ? Number(r.newStockKg) - (atGodown.stockKg ?? 0) : null;
          return (
            <div key={idx} className={cx("rounded-group border p-3", r.itemId ? "border-line" : "border-warn-300 bg-warn-50")}>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-caption text-mute">You wrote: {r.match.rawName}</p>
                {!r.itemId && <StatusChip tone="caution" small>Needs a match</StatusChip>}
                <IconButton label={`Remove the line ${r.match.rawName}`} layout="inline" tone="faint" onClick={() => removeRow(idx)}><CloseIcon size={14} /></IconButton>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <SelectInput aria-label={`Item for ${r.match.rawName}`} value={r.itemId || ""} onChange={(e) => setRowItemId(idx, e.target.value)} className="!text-[15px]">
                    <option value="">Pick the item</option>
                    {r.match.candidates.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {!r.match.candidates.some((c: any) => c.id === r.itemId) && currentItem && <option value={currentItem.id}>{currentItem.name}</option>}
                  </SelectInput>
                </div>
                <TextInput aria-label={isWeight ? "Pieces counted" : "Counted"} type="number" inputMode="decimal" value={r.newStock} onChange={(e) => setRowStock(idx, e.target.value)}
                  placeholder={isWeight ? "pieces" : undefined} className="!w-24 shrink-0 text-right" />
              </div>
              {isWeight && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-caption text-mute">Weight in kg. Weigh it again.</span>
                  <TextInput aria-label="Weight in kg" type="number" inputMode="decimal" value={r.newStockKg} onChange={(e) => setRowStockKg(idx, e.target.value)} placeholder="kg" className="!w-24 shrink-0 text-right" />
                </div>
              )}
              {currentItem && (
                <p className={cx("mt-2 text-caption tabular-nums", deltaTone(delta))}>
                  {qtyText(atGodown.stock ?? 0)} → {r.newStock || "?"} {isWeight ? "pc" : currentItem.unit || ""}{deltaText(delta)}
                </p>
              )}
              {isWeight && deltaKg !== null && (
                <p className={cx("text-caption tabular-nums", deltaTone(deltaKg))}>{qtyText(atGodown.stockKg ?? 0)} kg → {r.newStockKg} kg{deltaText(deltaKg, " kg")}</p>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <Group><p className="px-4 py-8 text-center text-[15px] text-mute">No line with a readable quantity was found. Go back and check the list.</p></Group>
        )}
      </div>
      <div className="h-3" />
    </FormSheet>
  );
}
