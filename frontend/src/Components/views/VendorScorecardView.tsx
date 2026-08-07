import { useEffect, useState } from "react";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../common/UIPrimitives";
import { fmtMoney } from "../../lib/format";

/* ---- Vendor scorecard: real spend, real fulfillment time, real price trends per item ---- */

export function VendorScorecardView({ currency }: { currency: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.reports
      .vendorScorecard()
      .then(setRows)
      .catch((err: any) => setError(err?.message || "Couldn't load this report"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-1">
        <h3 className="text-sm font-bold text-ink">How this works</h3>
        <p className="text-xs text-ink/40">
          Fulfillment time is measured from real order and receipt dates — there's no promised-delivery-date on file,
          so this reports what actually happened rather than an "on-time %" against an expectation nobody recorded.
        </p>
      </Card>

      {error && <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-ink/40">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState text="No purchases recorded against any vendor yet." />
      ) : (
        <div className="space-y-3">
          {rows.map((v) => (
            <Card key={v.vendorId} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{v.name}</p>
                  {v.phone && <p className="text-xs text-ink/40">{v.phone}</p>}
                </div>
                <p className="shrink-0 font-display text-lg font-bold text-ink">{fmtMoney(v.totalSpend, currency)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-ink/40">Purchases</p>
                  <p className="font-semibold text-ink">{v.purchaseCount}</p>
                </div>
                <div>
                  <p className="text-ink/40">Avg. fulfillment</p>
                  <p className="font-semibold text-ink">{v.avgFulfillmentDays != null ? `${v.avgFulfillmentDays} days` : "No data yet"}</p>
                </div>
                {v.pendingOrders > 0 && (
                  <div className="col-span-2 flex items-center gap-1.5 rounded-xl bg-warn-50 px-3 py-2 text-warn-700">
                    <Clock size={13} />
                    {v.pendingOrders} order{v.pendingOrders !== 1 ? "s" : ""} still pending
                    {v.oldestPendingDays != null && ` — oldest is ${v.oldestPendingDays} days old`}
                  </div>
                )}
              </div>

              {v.priceTrends?.length > 0 && (
                <div className="space-y-1.5 border-t border-line pt-2">
                  <p className="text-xs font-semibold text-ink/50">Price trends</p>
                  {v.priceTrends.slice(0, 5).map((t: any) => (
                    <div key={t.itemId} className="flex items-center justify-between text-xs">
                      <span className="truncate text-ink/70">{t.name}</span>
                      <span className={`flex shrink-0 items-center gap-1 font-semibold ${t.changePct > 0 ? "text-bad-600" : t.changePct < 0 ? "text-good-600" : "text-ink/40"}`}>
                        {t.changePct > 0 ? <TrendingUp size={12} /> : t.changePct < 0 ? <TrendingDown size={12} /> : null}
                        {fmtMoney(t.firstRate, currency)} → {fmtMoney(t.latestRate, currency)} ({t.changePct > 0 ? "+" : ""}{t.changePct}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
