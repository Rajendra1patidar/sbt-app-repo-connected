import React, { useMemo, useState } from "react";
import { CheckCircle2, ClipboardPaste, Loader2, X } from "lucide-react";
import { fmtNum } from "../../lib/format";
import { matchStockTakeLines, parseStockTakeText, StockTakeMatch } from "../../lib/stockTakeParser";

type Step = "paste" | "review" | "done";

interface RowState {
  match: StockTakeMatch;
  itemId: string | null; // editable — starts as match.item?.id, "" means "skip this line"
  newStock: string; // editable text, starts as match.qty
}

export function StockTakeModal({ items, onClose, applyStockAdjustments }: any) {
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const parse = () => {
    const lines = parseStockTakeText(text);
    const matched = matchStockTakeLines(lines, items);
    setRows(
      matched
        .filter((m) => m.qty !== null) // a line with no readable number can't be applied — drop it silently, it's usually a header/blank
        .map((m) => ({ match: m, itemId: m.item?.id || null, newStock: String(m.qty) }))
    );
    setStep("review");
  };

  const setRowItemId = (idx: number, itemId: string) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, itemId: itemId || null } : r)));
  };
  const setRowStock = (idx: number, v: string) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, newStock: v } : r)));
  };
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const itemById = useMemo(() => new Map<string, any>(items.map((it: any) => [it.id, it])), [items]);

  const unmatchedCount = rows.filter((r) => !r.itemId).length;
  const readyCount = rows.filter((r) => r.itemId && r.newStock.trim() !== "" && !Number.isNaN(Number(r.newStock))).length;

  const submit = async () => {
    const lines = rows
      .filter((r) => r.itemId && r.newStock.trim() !== "" && !Number.isNaN(Number(r.newStock)))
      .map((r) => ({ itemId: r.itemId as string, newStock: Number(r.newStock) }));
    if (!lines.length) return;
    setSubmitting(true);
    const res = await applyStockAdjustments(lines, "Stock take");
    setSubmitting(false);
    setResult(res);
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-card p-6 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="font-display text-lg font-bold text-ink">Stock take</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {step === "paste" && (
          <div className="space-y-3 overflow-y-auto">
            <p className="text-xs text-ink/50">
              Paste your counted list below, one item per line — e.g. <span className="italic">"3. Duraguard ppc - 245"</span>.
              I'll match each line to an item and let you review before anything is saved.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={"1. Wonder plus - 223\n2. Wonder PPC - 795\n..."}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-mono"
            />
            <button
              type="button"
              onClick={parse}
              disabled={!text.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              <ClipboardPaste size={16} /> Parse list
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col overflow-hidden">
            <div className="mb-2 flex items-center justify-between shrink-0">
              <p className="text-xs text-ink/50">{rows.length} lines parsed · {readyCount} ready{unmatchedCount ? ` · ${unmatchedCount} need a match` : ""}</p>
              <button onClick={() => setStep("paste")} className="text-xs font-semibold text-brand-500">Edit list</button>
            </div>
            <div className="overflow-y-auto space-y-2 pr-1">
              {rows.map((r, idx) => {
                const currentItem = r.itemId ? itemById.get(r.itemId) : null;
                const oldStock = currentItem?.stock ?? null;
                const delta = currentItem && r.newStock.trim() !== "" ? Number(r.newStock) - (oldStock ?? 0) : null;
                return (
                  <div key={idx} className={`rounded-xl border px-3 py-2.5 ${r.itemId ? "border-line" : "border-warn-300 bg-warn-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-ink/40 truncate flex-1">{r.match.rawName}</p>
                      <button onClick={() => removeRow(idx)} className="text-ink/30 hover:text-bad-500 shrink-0"><X size={13} /></button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <select
                        value={r.itemId || ""}
                        onChange={(e) => setRowItemId(idx, e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold"
                      >
                        <option value="">— No match, pick item —</option>
                        {r.match.candidates.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                        {!r.match.candidates.some((c: any) => c.id === r.itemId) && currentItem && (
                          <option value={currentItem.id}>{currentItem.name}</option>
                        )}
                      </select>
                      <input
                        type="number"
                        value={r.newStock}
                        onChange={(e) => setRowStock(idx, e.target.value)}
                        className="w-20 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-right"
                      />
                    </div>
                    {currentItem && (
                      <p className={`mt-1 text-xs ${delta === 0 ? "text-ink/30" : delta! > 0 ? "text-good-600" : "text-bad-600"}`}>
                        {fmtNum(oldStock ?? 0)} → {r.newStock || "?"} {r.match.item?.unit || currentItem.unit || ""}
                        {delta !== null && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${fmtNum(delta)})` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
              {rows.length === 0 && <p className="text-sm text-ink/40 py-4 text-center">No lines with a readable quantity were found.</p>}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || readyCount === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 shrink-0"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Apply {readyCount} adjustment{readyCount === 1 ? "" : "s"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-good-50 px-4 py-3">
              <CheckCircle2 size={18} className="text-good-500" />
              <p className="text-sm font-semibold text-good-700">
                {result?.succeeded ?? 0}/{result?.total ?? 0} lines applied{result?.failed ? `, ${result.failed} failed` : ""}
              </p>
            </div>
            {result?.results?.some((r: any) => !r.ok) && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.results.filter((r: any) => !r.ok).map((r: any, i: number) => (
                  <p key={i} className="text-xs text-bad-600">{itemById.get(r.itemId)?.name || r.itemId}: {r.message}</p>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full rounded-full bg-brand-500 py-3 text-sm font-semibold text-white">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
