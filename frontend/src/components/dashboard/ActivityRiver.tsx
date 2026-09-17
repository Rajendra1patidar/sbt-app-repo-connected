import React, { useMemo, useState } from "react";
import { BarChart2, TrendingUp } from "lucide-react";
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
  sale: "#2E7D5B",
  payment: "#2F5AA8",
  refund: "#B23A2E",
  expense: "#B23A2E",
  purchase: "#B27B1E",
};

const ACCENT: Record<EventType, "brand" | "good" | "bad" | "warn"> = {
  sale: "good",
  payment: "brand",
  refund: "bad",
  expense: "bad",
  purchase: "warn",
};

const PERIODS: { key: Period; label: string }[] = [{ key: "today", label: "Today" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }];
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
          t, type: "payment", value: 0, label: "Payment received", date: p.date,
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

  const width = 1080, height = 130, padL = 20, padR = 20, baseY = 96, topY = 18;
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
    return withCum.map((w) => {
      const x = padL + ((w.e.t - start) / span) * (width - padL - padR);
      const raw = metric === "balance" ? w.cum : Math.abs(w.e.value);
      const y = baseY - (raw / maxV) * (baseY - topY);
      return { x, y, e: w.e, cum: w.cum };
    });
  }, [events, metric, start, now]);

  const linePath = points.length ? "M" + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L") : "";
  const areaPath = points.length ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z` : "";

  const netTotal = events.reduce((s, e) => s + e.value, 0);
  const periodIdx = PERIODS.findIndex((p) => p.key === period);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex rounded-pill bg-paper p-0.5">
          <div
            className="absolute inset-y-0.5 left-0.5 rounded-pill bg-card shadow-card transition-transform duration-300 ease-out"
            style={{ width: `calc(${100 / PERIODS.length}% - 2px)`, transform: `translateX(${periodIdx * 100}%)` }}
          />
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`relative z-10 rounded-pill px-3 py-1.5 text-[11px] font-semibold transition-colors ${period === p.key ? "text-ink" : "text-ink/40"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMetric((m) => (m === "balance" ? "volume" : "balance"))}
          className="flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1.5 text-[10.5px] font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          {metric === "balance" ? <TrendingUp size={12} /> : <BarChart2 size={12} />}
          {metric === "balance" ? "Running total" : "Per-event"}
        </button>
      </div>

      <p className="pt-2 text-[11px] text-ink/40">{period === "today" ? "Today" : period === "week" ? "This week" : "This month"}, as it happened</p>

      {points.length === 0 ? (
        <div className="flex h-[110px] items-center justify-center">
          <p className="text-sm text-ink/40">No activity yet {period === "today" ? "today" : `this ${period}`}.</p>
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-[110px] w-full">
          <defs>
            <linearGradient id="riverFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2F5AA8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#2F5AA8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={0} y1={baseY} x2={width} y2={baseY} className="stroke-line" strokeWidth={1} />
          {areaPath && <path d={areaPath} fill="url(#riverFade)" />}
          <path d={linePath} fill="none" stroke="#2F5AA8" strokeWidth={2} />
          {points.map((p, i) => (
            <circle
              key={i} cx={p.x} cy={p.y} r={p.e.type === "sale" ? 6 : 4.5} fill={COLORS[p.e.type]}
              className="cursor-pointer"
              style={{ vectorEffect: "non-scaling-stroke" }}
              onClick={() => setSelected(p.e)}
            >
              <title>{`${p.e.label} · ${fmtMoney(Math.abs(p.e.value) || 0, currency)} — tap for details`}</title>
            </circle>
          ))}
        </svg>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 pt-2">
        <div className="flex gap-3.5">
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink/40"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2E7D5B" }} />Sale</span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink/40"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2F5AA8" }} />Payment</span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink/40"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#B23A2E" }} />Outflow</span>
        </div>
        {events.length > 0 && (
          <span className={`font-mono text-[11px] font-semibold ${netTotal >= 0 ? "text-good-500" : "text-bad-500"}`}>Net {fmtMoney(netTotal, currency)}</span>
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
