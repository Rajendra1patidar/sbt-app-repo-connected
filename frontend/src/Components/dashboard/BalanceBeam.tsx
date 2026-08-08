import React, { useMemo } from "react";
import { fmtMoney } from "../../lib/format";

/** Balance-beam: tilts toward whichever side (receivable vs. tied-up value) is heavier. */
export function BalanceBeam({ receivable, tiedUp, currency }: { receivable: number; tiedUp: number; currency: string }) {
  const total = Math.max(1, receivable + tiedUp);
  const diff = (receivable - tiedUp) / total; // -1..1, positive = receivable heavier
  const angle = Math.max(-8, Math.min(8, diff * 8));

  const key = `${Math.round(receivable)}-${Math.round(tiedUp)}`;
  const style = useMemo(() => ({ transform: `rotate(${angle}deg)`, transformOrigin: "350px 58px" } as React.CSSProperties), [angle]);

  return (
    <div className="rounded-card bg-card border border-line p-5 sm:p-6 shadow-card">
      <div className="mb-3.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink/40">
        <span>Position — receivable vs. tied-up value</span>
      </div>
      <svg viewBox="0 0 700 108" className="block h-[100px] w-full">
        <polygon points="350,50 336,78 364,78" className="fill-ink" />
        <g key={key} style={style} className="transition-transform duration-700 ease-out">
          <rect x="90" y="46" width="520" height="5" rx="2.5" className="fill-ink" />
          <line x1="130" y1="51" x2="130" y2="84" className="stroke-ink/40" strokeWidth={1.5} />
          <line x1="570" y1="51" x2="570" y2="84" className="stroke-ink/40" strokeWidth={1.5} />
          <rect x="66" y="82" width="128" height="12" rx="6" fill="#2F5AA8" />
          <rect x="506" y="82" width="128" height="12" rx="6" fill="#B27B1E" />
        </g>
      </svg>
      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink/40">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2F5AA8" }} />
            Receivable (customer dues)
          </div>
          <div className="mt-0.5 font-mono text-[17px] font-semibold" style={{ color: "#2F5AA8" }}>{fmtMoney(receivable, currency)}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-ink/40">
            Tied up (stock + payable)
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#B27B1E" }} />
          </div>
          <div className="mt-0.5 font-mono text-[17px] font-semibold" style={{ color: "#B27B1E" }}>{fmtMoney(tiedUp, currency)}</div>
        </div>
      </div>
    </div>
  );
}
