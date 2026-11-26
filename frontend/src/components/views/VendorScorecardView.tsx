import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { EmptyNote } from "../ui/blocks";
import { Group, GroupLabel, InsightNote, StatusChip, TextButton, cx } from "../ui/kit";
import { api } from "../../lib/api";
import { inrCompact, inrRate, qtyText } from "../../lib/money";

/* ---- Vendor scorecard: real spend, real fulfilment time, real price trends per item ---- */

export function VendorScorecardView({ currency }: { currency: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.reports
      .vendorScorecard()
      .then((r: any[]) => { if (!cancelled) setRows(r); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || "Couldn't load this report"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className="px-5 pb-28 md:pb-12">
      <InsightNote className="mt-4">
        Fulfilment time is measured from the real order and receipt dates. There's no promised delivery date on file, so this shows what actually happened, not an on-time percentage against a date nobody recorded.
      </InsightNote>

      {error && (
        <Group className="mt-4">
          <p className="px-4 pt-5 text-center text-[15px] text-bad-600">{error}</p>
          <div className="flex justify-center pb-3"><TextButton onClick={() => setAttempt(attempt + 1)}>Try again</TextButton></div>
        </Group>
      )}

      {loading ? (
        <p className="py-12 text-center text-[15px] text-mute">Loading…</p>
      ) : !error && rows.length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Nothing has been bought from any vendor yet." /></Group>
      ) : (
        rows.map((v) => (
          <div key={v.vendorId}>
            <GroupLabel right={<span className="tabular-nums">{inrCompact(v.totalSpend, currency)} spent</span>}>{v.name}</GroupLabel>
            <Group>
              <div className="grid grid-cols-2 divide-x divide-line">
                <div className="px-4 py-3">
                  <p className="text-micro text-mute">Purchases</p>
                  <p className="mt-0.5 text-lead font-medium tabular-nums text-ink">{v.purchaseCount}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-micro text-mute">Usually arrives in</p>
                  <p className="mt-0.5 text-lead font-medium tabular-nums text-ink">{v.avgFulfillmentDays != null ? `${qtyText(v.avgFulfillmentDays)} days` : "No data yet"}</p>
                </div>
              </div>
              {v.pendingOrders > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                  <StatusChip tone="caution">{v.pendingOrders} order{v.pendingOrders === 1 ? "" : "s"} pending</StatusChip>
                  {v.oldestPendingDays != null && <span className="text-caption text-mute">The oldest is {v.oldestPendingDays} days old</span>}
                </div>
              )}
              {v.priceTrends?.length > 0 && (
                <div className="border-t border-line">
                  <p className="px-4 pb-1 pt-3 text-micro text-mute">Price trends</p>
                  {v.priceTrends.slice(0, 5).map((t: any) => (
                    <div key={t.itemId} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2">
                      <span className="min-w-0 truncate text-[16px] text-ink">{t.name}</span>
                      <span className={cx("flex shrink-0 items-center gap-1 text-caption tabular-nums", t.changePct > 0 ? "text-bad-600" : t.changePct < 0 ? "text-good-600" : "text-mute")}>
                        {t.changePct > 0 ? <TrendingUp size={14} /> : t.changePct < 0 ? <TrendingDown size={14} /> : null}
                        {inrRate(t.firstRate, currency)} → {inrRate(t.latestRate, currency)} ({t.changePct > 0 ? "+" : ""}{t.changePct}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {v.phone && <p className="border-t border-line px-4 py-3 text-caption text-mute">{v.phone}</p>}
            </Group>
          </div>
        ))
      )}
    </div>
  );
}
