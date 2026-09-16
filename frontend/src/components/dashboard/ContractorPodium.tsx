import React, { useMemo } from "react";
import { fmtNum } from "../../lib/format";
import { estimatePoints, sariaToPoints } from "../../lib/points";

const BAR_COLORS = ["#D9500F", "#8a8d94", "#B27B1E", "#78A6E3"]; // gold, silver, bronze, then brand
const BADGE_STYLE = [
  "bg-[#D9500F] text-white",
  "bg-[#c7c9cf] text-white",
  "bg-[#c9915a] text-white",
  "bg-paper text-ink/40",
];

// Bar height is capped rather than tied to a fixed-height outer box: with only
// a couple of contractors ranked, letting the container grow to fit its own
// content (badge + bar + name + points) means nothing overflows the card
// regardless of how many rows come back, instead of a tall bar poking past a
// hard-coded box height.
const MAX_BAR_HEIGHT = 64;
const MIN_BAR_HEIGHT = 14;

export function ContractorPodium({ estimates, items, scoreRules, go }: any) {
  const ranking = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const byName: Record<string, number> = {};
    (estimates || []).forEach((e: any) => {
      const name = (e.contractorName || "").trim();
      if (!name || String(e.date || "").slice(0, 7) !== monthKey) return;
      const pts = estimatePoints(e, items, scoreRules).points;
      byName[name] = (byName[name] || 0) + pts;
    });
    return Object.entries(byName)
      .map(([name, points]) => ({ name, points }))
      .filter((r) => r.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 4);
  }, [estimates, items, scoreRules]);

  const maxPts = Math.max(1, ...ranking.map((r) => r.points));

  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-4 pb-1">
        <h2 className="font-display text-[13.5px] font-medium text-ink">Contractor rank</h2>
        <button onClick={() => go?.("contractors")} className="text-[10.5px] font-semibold text-ink/40 hover:text-brand-500">See scorecard</button>
      </div>
      {ranking.length === 0 ? (
        <p className="px-5 py-6 text-center text-[12.5px] text-ink/40">No contractor points yet this month.</p>
      ) : (
        // justify-center (not flex-1 columns) so a couple of ranked contractors
        // stay compact instead of stretching their bars to fill the full width
        <div className="flex items-end justify-center gap-6 px-5 pb-5 pt-4">
          {ranking.map((r, i) => {
            const heightPx = Math.max(MIN_BAR_HEIGHT, (r.points / maxPts) * MAX_BAR_HEIGHT);
            return (
              <button key={r.name} onClick={() => go?.("contractors")} className="flex w-16 flex-col items-center gap-1.5 transition-transform duration-150 active:scale-95">
                <span className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold ${BADGE_STYLE[i]}`}>{i + 1}</span>
                <div className="flex w-full items-end" style={{ height: MAX_BAR_HEIGHT }}>
                  <div className="w-full rounded-t-[6px] rounded-b-[2px] transition-all duration-500 ease-out" style={{ height: heightPx, background: BAR_COLORS[i] }} />
                </div>
                <span className="text-center text-[9.5px] font-semibold leading-tight text-ink truncate max-w-full">{r.name}</span>
                <span className="font-mono text-[9px] text-ink/40">{fmtNum(r.points)} pts</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
