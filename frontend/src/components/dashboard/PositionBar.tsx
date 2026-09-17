import React from "react";
import { fmtMoney } from "../../lib/format";

/* ---- Position ----
 * A flat, two-tone proportion bar: money owed to you (receivable) vs.
 * money sitting in stock on your shelves (tied up in inventory). Both
 * numbers are plain sums over data the app already has — no new fields,
 * no invented metric:
 *   receivable = total outstanding balance across all estimates
 *                (total - amountPaid, same shape as the existing
 *                overdue-amount calculation, just not date-filtered)
 *   tiedUp     = sum of stock × purchasePrice across items
 * Passed in pre-computed from Dashboard.tsx, same pattern as every other
 * derived number on this page. */
export function PositionBar({ receivable, tiedUp, currency }: { receivable: number; tiedUp: number; currency: string }) {
  const total = Math.max(1, receivable + tiedUp);
  const receivablePct = Math.min(100, Math.max(0, (receivable / total) * 100));

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/30">Position</p>
      <div className="mt-3 flex h-[5px] overflow-hidden rounded-pill bg-line">
        <div className="h-full bg-ink transition-all duration-700 ease-out" style={{ width: `${receivablePct}%` }} />
        <div className="h-full bg-warn-500 transition-all duration-700 ease-out" style={{ width: `${100 - receivablePct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-ink/55">
        <span>Receivable <span className="font-mono font-semibold text-ink">{fmtMoney(receivable, currency)}</span></span>
        <span>Tied up <span className="font-mono font-semibold text-warn-500">{fmtMoney(tiedUp, currency)}</span></span>
      </div>
    </div>
  );
}
