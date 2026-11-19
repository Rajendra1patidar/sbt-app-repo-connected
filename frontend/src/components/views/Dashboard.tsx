import React, { useMemo, useState } from "react";
import { EmptyState } from "../common/UIPrimitives";
import { CaptureBar } from "../dashboard/CaptureBar";
import { ActivityRiver } from "../dashboard/ActivityRiver";
import { Brief } from "../dashboard/Brief";
import { RemindersSheet } from "../dashboard/RemindersSheet";
import { SyncChip } from "../dashboard/SyncChip";
import { TransactionDetailModal, DetailRow } from "../dashboard/TransactionDetailModal";
import { NotificationBell } from "../layout/NotificationBell";
import { Group, GroupLabel, GroupRow, HeroMoney, RoundButton, Segmented, StatusChip, cx } from "../ui/kit";
import { PersonIcon } from "../ui/icons";
import { buildBrief, type BriefItem } from "../../lib/brief";
import { daySummary } from "../../lib/daySummary";
import { estimateState, localToday, openBalance } from "../../lib/estimates";
import { fmtDate } from "../../lib/format";
import { inr, inrCompact, shortDate } from "../../lib/money";
import { computeCover } from "../../lib/stockCover";

const SALES_PERIODS: { key: "3m" | "6m" | "1y"; label: string; months: number }[] = [
  { key: "3m", label: "3 months", months: 3 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "1y", label: "1 year", months: 12 },
];
const ALL_CATEGORIES = ["Saria", "Cement", "Kasta", "CPVC", "UPVC", "Others"];

/* ---- Home ----
 * Today at a glance: Net today (sold − spent), the capture bar, the Brief.
 * Below the fold: position, trends and the latest transactions. */
export function Dashboard({ data, settings, role, openModal, go, reorderSuggestions, godowns, saveDocument, savePayment, savePurchase, saveCustomer, saveExpense, saveReturn, showToast, onProfile }: any) {
  const { customers, estimates, expenses, items, payments, purchases, vendors } = data;
  const currency = settings.currency || "₹";
  const isStaff = role === "staff"; // staff can't record or open expenses, so Home doesn't offer that list

  const { today, delta } = useMemo(() => daySummary({ estimates, payments, expenses, purchases }), [estimates, payments, expenses, purchases]);
  const cover = useMemo(() => computeCover({ items, estimates, purchases, vendors, godowns: godowns || [], reorderSuggestions }), [items, estimates, purchases, vendors, godowns, reorderSuggestions]);
  const brief = useMemo(() => buildBrief({ cover, estimates, currency }), [cover, estimates, currency]);
  const [remindersOpen, setRemindersOpen] = useState(false);

  const actOnBrief = (b: BriefItem, which?: "more") => {
    const a = which === "more" && b.more ? b.more.action : b.action;
    if (a.kind === "reminders") { setRemindersOpen(true); return; }
    if (a.kind === "stock") { go("stock"); return; }
    if (a.kind === "purchase") {
      const r = a.row;
      openModal("order", { itemId: r.id, qty: r.suggestQty || undefined, vendorId: r.vendorId, rate: r.lastRate });
    }
  };

  const { receivable } = useMemo(() => openBalance(estimates), [estimates]);
  const tiedUp = useMemo(() => Math.round(items.reduce((s: number, it: any) => s + Number(it.stock || 0) * Number(it.purchasePrice || 0), 0) * 100) / 100, [items]);
  const payable = useMemo(() => Math.round((purchases || []).reduce((s: number, p: any) => s + Math.max(0, Number(p.amount || 0) - Number(p.amountPaid || 0)), 0) * 100) / 100, [purchases]);

  /* ---- trends ---- */
  const [trendTab, setTrendTab] = useState<"activity" | "sales">("activity");
  const [salesPeriod, setSalesPeriod] = useState<"3m" | "6m" | "1y">("6m");
  const [salesCategory, setSalesCategory] = useState<string>("All");
  const salesMonthsCount = SALES_PERIODS.find((p) => p.key === salesPeriod)?.months ?? 6;
  const itemCategoryById = useMemo(() => new Map<string, string>(items.map((it: any) => [it.id, it.category || "Others"])), [items]);
  const lineTotal = (ln: any) => Number(ln.qty || 0) * Number(ln.rate || 0) - Number(ln.discountAmount || 0);
  const amountFor = (e: any) => {
    if (salesCategory === "All") return Number(e.total || 0);
    return (e.lines || []).filter((ln: any) => itemCategoryById.get(ln.itemId) === salesCategory).reduce((s: number, ln: any) => s + lineTotal(ln), 0);
  };
  const monthKey = (d?: string) => (d || "").slice(0, 7);
  const months = useMemo(() => {
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = salesMonthsCount > 6 ? { month: "short", year: "2-digit" } : { month: "short" };
    return Array.from({ length: salesMonthsCount }, (_, idx) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - (salesMonthsCount - 1 - idx), 1);
      return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, label: dt.toLocaleDateString("en-IN", opts) };
    });
  }, [salesMonthsCount]);
  const salesByMonth = months.map((m) => ({ ...m, total: estimates.filter((e: any) => monthKey(e.date) === m.key).reduce((s: number, e: any) => s + amountFor(e), 0) }));
  const maxSale = Math.max(1, ...salesByMonth.map((m) => m.total));
  const hasSales = salesByMonth.some((m) => m.total > 0);
  const categoryTotals = useMemo(() => {
    const keys = new Set(months.map((m) => m.key));
    const totals: Record<string, number> = {};
    estimates.forEach((e: any) => {
      if (!keys.has(monthKey(e.date))) return;
      (e.lines || []).forEach((ln: any) => { const cat = itemCategoryById.get(ln.itemId) || "Others"; totals[cat] = (totals[cat] || 0) + lineTotal(ln); });
    });
    return totals;
  }, [estimates, months, itemCategoryById]);
  const rankedCategories = [...ALL_CATEGORIES].sort((a, b) => (categoryTotals[b] || 0) - (categoryTotals[a] || 0)).slice(0, 4);

  /* ---- recent ---- */
  const [tab, setTab] = useState<"estimates" | "expenses" | "returns">("estimates");
  const refundPayments = (payments || []).filter((p: any) => Number(p.amount) < 0);
  const returnsForList = refundPayments.map((p: any) => ({ id: p.id, number: `Refund, ${p.invoiceNumber || "—"}`, date: p.date, total: Math.abs(Number(p.amount)), _payment: p }));
  const recent = ({ estimates, expenses, returns: returnsForList } as any)[tab].slice(0, 6);
  const [rowDetail, setRowDetail] = useState<{ title: string; subtitle?: string; rows: DetailRow[]; accent?: "brand" | "good" | "bad" | "warn" } | null>(null);
  const customerName = (id: string) => (customers || []).find((c: any) => c.id === id)?.name || "Unknown customer";
  const openRecentRow = (r: any) => {
    if (tab === "estimates") { openModal("viewEstimate", { doc: r }); return; }
    if (tab === "expenses") {
      setRowDetail({ title: "Expense", subtitle: r.category, accent: "bad", rows: [
        { label: "Category", value: r.category || "—" }, { label: "Vendor", value: r.vendor || "—" },
        { label: "Date", value: fmtDate(r.date) }, { label: "Amount", value: inr(r.amount || 0, currency), emphasis: true },
      ] });
      return;
    }
    const p = r._payment;
    setRowDetail({ title: "Refund", subtitle: r.number, accent: "bad", rows: [
      { label: "Customer", value: customerName(p?.customerId) }, { label: "Against estimate", value: p?.invoiceNumber || "—" },
      { label: "Date", value: fmtDate(r.date) }, { label: "Refunded", value: inr(r.total || 0, currency), emphasis: true },
    ] });
  };

  const deltaPositive = delta >= 0;

  return (
    <div className="px-5 pb-28 md:pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pt-7">
        <div className="min-w-0">
          <h1 className="text-large text-ink">Today</h1>
          <p className="truncate text-[14px] leading-5 text-mute">{settings.orgName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <SyncChip />
          <NotificationBell />
          <RoundButton label="Profile menu" onClick={onProfile}><PersonIcon size={22} /></RoundButton>
        </div>
      </div>

      {/* Net today */}
      <div className="mt-3">
        <p className="text-[14px] text-mute">Net today</p>
        <HeroMoney value={today.net} currency={currency} />
        <p className={cx("text-[14px] font-medium", deltaPositive ? "text-good-500" : "text-bad-500")}>
          {deltaPositive ? "+" : "−"}{inr(Math.abs(delta), currency)} compared with this time yesterday
        </p>
      </div>

      {/* Sold / Received / Spent */}
      <div className="mt-3.5 flex overflow-hidden rounded-group border border-line bg-card">
        {[["Sold", today.sold], ["Received", today.received], ["Spent", today.spent]].map(([label, v], i) => (
          <div key={label as string} className={cx("min-w-0 flex-1 px-3.5 py-2.5", i > 0 && "border-l border-line")}>
            <p className="text-micro text-mute">{label}</p>
            <p className="truncate text-lead font-medium tabular-nums text-ink">{inr(v as number, currency)}</p>
          </div>
        ))}
      </div>

      {/* Capture bar */}
      <div className="mt-3.5">
        <CaptureBar
          items={items} customers={customers} vendors={vendors} estimates={estimates} currency={currency} role={role}
          savePurchase={savePurchase} savePayment={savePayment} saveCustomer={saveCustomer} saveExpense={saveExpense} saveReturn={saveReturn}
          openModal={openModal} showToast={showToast} go={go}
        />
      </div>

      {/* Brief */}
      {brief.length > 0 && <div className="mt-3.5"><Brief items={brief} onAct={actOnBrief} /></div>}

      {/* Position */}
      <GroupLabel className="mt-6">Position</GroupLabel>
      <Group>
        <GroupRow className="h-[52px]" onClick={() => go("customerCredit")} chevron>
          <div className="flex items-baseline justify-between gap-3"><span className="text-[16px] text-ink">Owed to you</span><span className="text-[16px] font-medium tabular-nums text-ink">{inr(receivable, currency)}</span></div>
        </GroupRow>
        <GroupRow className="h-[52px]" onClick={() => go("todo")} chevron>
          <div className="flex items-baseline justify-between gap-3"><span className="text-[16px] text-ink">Tied up in stock</span><span className="text-[16px] font-medium tabular-nums text-ink">{inr(tiedUp, currency)}</span></div>
        </GroupRow>
        <GroupRow className="h-[52px]" onClick={() => go("purchases")} chevron>
          <div className="flex items-baseline justify-between gap-3"><span className="text-[16px] text-ink">You owe vendors</span><span className="text-[16px] font-medium tabular-nums text-ink">{inr(payable, currency)}</span></div>
        </GroupRow>
      </Group>

      {/* Trends */}
      <GroupLabel className="mt-6">Trends</GroupLabel>
      <Segmented options={[{ value: "activity", label: "Activity" }, { value: "sales", label: "Sales" }]} value={trendTab} onChange={(v) => setTrendTab(v as any)} />
      <div className="mt-3">
        {trendTab === "activity" ? (
          <Group className="p-4">
            <ActivityRiver estimates={estimates} payments={payments} expenses={expenses} purchases={purchases} customers={customers} vendors={vendors} items={items} currency={currency} />
          </Group>
        ) : (
          <Group className="p-4">
            <Segmented options={SALES_PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={salesPeriod} onChange={(v) => setSalesPeriod(v as any)} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["All", ...rankedCategories].map((c) => (
                <button key={c} type="button" onClick={() => setSalesCategory(c)}
                  className={cx("h-8 rounded-full border px-3 text-[13px] font-medium transition", salesCategory === c ? "border-brand-500 bg-brand-50 text-brand-600" : "border-edge text-mute")}>
                  {c}
                </button>
              ))}
            </div>
            {!hasSales ? (
              <p className="mt-4 text-[14px] text-mute">No estimates{salesCategory !== "All" ? ` for ${salesCategory}` : ""} in this period.</p>
            ) : (
              <div className="mt-4 flex items-end justify-between gap-1.5 overflow-x-auto" style={{ height: 150 }}>
                {salesByMonth.map((m, i) => (
                  <div key={m.key} className="flex h-full min-w-[28px] flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] font-medium tabular-nums text-mute">{m.total > 0 ? inrCompact(m.total, currency) : ""}</span>
                    <div className={cx("w-full rounded-t-[6px] transition-all duration-500 ease-out", i === salesByMonth.length - 1 ? "bg-brand-500" : "bg-brand-200")} style={{ height: `${Math.max(3, (m.total / maxSale) * 100)}px` }} />
                    <span className="text-[12px] text-mute">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Group>
        )}
      </div>

      {/* Recent */}
      <GroupLabel className="mt-6">Recent</GroupLabel>
      <Segmented options={[{ value: "estimates", label: "Estimates" }, ...(isStaff ? [] : [{ value: "expenses", label: "Expenses" }]), { value: "returns", label: "Returns" }]} value={tab} onChange={(v) => setTab(v as any)} />
      <div className="mt-3">
        {recent.length === 0 ? (
          <Group><EmptyState text={`No ${tab} yet.`} cta={tab === "expenses" ? "New expense" : "New estimate"} onCta={() => openModal(tab === "expenses" ? "expense" : "estimate")} /></Group>
        ) : (
          <Group>
            {recent.map((r: any) => {
              const s = tab === "estimates" ? estimateState(r, localToday()) : null;
              return (
                <GroupRow key={r.id} onClick={() => openRecentRow(r)} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-medium text-ink">{tab === "estimates" ? customerName(r.customerId) : (r.category || r.number)}</p>
                      <p className="text-caption text-mute">
                        {tab === "estimates" && <span className="font-doc text-[12px]">{r.number}</span>}
                        {tab === "estimates" ? ", " : ""}{shortDate(r.date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[16px] font-medium tabular-nums text-ink">{inr(r.total ?? r.amount, currency)}</p>
                      {s && <StatusChip tone={s.tone} className="mt-1">{s.label}</StatusChip>}
                    </div>
                  </div>
                </GroupRow>
              );
            })}
          </Group>
        )}
        <button type="button" onClick={() => go(tab === "expenses" ? "expenses" : tab === "returns" ? "payments" : "estimates")} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-500">
          See all {tab}
        </button>
      </div>

      {remindersOpen && (
        <RemindersSheet estimates={estimates} customers={customers} currency={currency} onClose={() => setRemindersOpen(false)}
          onNoPhone={(c) => { setRemindersOpen(false); if (c) { showToast(`Add a phone number for ${c.name} first`); openModal("customer", { editingCustomer: c }); } }} />
      )}
      {rowDetail && <TransactionDetailModal title={rowDetail.title} subtitle={rowDetail.subtitle} rows={rowDetail.rows} accent={rowDetail.accent} onClose={() => setRowDetail(null)} />}
    </div>
  );
}
