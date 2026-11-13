import { useMemo, useState } from "react";
import { parseCapture } from "../../lib/captureParser";
import { qtyText } from "../../lib/money";
import { PrimaryButton, Sheet, StatusChip, TextButton } from "../ui/kit";

export interface SentenceLine { itemId: string; qty: number; rate?: number; discountAmount?: number }

/**
 * "Fill from a sentence": type what the customer asked for — "5 bags PPC, 80 kg saria 12mm,
 * 20 CPVC 1 inch" — and the items are matched for you. Uses the same reader as the capture
 * bar, runs on this device, and nothing is added until you confirm.
 */
export function FillFromSentenceSheet({ items, vendors, estimates, customerName, onClose, onApply }: {
  items: any[]; vendors: any[]; estimates: any[]; customerName?: string; onClose: () => void; onApply: (lines: SentenceLine[]) => void;
}) {
  const [text, setText] = useState("");

  const { matched, missed } = useMemo(() => {
    const segments = text.split(/[\n;,+]|\band\b/gi).map((s) => s.trim()).filter((s) => s.length >= 2);
    const name = customerName || "Customer";
    const ctx = { items, customers: [{ id: "_c", name }], vendors, estimates: [] as any[] };
    const matched: (SentenceLine & { name: string })[] = [];
    const missed: string[] = [];
    for (const seg of segments) {
      let action: any = null;
      try { action = parseCapture(`sold ${seg} to ${name}`, ctx); } catch { action = null; }
      if (action && (action.kind === "sale" || action.kind === "sale_needs_review") && action.item && action.qty > 0) {
        const rate = action.rate ?? (action.amount && action.qty ? action.amount / action.qty : undefined);
        matched.push({ itemId: action.item.id, name: action.item.name, qty: action.qty, rate, discountAmount: action.discountAmount });
      } else {
        missed.push(seg);
      }
    }
    return { matched, missed };
  }, [text, items, vendors, customerName]);

  return (
    <Sheet z={60} onClose={onClose} title="Fill from a sentence"
      footer={
        <div>
          <PrimaryButton disabled={matched.length === 0} onClick={() => onApply(matched)}>
            {matched.length === 0 ? "Add items" : `Add ${matched.length} item${matched.length === 1 ? "" : "s"}`}
          </PrimaryButton>
          <div className="mt-1 flex justify-center"><TextButton tone="quiet" onClick={onClose}>Cancel</TextButton></div>
        </div>
      }>
      <p className="-mt-1 mb-3 text-[14px] leading-5 text-mute">Say what was asked for, separated by commas. Nothing is added until you confirm.</p>
      <textarea
        autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="What was asked for"
        placeholder="5 bags PPC, 80 kg saria 12mm, 20 CPVC 1 inch"
        className="w-full resize-none rounded-control border border-edge bg-card px-3 py-2.5 text-[16px] leading-6 text-ink outline-none placeholder:text-faint focus:border-brand-400"
      />
      {(matched.length > 0 || missed.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {matched.map((m, i) => <StatusChip key={`${m.itemId}-${i}`} tone="insight" className="animate-chip-in">{m.name}, {qtyText(m.qty)}</StatusChip>)}
          {missed.map((m, i) => <StatusChip key={`${m}-${i}`} tone="draft">No match: {m}</StatusChip>)}
        </div>
      )}
      <div className="h-3" />
    </Sheet>
  );
}
