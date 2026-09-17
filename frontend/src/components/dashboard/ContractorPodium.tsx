import React, { useMemo } from "react";
import { fmtNum } from "../../lib/format";
import { estimatePoints } from "../../lib/points";

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
      .slice(0, 5);
  }, [estimates, items, scoreRules]);

  const maxPts = Math.max(1, ...ranking.map((r) => r.points));

  return (
    <div>
      <div className="mb-3.5 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/30">Contractor rank — this month</p>
        <button onClick={() => go?.("contractors")} className="text-[11px] font-semibold text-brand-700 hover:underline">See scorecard →</button>
      </div>
      {ranking.length === 0 ? (
        <p className="text-[12.5px] text-ink/35">No contractor points yet this month.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ranking.map((r, i) => (
            <button
              key={r.name}
              onClick={() => go?.("contractors")}
              className="group flex items-center gap-2.5 rounded-md px-1 py-0.5 -mx-1 transition-colors duration-150 hover:bg-ink/[0.04]"
            >
              <span className="w-3 shrink-0 font-mono text-[10.5px] text-ink/30">{i + 1}</span>
              <span className="flex-1 truncate text-left text-[12.5px] font-medium text-ink">{r.name}</span>
              <div className="h-[4px] w-20 shrink-0 overflow-hidden rounded-pill bg-line">
                <div className="h-full rounded-pill bg-ink transition-all duration-700 ease-out" style={{ width: `${Math.max(4, (r.points / maxPts) * 100)}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-[10.5px] text-ink/40">{fmtNum(r.points)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
