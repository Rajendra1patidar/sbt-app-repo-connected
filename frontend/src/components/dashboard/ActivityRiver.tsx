import React, { useMemo, useState } from "react";
import { fmtDate, fmtMoney } from "../../lib/format";
import { TransactionDetailModal, DetailRow } from "./TransactionDetailModal";

type Period = "today" | "week" | "month";
type EventType = "sale" | "payment" | "refund" | "expense" | "purchase";

interface RiverEvent {
  t: number;      // epoch ms
  type: EventType;
  value: number;   // signed contribution to balance
  label: string;
  date?: string;
  rows: DetailRow[];
}

const COLORS: Record<EventType, string> = {
  sale: "var(--river-good, #2E7D5B)",
  payment: "var(--river-brand, #2F5AA8)",
  refund: "var(--river-bad, #B23A2E)",
  expense: "var(--river-bad, #B23A2E)",
  purchase: "var(--river-bad, #B23A2E)",
};

const ACCENT: Record<EventType, "brand" | "good" | "bad" | "warn"> = {
  sale: "good",
  payment: "brand",
  refund: "bad",
  expense: "bad",
  purchase: "warn",
};

const TITLES: Record<Period, string> = { today: "Today, as it happened", week: "This week, as it happened", month: "This month, as it happened" };
const EVENT_TITLES: Record<EventType, string> = { sale: "Sale", payment: "Payment received", refund: "Refund", expense: "Expense", purchase: "Purchase" };

function periodStart(period: Period): number {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "week") { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.getTime(); }
  const d = new Date(now); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d.getTime();
}

export function ActivityRiver({ estimates, payments, expenses, purchases, currency, customers, vendors, items }: any) {
  const [period, setPeriod] = useState<Period>("today");
  const [metric, setMetric] = useState<"balance" | "volume">("balance");
  const [selected, setSelected] = useState<RiverEvent | null>(null);

  const customerName = (id: string) => (customers || []).find((c: any) => c.id === id)?.name || "Unknown customer";
  const vendorName = (id: string) => (vendors || []).find((v: any) => v.id === id)?.name || "Unknown vendor";
  const itemName = (id: string) => (items || []).find((i: any) => i.id === id)?.name || "Item";

  const events: RiverEvent[] = useMemo(() => {
    const start = periodStart(period);
    const list: RiverEvent[] = [];
    (estimates || []).forEach((e: any) => {
      const t = new Date(e.createdAt || e.date).getTime();
      if (t < start) return;
      list.push({
        t, type: "sale", value: Number(e.total || 0), label: `Sale — ${e.number || ""}`, date: e.date,
        rows: [
          { label: "Customer", value: customerName(e.customerId) },
          { label: "Estimate #", value: e.number || "—" },
          { label: "Date", value: fmtDate(e.date) },
          { label: "Status", value: e.status || "—" },
          { label: "Total", value: fmtMoney(e.total || 0, currency), emphasis: true },
          { label: "Paid so far", value: fmtMoney(e.amountPaid || 0, currency) },
        ],
      });
    });
    (payments || []).forEach((p: any) => {
      const t = new Date(p.createdAt || p.date).getTime();
      if (t < start) return;
      const amt = Number(p.amount || 0);
      if (amt < 0) {
        list.push({
          t, type: "refund", value: amt, label: "Refund", date: p.date,
          rows: [
            { label: "Customer", value: customerName(p.customerId) },
            { label: "Against estimate", value: p.invoiceNumber || "—" },
            { label: "Date", value: fmtDate(p.date) },
            { label: "Refunded", value: fmtMoney(Math.abs(amt), currency), emphasis: true },
          ],
        });
      } else {
        list.push({
          t, type: "payment", value: 0, label: "Payment received", date: p.date, // cash-in, doesn't re-count sale value
          rows: [
            { label: "Customer", value: customerName(p.customerId) },
            { label: "Against estimate", value: p.invoiceNumber || "—" },
            { label: "Method", value: p.method || "—" },
            { label: "Date", value: fmtDate(p.date) },
            { label: "Amount", value: fmtMoney(amt, currency), emphasis: true },
          ],
        });
      }
    });
    (expenses || []).forEach((e: any) => {
      const t = new Date(e.createdAt || e.date).getTime();
      if (t < start) return;
      list.push({
        t, type: "expense", value: -Number(e.amount || 0), label: `Expense — ${e.category || ""}`, date: e.date,
        rows: [
          { label: "Category", value: e.category || "—" },
          { label: "Vendor", value: e.vendor || "—" },
          { label: "Date", value: fmtDate(e.date) },
          { label: "Amount", value: fmtMoney(e.amount || 0, currency), emphasis: true },
        ],
      });
    });
    (purchases || []).forEach((p: any) => {
      const t = new Date(p.createdAt || p.date).getTime();
      if (t < start) return;
      list.push({
        t, type: "purchase", value: -Number(p.amount || 0), label: "Purchase", date: p.date,
        rows: [
          { label: "Vendor", value: vendorName(p.vendorId) },
          { label: "Item", value: itemName(p.itemId) },
          { label: "Qty × rate", value: `${p.qty ?? "—"} × ${fmtMoney(p.rate || 0, currency)}` },
          { label: "Date", value: fmtDate(p.date) },
          { label: "Amount", value: fmtMoney(p.amount || 0, currency), emphasis: true },
        ],
      });
    });
    return list.sort((a, b) => a.t - b.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates, payments, expenses, purchases, period, customers, vendors, items]);

  const width = 1080, height = 150, padL = 20, padR = 20, baseY = 110, topY = 22;
  const now = Date.now();
  const start = periodStart(period);

  const points = useMemo(() => {
    if (events.length === 0) return [] as { x: number; y: number; e: RiverEvent; cum: number }[];
    let cum = 0;
    const withCum = events.map((e) => {
      cum += e.value;
      return { e, cum };
    });
    const values = metric === "balance" ? withCum.map((w) => w.cum) : withCum.map((w) => Math.abs(w.e.value));
    const maxV = Math.max(1, ...values.map((v) => Math.abs(v)));
    const span = Math.max(1, now - start);
    return withCum.map((w, i) => {
      const x = padL + ((w.e.t - start) / span) * (width - padL - padR);
      const raw = metric === "balance" ? w.cum : Math.abs(w.e.value);
      const y = baseY - (raw / maxV) * (baseY - topY);
      return { x, y, e: w.e, cum: w.cum };
    });
  }, [events, metric, start, now]);

  const linePath = points.length ? "M" + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L") : "";
  const areaPath = points.length ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z` : "";

  const netTotal = events.reduce((s, e) => s + e.value, 0);

  return (
    <div className="rounded-card bg-card border border-line overflow-hidden shadow-card">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <h2 className="font-display text-[15px] font-medium text-ink">{TITLES[period]}</h2>
        <div className="flex gap-3">
          <div className="flex gap-0.5 rounded-pill bg-paper p-0.5">
            {(["today", "week", "month"] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded-pill px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors ${period === p ? "bg-card text-ink shadow-card" : "text-ink/40"}`}>
                {p === "today" ? "Today" : p === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 rounded-pill bg-paper p-0.5">
            {(["balance", "volume"] as const).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`rounded-pill px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors ${metric === m ? "bg-card text-ink shadow-card" : "text-ink/40"}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="flex h-[150px] items-center justify-center px-5">
          <p className="text-sm text-ink/40">No activity yet {period === "today" ? "today" : `this ${period}`}.</p>
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-[150px] w-full">
          <line x1={0} y1={baseY} x2={width} y2={baseY} className="stroke-line" strokeWidth={1} />
          {areaPath && <path d={areaPath} fill="rgb(var(--color-ink) / 0.08)" />}
          <path d={linePath} fill="none" className="stroke-ink" strokeWidth={2} />
          {points.map((p, i) => (
            <circle
              key={i} cx={p.x} cy={p.y} r={p.e.type === "sale" ? 6.5 : 5} fill={COLORS[p.e.type]}
              className="cursor-pointer"
              style={{ vectorEffect: "non-scaling-stroke" }}
              onClick={() => setSelected(p.e)}
            >
              <title>{`${p.e.label} · ${fmtMoney(Math.abs(p.e.value) || 0, currency)} — tap for details`}</title>
            </circle>
          ))}
        </svg>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 pt-2">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink/40"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2E7D5B" }} />Sale</span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink/40"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2F5AA8" }} />Payment received</span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink/40"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#B23A2E" }} />Purchase / outflow</span>
        </div>
        {events.length > 0 && (
          <span className="font-mono text-[11px] font-semibold text-ink/60">Net {fmtMoney(netTotal, currency)}</span>
        )}
      </div>

      {selected && (
        <TransactionDetailModal
          title={EVENT_TITLES[selected.type]}
          subtitle={selected.label.replace(/^(Sale|Expense)\s*—\s*/, "") || selected.label}
          rows={selected.rows}
          accent={ACCENT[selected.type]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
