import { useEffect, useMemo, useState } from "react";
import { EmptyNote, StatRow } from "../ui/blocks";
import { ChevronDownIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, SearchField, TextButton, cx } from "../ui/kit";
import { api } from "../../lib/api";
import { groupByRecency, sortNewest } from "../../lib/estimates";
import { inr, inrCompact, qtyText, shortDate } from "../../lib/money";

/* ---- Stock adjustments history ----
 * Read-only view over StockAdjustment (the audit trail written by both the
 * bulk Stock Take flow and the per-item quick-adjust action). Fetches on its
 * own rather than through useAppStore.fetchAll, same pattern as
 * LedgerReportsView — this data is looked at occasionally, not on every
 * screen, so there's no reason to load it up front for every session.
 * Grouped by week and month like the other lists, newest first.
 */

const SEARCH_CAP = 80;
// Signed ledger value of one correction: the server sends the size, the sign comes from the direction.
const signed = (r: any) => (Number(r.delta) > 0 ? 1 : -1) * Math.abs(Number(r.valueChange) || 0);

export function StockAdjustmentHistoryView({ items, currency }: any) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [capped, setCapped] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.stockAdjustments
      .list()
      .then((docs: any[]) => { if (!cancelled) setRows(docs); })
      .catch((err: any) => { if (!cancelled) setError(err.message || "Couldn't load the stock adjustments"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  const itemById = useMemo(() => new Map<string, any>((items || []).map((it: any) => [it.id, it])), [items]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => sortNewest(rows.filter((r) => {
    if (!q) return true;
    return String(itemById.get(r.itemId)?.name || "").toLowerCase().includes(q) || String(r.reason || "").toLowerCase().includes(q);
  })), [rows, q, itemById]);

  const totals = useMemo(() => {
    const gained = filtered.filter((r) => r.delta > 0).reduce((s, r) => s + Math.abs(r.valueChange || 0), 0);
    const lost = filtered.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.valueChange || 0), 0);
    return { gained, lost, net: gained - lost };
  }, [filtered]);

  const groups = useMemo(() => (q ? [] : groupByRecency(filtered)), [filtered, q]);
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);

  const row = (r: any) => {
    const item = itemById.get(r.itemId);
    const up = r.delta > 0;
    const unit = item?.trackingMode === "weight" ? "pc" : item?.unit || "";
    return (
      <GroupRow key={r.id} className="min-h-[64px] py-2.5">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{item?.name || "Deleted item"}</p>
            <p className="truncate text-caption tabular-nums text-mute">{qtyText(r.previousStock)} → {qtyText(r.newStock)} {unit}, {shortDate(r.date)}</p>
            {r.reason && <p className="truncate text-caption text-mute">{r.reason}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className={cx("text-lead font-medium tabular-nums", up ? "text-good-600" : "text-bad-600")}>{up ? "+" : "−"}{qtyText(Math.abs(r.delta))}</p>
            <p className="text-caption tabular-nums text-mute">{inr(Math.abs(r.valueChange || 0), currency)}</p>
          </div>
        </div>
      </GroupRow>
    );
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      <p className="mt-3 px-1 text-caption text-mute">Every correction from a stock take or a quick fix on an item, with the value it posted to your books.</p>

      {!loading && !error && rows.length > 0 && (
        <div className="mt-3">
          <StatRow stats={[
            { label: "Value found", value: inrCompact(totals.gained, currency), tone: "good" },
            { label: "Value lost", value: inrCompact(totals.lost, currency), tone: "bad" },
            { label: "Net", value: inrCompact(totals.net, currency), tone: totals.net >= 0 ? "good" : "bad" },
          ]} />
        </div>
      )}

      {!loading && !error && rows.length > 0 && <SearchField className="mt-3 !h-11" value={search} onChange={(v) => { setSearch(v); setCapped(true); }} placeholder="Search item or reason" />}

      {loading ? (
        <p className="py-12 text-center text-[15px] text-mute">Loading…</p>
      ) : error ? (
        <Group className="mt-4">
          <p className="px-4 pt-6 text-center text-[15px] text-bad-600">{error}</p>
          <div className="flex justify-center pb-3"><TextButton onClick={() => setAttempt(attempt + 1)}>Try again</TextButton></div>
        </Group>
      ) : rows.length === 0 ? (
        <Group className="mt-4"><EmptyNote text="No stock corrections yet. They appear here after a stock take or when you correct an item's stock." /></Group>
      ) : filtered.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">Nothing matches “{search}”.</p></Group>
      ) : q ? (
        <>
          <GroupLabel right={<span>{filtered.length} correction{filtered.length === 1 ? "" : "s"}</span>}>Results</GroupLabel>
          <Group>{(capped ? filtered.slice(0, SEARCH_CAP) : filtered).map(row)}</Group>
          {capped && filtered.length > SEARCH_CAP && <button type="button" onClick={() => setCapped(false)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {filtered.length}</button>}
        </>
      ) : (
        groups.map((g, i) => {
          const folded = g.collapsible && isCollapsed(g.key, i);
          const net = g.docs.reduce((s, r) => s + signed(r), 0);
          return (
            <div key={g.key}>
              <GroupLabel right={<span className={cx("tabular-nums", net >= 0 ? "text-good-600" : "text-bad-600")}>{net >= 0 ? "+" : ""}{inrCompact(net, currency)}</span>}>
                {g.collapsible ? (
                  <button type="button" onClick={() => setCollapsed({ ...collapsed, [g.key]: !folded })} aria-expanded={!folded} className="inline-flex min-h-[28px] items-center gap-1">
                    <ChevronDownIcon size={14} className={cx("transition-transform", folded && "-rotate-90")} />
                    {g.label} <span className="text-faint">· {g.docs.length}</span>
                  </button>
                ) : g.label}
              </GroupLabel>
              {!folded && <Group>{g.docs.map(row)}</Group>}
            </div>
          );
        })
      )}
    </div>
  );
}
