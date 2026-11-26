import { Group } from "../ui/kit";
import { inrCompact } from "../../lib/money";

/** A few labelled bars, biggest first: where the value of your stock sits (by category, in a godown).
 *  `bare` draws just the bars, for use inside a surface that already exists (a FoldedGroup). */
export function ValueBars({ rows, currency, className, bare }: { rows: [string, number][]; currency?: string; className?: string; bare?: boolean }) {
  if (rows.length === 0) return null;
  const max = rows[0][1] || 1;
  const bars = rows.map(([label, value]) => (
    <div key={label} className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-caption text-mute">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-caption tabular-nums text-ink">{inrCompact(value, currency)}</span>
    </div>
  ));
  const classes = `space-y-2.5 px-4 py-3.5 ${className || ""}`;
  return bare ? <div className={classes}>{bars}</div> : <Group className={classes}>{bars}</Group>;
}
