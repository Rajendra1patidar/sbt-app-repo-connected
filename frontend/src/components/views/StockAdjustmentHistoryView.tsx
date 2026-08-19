import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Search } from "lucide-react";
import { Card, EmptyState } from "../common/UIPrimitives";
import { fmtNum, fmtMoney } from "../../lib/format";
import { api } from "../../lib/api";

/* ---- Stock Adjustments history ----
 * Read-only view over StockAdjustment (the audit trail written by both the
 * bulk Stock Take flow and the per-item quick-adjust action). Fetches on its
 * own rather than through useAppStore.fetchAll, same pattern as
 * LedgerReportsView — this data is looked at occasionally, not on every
 * screen, so there's no reason to load it up front for every session.
 */
export function StockAdjustmentHistoryView({ items, currency }: any) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.stockAdjustments
      .list()
      .then((docs: any[]) => { if (!cancelled) setRows(docs); })
      .catch((err: any) => { if (!cancelled) setError(err.message || "Failed to load stock adjustments"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const itemById = useMemo(() => new Map(items.map((it: any) => [it.id, it])), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (itemById.get(r.itemId) as any)?.name || "";
      return name.toLowerCase().includes(q) || (r.reason || "").toLowerCase().includes(q);
    });
  }, [rows, search, itemById]);

  const totals = useMemo(() => {
    const gained = filtered.filter((r) => r.delta > 0).reduce((s, r) => s + r.valueChange, 0);
    const lost = filtered.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.valueChange), 0);
    return { gained, lost, net: gained - lost };
  }, [filtered]);

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-1">
        <div className="flex items-center gap-2">
          <ClipboardList size={17} className="text-ink/50" />
          <h3 className="font-display text-base font-bold text-ink">Stock Adjustments</h3>
        </div>
        <p className="text-xs text-ink/40">
          Every correction made via a stock take or per-item quick adjustment, with the ledger value it posted.
        </p>
      </Card>

      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="text-center py-3">
            <p className="text-xs text-ink/40">Value found</p>
            <p className="font-display text-base font-bold text-good-600">{fmtMoney(totals.gained, currency)}</p>
          </Card>
          <Card className="text-center py-3">
            <p className="text-xs text-ink/40">Value lost</p>
            <p className="font-display text-base font-bold text-bad-600">{fmtMoney(totals.lost, currency)}</p>
          </Card>
          <Card className="text-center py-3">
            <p className="text-xs text-ink/40">Net</p>
            <p className={`font-display text-base font-bold ${totals.net >= 0 ? "text-good-600" : "text-bad-600"}`}>{fmtMoney(totals.net, currency)}</p>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by item or reason..."
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-ink/40"><Loader2 size={20} className="animate-spin" /></div>
      ) : error ? (
        <Card><p className="text-center text-sm text-bad-600">{error}</p></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState text="No stock adjustments recorded yet." /></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const item = itemById.get(r.itemId) as any;
            const up = r.delta > 0;
            return (
              <Card key={r.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{item?.name || "Deleted item"}</p>
                  <p className="text-xs text-ink/40">
                    {fmtNum(r.previousStock)} → {fmtNum(r.newStock)} {item?.unit || ""} · {r.date}
                  </p>
                  {r.reason && <p className="text-xs text-ink/40 italic truncate">{r.reason}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-display text-sm font-bold ${up ? "text-good-600" : "text-bad-600"}`}>
                    {up ? "+" : ""}{fmtNum(r.delta)}
                  </p>
                  <p className="text-xs text-ink/40">{fmtMoney(Math.abs(r.valueChange), currency)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
