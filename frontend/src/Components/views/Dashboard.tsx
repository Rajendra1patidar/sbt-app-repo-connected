import React, { useState } from "react";
import { AlertCircle, AlertTriangle, ArrowDownToLine, BarChart3, Receipt, RotateCcw, ShoppingCart, Users, Wallet } from "lucide-react";
import { Badge, Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { CATEGORY_COLORS, LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtDate, fmtMoney, fmtNum, today } from "../../lib/format";

/* ---- Dashboard ---- */

export function Dashboard({ data, settings, openModal, go }: any) {
  const { customers, estimates, expenses, items, payments } = data;
  const [tab, setTab] = useState("estimates");
  const outstanding = estimates.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0);
  const overdueEstimates = estimates.filter((i: any) => i.status !== "Paid" && i.dueDate && new Date(i.dueDate) < new Date());
  const overdueAmount = overdueEstimates.reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0);
  const byCategory: any = {};
  expenses.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); });
  const catEntries = Object.entries(byCategory) as [string, number][];
  const catTotal = catEntries.reduce((s, [, v]) => s + v, 0);
  const lowStockItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));

  const quickActions = [
    { label: "New Estimate", icon: Receipt, bg: "bg-brand-50", fg: "text-brand-500", action: () => openModal("estimate") },
    { label: "New Customer", icon: Users, bg: "bg-good-50", fg: "text-good-500", action: () => openModal("customer") },
    { label: "New Expense", icon: Wallet, bg: "bg-bad-50", fg: "text-bad-500", action: () => openModal("expense") },
    { label: "New Order", icon: ShoppingCart, bg: "bg-warn-50", fg: "text-warn-500", action: () => openModal("order") },
  ];
  const [segment, setSegment] = useState<"receivable" | "collected">("receivable");
  const collectedThisMonth = estimates.reduce((s: number, e: any) => s + Number(e.amountPaid || 0), 0);

  const refundPayments = (payments || []).filter((p: any) => Number(p.amount) < 0);
  const returnsForList = refundPayments.map((p: any) => ({
    id: p.id, number: `Refund — ${p.invoiceNumber || "—"}`, date: p.date, total: Math.abs(Number(p.amount)),
  }));
  const recentMap: any = { estimates, expenses, returns: returnsForList };
  const recent = recentMap[tab].slice(0, 5);

  // ---- Monthly sales (last 6 months, from estimate dates) ----
  const monthKey = (d?: string) => (d || "").slice(0, 7); // "YYYY-MM"
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, idx) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, label: dt.toLocaleDateString("en-IN", { month: "short" }) };
  });
  const salesByMonth = months.map((m) => ({
    ...m,
    total: estimates.filter((e: any) => monthKey(e.date) === m.key).reduce((s: number, e: any) => s + Number(e.total || 0), 0),
  }));
  const maxSale = Math.max(1, ...salesByMonth.map((m) => m.total));
  const hasSales = salesByMonth.some((m) => m.total > 0);

  // ---- Today / this-month sales vs refunds ----
  const todayKey = today();
  const thisMonthKey = monthKey(now.toISOString());
  const todaySales = estimates.filter((e: any) => e.date === todayKey).reduce((s: number, e: any) => s + Number(e.total || 0), 0);
  const monthSales = salesByMonth[salesByMonth.length - 1]?.total || 0;
  const refundsToday = refundPayments.filter((p: any) => p.date === todayKey).reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
  const refundsMonth = refundPayments.filter((p: any) => monthKey(p.date) === thisMonthKey).reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);

  return (
    <div className="space-y-5 px-5 pb-28">
      <div className="pt-1">
        <h1 className="font-display text-2xl font-semibold text-ink">Welcome, {settings.ownerName}</h1>
        <p className="text-sm text-ink/40">Here's where the business stands today</p>
      </div>

      <div className="flex rounded-2xl bg-white border border-line p-1">
        <button onClick={() => setSegment("receivable")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all duration-150 ${segment === "receivable" ? "bg-paper text-ink shadow-sm" : "text-ink/40"}`}>Receivable</button>
        <button onClick={() => setSegment("collected")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all duration-150 ${segment === "collected" ? "bg-paper text-ink shadow-sm" : "text-ink/40"}`}>Collected</button>
      </div>

      <div className="relative overflow-hidden rounded-card bg-brand-700 p-6 text-white">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/40" />
        <div className="relative">
          <p className="text-xs font-semibold text-white/70">{segment === "receivable" ? "Total receivable" : "Collected this month"}</p>
          <p className="mt-1 font-display text-3xl font-semibold">{fmtMoney(segment === "receivable" ? outstanding : collectedThisMonth, settings.currency)}</p>
          <p className={`mt-1 text-xs font-semibold ${segment === "receivable" && overdueEstimates.length > 0 ? "text-bad-200" : "text-good-200"}`}>
            {segment === "receivable"
              ? overdueEstimates.length > 0 ? `${overdueEstimates.length} overdue estimate${overdueEstimates.length !== 1 ? "s" : ""}` : "Nothing overdue"
              : "Across all estimates"}
          </p>
          <div className="mt-4 flex gap-6">
            <div>
              <p className="text-[11px] text-white/60">Today</p>
              <p className="font-mono text-sm font-semibold">{fmtMoney(todaySales, settings.currency)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/60">This month</p>
              <p className="font-mono text-sm font-semibold">{fmtMoney(monthSales, settings.currency)}</p>
            </div>
          </div>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-3 rounded-card bg-warn-50 border border-warn-500/20 px-4 py-3">
          <AlertTriangle size={16} className="text-warn-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warn-700">Low stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""}</p>
            <div className="mt-2 space-y-1.5">
              {lowStockItems.map((it: any) => {
                const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
                const suggestedQty = Math.max(1, threshold * 2 - (it.stock ?? 0));
                return (
                  <div key={it.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                    <p className="text-xs font-semibold text-warn-700">{it.name} ({fmtNum(it.stock ?? 0)} left)</p>
                    <button
                      onClick={() => openModal("order", { itemId: it.id, qty: suggestedQty })}
                      className="rounded-pill bg-warn-500 px-3 py-1 text-[11px] font-semibold text-white"
                    >
                      Reorder
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-center">
        {quickActions.map((q) => (
          <button key={q.label} onClick={q.action} className="flex flex-col items-center gap-2">
            <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${q.bg} ${q.fg} transition-transform duration-150 active:scale-90`}><q.icon size={20} /></span>
            <span className="text-[11px] font-medium text-ink/60 leading-tight">{q.label}</span>
          </button>
        ))}
      </div>

      {overdueEstimates.length > 0 && (
        <Card className="border-bad-500/20 bg-bad-50/60">
          <div className="flex items-center gap-2 text-bad-700">
            <AlertCircle size={16} /> <h3 className="font-display text-base font-semibold">Overdue</h3>
          </div>
          <p className="mt-1 text-sm text-bad-500">{overdueEstimates.length} estimate{overdueEstimates.length !== 1 ? "s" : ""} past due date.</p>
          <p className="mt-3 font-display text-2xl font-semibold text-bad-700">{fmtMoney(overdueAmount, settings.currency)}</p>
          <PillButton className="mt-4 !bg-bad-500 hover:!bg-bad-700" onClick={() => go("estimates")}>View overdue estimates</PillButton>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2 text-ink/70">
          <ArrowDownToLine size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Sales &amp; refunds</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-ink/40">Today</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(todaySales, settings.currency)}</p>
            {refundsToday > 0 && <p className="text-xs font-semibold text-bad-500">−{fmtMoney(refundsToday, settings.currency)} refunded</p>}
            <p className="text-xs font-semibold text-good-500">Net {fmtMoney(todaySales - refundsToday, settings.currency)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink/40">This month</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(monthSales, settings.currency)}</p>
            {refundsMonth > 0 && <p className="text-xs font-semibold text-bad-500">−{fmtMoney(refundsMonth, settings.currency)} refunded</p>}
            <p className="text-xs font-semibold text-good-500">Net {fmtMoney(monthSales - refundsMonth, settings.currency)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2 text-ink/70">
          <BarChart3 size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Sales, last 6 months</h3>
        </div>
        {!hasSales ? (
          <p className="text-sm text-ink/40">No estimates yet in the last 6 months.</p>
        ) : (
          <div className="flex items-end justify-between gap-2" style={{ height: 150 }}>
            {salesByMonth.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold leading-tight text-ink/50">{m.total > 0 ? fmtMoney(m.total, settings.currency) : ""}</span>
                <div className="w-full rounded-t-lg bg-brand-500 transition-all duration-500 ease-out" style={{ height: `${Math.max(3, (m.total / maxSale) * 100)}px` }} />
                <span className="text-xs font-medium text-ink/40">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-ink/70">
          <RotateCcw size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Recent transactions</h3>
        </div>
        <div className="mb-4 flex gap-2">
          {["estimates", "expenses", "returns"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-pill px-4 py-1.5 text-sm font-semibold capitalize transition-all duration-150 ${tab === t ? "bg-brand-500 text-white" : "bg-paper text-ink/60"}`}>{t}</button>
          ))}
        </div>
        {recent.length === 0 ? (
          <EmptyState text={`No ${tab} yet.`} cta={`Create ${tab === "estimates" ? "Estimate" : tab === "expenses" ? "Expense" : "Estimate"}`}
            onCta={() => openModal(tab === "expenses" ? "expense" : "estimate")} />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((r: any, i: number) => (
              <li key={r.id} style={{ animationDelay: `${i * 25}ms` }} className="animate-row-in flex items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0"><p className="font-semibold text-ink truncate">{r.number || r.category}</p><p className="text-xs text-ink/40 truncate">{fmtDate(r.date)}</p></div>
                <div className="text-right shrink-0"><p className="font-mono font-semibold text-ink">{fmtMoney(r.total ?? r.amount, settings.currency)}</p>{r.status && <Badge status={r.status} />}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {catEntries.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">Top expenses</h3>
            <span className="text-xs font-semibold text-ink/40">This fiscal year</span>
          </div>
          <div className="mb-4 flex h-3 w-full overflow-hidden rounded-pill">
            {catEntries.map(([cat, v], i) => <div key={cat} className={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} style={{ width: `${(v / catTotal) * 100}%` }} />)}
          </div>
          <ul className="space-y-2">
            {catEntries.map(([cat, v], i) => (
              <li key={cat} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink/60"><span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />{cat}</span>
                <span className="font-mono font-semibold text-ink">{fmtMoney(v, settings.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
