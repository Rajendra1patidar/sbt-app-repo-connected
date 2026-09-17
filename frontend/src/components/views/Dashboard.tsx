import React, { useMemo, useState } from "react";
import { BarChart3, ChevronDown, RotateCcw, Trophy } from "lucide-react";
import { Badge, EmptyState } from "../common/UIPrimitives";
import { CATEGORY_COLORS, LOW_STOCK_DEFAULT } from "../../lib/constants";
import { fmtDate, fmtMoney, round2 } from "../../lib/format";
import { CaptureBar } from "../dashboard/CaptureBar";
import { ActivityRiver } from "../dashboard/ActivityRiver";
import { AlertStrip, buildDashboardAlerts } from "../dashboard/AlertStrip";
import { TodaySnapshot } from "../dashboard/TodaySnapshot";
import { PositionBar } from "../dashboard/PositionBar";
import { ContractorPodium } from "../dashboard/ContractorPodium";
import { TransactionDetailModal, DetailRow } from "../dashboard/TransactionDetailModal";

/* Sales chart period options, shown as a segmented control above the chart. */
const SALES_PERIODS: { key: "3m" | "6m" | "1y"; label: string; months: number }[] = [
  { key: "3m", label: "3m", months: 3 },
  { key: "6m", label: "6m", months: 6 },
  { key: "1y", label: "1y", months: 12 },
];
const ALL_CATEGORIES = ["Saria", "Cement", "Kasta", "CPVC", "UPVC", "Others"];

/* ---- Dashboard ---- */

export function Dashboard({ data, settings, openModal, go, reorderSuggestions, saveDocument, savePayment, savePurchase, saveCustomer, saveExpense, saveReturn, showToast }: any) {
  const { customers, estimates, expenses, items, payments, purchases, vendors, scoreRules } = data;
  const [tab, setTab] = useState("estimates");
  const overdueEstimates = estimates.filter((i: any) => i.status !== "Paid" && i.dueDate && new Date(i.dueDate) < new Date());
  const overdueAmount = round2(overdueEstimates.reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0));
  const byCategory: any = {};
  expenses.forEach((e: any) => { byCategory[e.category] = round2((byCategory[e.category] || 0) + Number(e.amount)); });
  const catEntries = (Object.entries(byCategory) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const catTotal = round2(catEntries.reduce((s, [, v]) => s + v, 0));
  const lowStockItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));
  const paceSuggestionByItem = new Map<string, any>((reorderSuggestions || []).filter((s: any) => s.mode === "pace").map((s: any) => [s.itemId, s]));

  const payable = round2((purchases || []).reduce((s: number, p: any) => s + Math.max(0, Number(p.amount || 0) - Number(p.amountPaid || 0)), 0));

  // Position — receivable (total outstanding across all estimates, same
  // shape as overdueAmount above just without the date filter) vs. tiedUp
  // (stock valued at purchase price). Both are plain sums over existing
  // fields, feeding PositionBar below.
  const receivable = round2(estimates.reduce((s: number, e: any) => s + Math.max(0, Number(e.total || 0) - Number(e.amountPaid || 0)), 0));
  const tiedUp = round2(items.reduce((s: number, it: any) => s + Number(it.stock || 0) * Number(it.purchasePrice || 0), 0));

  const refundPayments = (payments || []).filter((p: any) => Number(p.amount) < 0);
  const returnsForList = refundPayments.map((p: any) => ({
    id: p.id, number: `Refund — ${p.invoiceNumber || "—"}`, date: p.date, total: Math.abs(Number(p.amount)), _payment: p,
  }));
  const recentMap: any = { estimates, expenses, returns: returnsForList };
  const recent = recentMap[tab].slice(0, 5);

  // Row detail popup for Recent transactions (estimates open the full ViewEstimateModal
  // via openModal; expenses/returns don't have a dedicated modal yet, so they use this
  // lightweight read-only popup instead).
  const [rowDetail, setRowDetail] = useState<{ title: string; subtitle?: string; rows: DetailRow[]; accent?: "brand" | "good" | "bad" | "warn" } | null>(null);
  const customerName = (id: string) => (customers || []).find((c: any) => c.id === id)?.name || "Unknown customer";
  const openRecentRow = (r: any) => {
    if (tab === "estimates") { openModal("viewEstimate", { doc: r }); return; }
    if (tab === "expenses") {
      setRowDetail({
        title: "Expense", subtitle: r.category, accent: "bad",
        rows: [
          { label: "Category", value: r.category || "—" },
          { label: "Vendor", value: r.vendor || "—" },
          { label: "Date", value: fmtDate(r.date) },
          { label: "Amount", value: fmtMoney(r.amount || 0, settings.currency), emphasis: true },
        ],
      });
      return;
    }
    // returns
    const p = r._payment;
    setRowDetail({
      title: "Refund", subtitle: r.number, accent: "bad",
      rows: [
        { label: "Customer", value: customerName(p?.customerId) },
        { label: "Against estimate", value: p?.invoiceNumber || "—" },
        { label: "Date", value: fmtDate(r.date) },
        { label: "Refunded", value: fmtMoney(r.total || 0, settings.currency), emphasis: true },
      ],
    });
  };

  // ---- Monthly sales, with a period toggle (3 / 6 / 12 months) and a smart
  // category filter: chips are ranked by this period's own sales instead of
  // a fixed order, so the categories actually moving product surface first. ----
  const [salesPeriod, setSalesPeriod] = useState<"3m" | "6m" | "1y">("6m");
  const [salesCategory, setSalesCategory] = useState<string>("All");
  const [showMoreCats, setShowMoreCats] = useState(false);
  const salesMonthsCount = SALES_PERIODS.find((p) => p.key === salesPeriod)?.months ?? 6;
  const itemCategoryById = new Map<string, string>(items.map((it: any) => [it.id, it.category || "Others"]));
  const lineTotal = (ln: any) => Number(ln.qty || 0) * Number(ln.rate || 0) - Number(ln.discountAmount || 0);
  const estimateAmountForCategory = (e: any) => {
    if (salesCategory === "All") return Number(e.total || 0);
    return (e.lines || []).filter((ln: any) => itemCategoryById.get(ln.itemId) === salesCategory).reduce((s: number, ln: any) => s + lineTotal(ln), 0);
  };

  const monthKey = (d?: string) => (d || "").slice(0, 7); // "YYYY-MM"
  const now = new Date();
  const months = useMemo(() => {
    const fmtOpts: Intl.DateTimeFormatOptions = salesMonthsCount > 6 ? { month: "short", year: "2-digit" } : { month: "short" };
    return Array.from({ length: salesMonthsCount }, (_, idx) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - (salesMonthsCount - 1 - idx), 1);
      return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, label: dt.toLocaleDateString("en-IN", fmtOpts) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesMonthsCount]);
  const monthKeys = new Set(months.map((m) => m.key));

  const salesByMonth = months.map((m) => ({
    ...m,
    total: estimates.filter((e: any) => monthKey(e.date) === m.key).reduce((s: number, e: any) => s + estimateAmountForCategory(e), 0),
  }));
  const maxSale = Math.max(1, ...salesByMonth.map((m) => m.total));
  const hasSales = salesByMonth.some((m) => m.total > 0);

  // rank categories by how much they actually sold in the selected window, so
  // the filter row leads with what matters instead of an arbitrary fixed order
  const categoryTotalsThisPeriod = useMemo(() => {
    const totals: Record<string, number> = {};
    estimates.forEach((e: any) => {
      if (!monthKeys.has(monthKey(e.date))) return;
      (e.lines || []).forEach((ln: any) => {
        const cat = itemCategoryById.get(ln.itemId) || "Others";
        totals[cat] = (totals[cat] || 0) + lineTotal(ln);
      });
    });
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates, salesMonthsCount]);
  const rankedCategories = [...ALL_CATEGORIES].sort((a, b) => (categoryTotalsThisPeriod[b] || 0) - (categoryTotalsThisPeriod[a] || 0));
  const topCategory = rankedCategories.find((c) => (categoryTotalsThisPeriod[c] || 0) > 0);
  const visibleCategories = showMoreCats ? rankedCategories : rankedCategories.slice(0, 3);

  const alerts = buildDashboardAlerts({ lowStockItems, overdueEstimates, overdueAmount, payable, currency: settings.currency, go, paceSuggestionByItem, LOW_STOCK_DEFAULT, openModal });

  return (
    <div className="pb-28 px-5 lg:px-0">
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Hero: the one number worth seeing before anything else, plus the
          capture bar right underneath it — one opening statement instead of
          two separately-boxed sections. Everything here sits on the page's
          own paper background; no separate color block. */}
      <div className="pt-1" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <h1 className="font-display text-2xl font-semibold text-ink">Welcome, {settings.ownerName}</h1>
        <p className="text-sm text-ink/40 mb-5">Here's where the business stands today</p>
        <TodaySnapshot estimates={estimates} payments={payments} expenses={expenses} purchases={purchases} currency={settings.currency} />
      </div>

      <div className="animate-rise-in" style={{ "--rise-delay": "80ms" } as React.CSSProperties}>
        <CaptureBar
          items={items} customers={customers} vendors={vendors} estimates={estimates} currency={settings.currency}
          saveDocument={saveDocument} savePayment={savePayment} savePurchase={savePurchase} saveCustomer={saveCustomer} saveExpense={saveExpense} saveReturn={saveReturn}
          openModal={openModal} showToast={showToast}
        />
      </div>

      {alerts.length > 0 && (
        <div className="animate-rise-in" style={{ "--rise-delay": "160ms" } as React.CSSProperties}>
          <AlertStrip alerts={alerts} />
        </div>
      )}

      <div className="animate-rise-in" style={{ "--rise-delay": "240ms" } as React.CSSProperties}>
        <PositionBar receivable={receivable} tiedUp={tiedUp} currency={settings.currency} />
      </div>

      {/* One continuous panel — every section below is a division of the same
          surface (divide-y), not a separate floating card, so the page reads
          as a single sheet rather than a stack of disconnected boxes. */}
      <div className="animate-rise-in rounded-card bg-card border border-line shadow-card divide-y divide-line overflow-hidden" style={{ "--rise-delay": "320ms" } as React.CSSProperties}>

        <ActivityRiver estimates={estimates} payments={payments} expenses={expenses} purchases={purchases} customers={customers} vendors={vendors} items={items} currency={settings.currency} />

        <div className="px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-ink/70">
              <BarChart3 size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Sales</h3>
            </div>
            <div className="flex gap-0.5 rounded-pill bg-paper p-0.5">
              {SALES_PERIODS.map((p) => (
                <button key={p.key} onClick={() => setSalesPeriod(p.key)}
                  className={`rounded-pill px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${salesPeriod === p.key ? "bg-card text-ink shadow-card" : "text-ink/40"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setSalesCategory("All")}
              className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors ${salesCategory === "All" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink/50"}`}>
              All
            </button>
            {visibleCategories.map((c) => (
              <button key={c} onClick={() => setSalesCategory(c)}
                className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors ${salesCategory === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink/50"}`}>
                {c === topCategory && <Trophy size={9} className="mr-1 inline -mt-0.5 text-warn-500" />}{c}
              </button>
            ))}
            {rankedCategories.length > 3 && (
              <button onClick={() => setShowMoreCats((v) => !v)} className="flex items-center gap-0.5 rounded-pill px-2 py-1 text-[11px] font-semibold text-ink/40">
                {showMoreCats ? "Less" : "More"} <ChevronDown size={11} className={`transition-transform ${showMoreCats ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
          {topCategory && salesCategory === "All" && (
            <p className="mb-3 text-[10.5px] text-ink/40">Best seller this period: <span className="font-semibold text-ink/60">{topCategory}</span></p>
          )}

          {!hasSales ? (
            <p className="mt-3 text-sm text-ink/40">No estimates{salesCategory !== "All" ? ` for ${salesCategory}` : ""} in the last {SALES_PERIODS.find((p) => p.key === salesPeriod)?.label}.</p>
          ) : (
            <div className="mt-3 flex items-end justify-between gap-1.5 overflow-x-auto" style={{ height: 150 }}>
              {salesByMonth.map((m) => (
                <div key={m.key} className="flex h-full min-w-[28px] flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[9.5px] font-semibold leading-tight text-ink/50">{m.total > 0 ? fmtMoney(m.total, settings.currency) : ""}</span>
                  <div className="w-full rounded-t-lg bg-brand-500 transition-all duration-500 ease-out" style={{ height: `${Math.max(3, (m.total / maxSale) * 100)}px` }} />
                  <span className="text-[10.5px] font-medium text-ink/40">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-ink/70">
            <RotateCcw size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Recent transactions</h3>
          </div>
          <div className="mb-4 flex gap-2">
            {["estimates", "expenses", "returns"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-pill px-4 py-1.5 text-sm font-semibold capitalize transition-all duration-150 ${tab === t ? "bg-brand-500 text-white" : "bg-paper text-ink/60"}`}>{t}</button>
            ))}
          </div>

          {tab === "expenses" && catEntries.length > 0 && (
            <div className="mb-4 rounded-xl bg-paper/60 p-3">
              <div className="mb-2.5 flex h-2.5 w-full overflow-hidden rounded-pill">
                {catEntries.map(([cat, v], i) => <div key={cat} className={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} style={{ width: `${(v / catTotal) * 100}%` }} />)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {catEntries.slice(0, 4).map(([cat, v], i) => (
                  <span key={cat} className="flex items-center gap-1.5 text-[11px] text-ink/60">
                    <span className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />{cat}
                    <span className="font-mono font-semibold text-ink">{fmtMoney(v, settings.currency)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {recent.length === 0 ? (
            <EmptyState text={`No ${tab} yet.`} cta={`Create ${tab === "estimates" ? "Estimate" : tab === "expenses" ? "Expense" : "Estimate"}`}
              onCta={() => openModal(tab === "expenses" ? "expense" : "estimate")} />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r: any, i: number) => (
                <li key={r.id} style={{ animationDelay: `${i * 25}ms` }}>
                  <button
                    onClick={() => openRecentRow(r)}
                    className="animate-row-in flex w-full items-center justify-between gap-2 py-3 text-sm text-left transition-colors hover:bg-paper/60 rounded-lg -mx-1 px-1"
                  >
                    <div className="min-w-0"><p className="font-semibold text-ink truncate">{r.number || r.category}</p><p className="text-xs text-ink/40 truncate">{fmtDate(r.date)}</p></div>
                    <div className="text-right shrink-0"><p className="font-mono font-semibold text-ink">{fmtMoney(r.total ?? r.amount, settings.currency)}</p>{r.status && <Badge status={r.status} />}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ContractorPodium estimates={estimates} items={items} scoreRules={scoreRules} go={go} />
      </div>
    </div>

    {rowDetail && (
      <TransactionDetailModal
        title={rowDetail.title}
        subtitle={rowDetail.subtitle}
        rows={rowDetail.rows}
        accent={rowDetail.accent}
        onClose={() => setRowDetail(null)}
      />
    )}
    </div>
  );
}
