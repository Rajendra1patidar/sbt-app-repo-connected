import React, { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronsDown, ChevronsUp, ChevronUp,
  Clock, CreditCard, Eye, KeyRound, Phone, Plus, Printer, RotateCcw, Search,
  SlidersHorizontal, Trash2, Truck, Zap,
} from "lucide-react";
import { Badge, Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { SwipeRow, SwipeAction } from "../common/SwipeRow";
import { EstimateFilterSheet } from "../modals/EstimateFilterSheet";
import { Pagination } from "../common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { bookingLineProgress, isFullyCollected } from "../../lib/bookingLogic";
import { PAGE_SIZE, WHATSAPP_GREEN } from "../../lib/constants";
import { fmtDate, fmtMoney, initials, today } from "../../lib/format";
import { waLink } from "../../lib/contactLinks";

/* ---- DocumentList ---- */

type SortMode = "newest" | "oldest" | "amount" | "customer";

const AVATAR_PALETTES = [
  { bg: "bg-brand-50", text: "text-brand-700" },
  { bg: "bg-good-50", text: "text-good-700" },
  { bg: "bg-warn-50", text: "text-warn-700" },
  { bg: "bg-advance-50", text: "text-advance-700" },
  { bg: "bg-bad-50", text: "text-bad-700" },
];
function avatarPalette(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

const STATUS_FILTER_LABELS: Record<string, string> = { all: "All", due: "Due", overdue: "Overdue", paid: "Paid", returned: "Returned" };
const SORT_LABELS: Record<string, string> = { newest: "Newest", oldest: "Oldest", amount: "Amount", customer: "A–Z" };
const SORT_STORAGE_KEY = "sbt_estimate_sort";
const WEEK_COLLAPSE_STORAGE_KEY = "sbt_estimate_collapsed_weeks";

export function DocumentList({ type, docs, customers, items, payments, currency, openModal, removeDoc, restoreDoc, updateStatus, recordPayment, onShareInvoice, onPrint, onView, onReturn, onDeliver, onSharePortalAccess, initialStatusFilter }: any) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || "all"); // all | due | overdue | paid | returned
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>(() => {
    try { return (localStorage.getItem(SORT_STORAGE_KEY) as SortMode) || "newest"; } catch { return "newest"; }
  });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Only one row can be swiped open, and one row's detail expanded, at a time.
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setSortByPersisted = (v: SortMode) => {
    setSortBy(v);
    try { localStorage.setItem(SORT_STORAGE_KEY, v); } catch { /* storage unavailable, ignore */ }
  };

  // Estimates are grouped into calendar-week-style buckets that reset on the
  // 1st of each month (Jul 1–7, Jul 8–14, ...) so labels stay predictable
  // and consistent across months, rather than true rolling calendar weeks
  // that can straddle month boundaries.
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(WEEK_COLLAPSE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const persistCollapsedWeeks = (next: Record<string, boolean>) => {
    setCollapsedWeeks(next);
    try { localStorage.setItem(WEEK_COLLAPSE_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable, ignore */ }
  };
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";
  const customerPhone = (id: string) => customers.find((c: any) => c.id === id)?.phone;
  const labelMap: any = { estimate: "Estimate", challan: "Challan" };
  const emptyMap: any = {
    estimate: "Create estimates to send price quotes and invoices to customers.",
    challan: "Create delivery challans to track goods sent.",
  };
  const weekKey = (d?: string) => {
    const day = Number((d || "").slice(8, 10));
    const ym = (d || "").slice(0, 7);
    if (!ym || Number.isNaN(day)) return "unknown";
    const bucket = Math.floor((day - 1) / 7);
    return `${ym}-w${bucket}`;
  };
  const weekLabel = (key: string) => {
    if (key === "unknown") return "No date";
    const [y, m, wPart] = key.split("-");
    const year = Number(y);
    const month = Number(m) - 1;
    const bucket = Number(wPart.slice(1));
    const start = bucket * 7 + 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const end = Math.min(start + 6, daysInMonth);
    const monthShort = new Date(year, month, 1).toLocaleDateString("en-IN", { month: "short" });
    return `${monthShort} ${start}–${end}, ${year}`;
  };
  const toggleWeek = (k: string, currentlyCollapsed: boolean) => persistCollapsedWeeks({ ...collapsedWeeks, [k]: !currentlyCollapsed });

  // Keep the filter in sync if the caller passes a fresh initialStatusFilter
  // while this component is already mounted (e.g. tapping "View overdue
  // estimates" on the dashboard while already sitting on /estimates).
  const lastInitialFilter = React.useRef(initialStatusFilter);
  if (initialStatusFilter && initialStatusFilter !== lastInitialFilter.current) {
    lastInitialFilter.current = initialStatusFilter;
    if (statusFilter !== initialStatusFilter) setStatusFilter(initialStatusFilter);
  }

  const balanceOf = (d: any) => Math.max(0, Number(d.total || 0) - Number(d.amountPaid || 0));

  // ---- Global signals: independent of the current search/filter, since these
  // describe the whole book of estimates, not just what you're currently looking at. ----
  const dueTotal = useMemo(
    () => (type === "estimate" ? docs.filter((d: any) => !d.deleted && d.status !== "Paid").reduce((s: number, d: any) => s + balanceOf(d), 0) : 0),
    [docs, type]
  );
  const overdueTotal = useMemo(
    () => (type === "estimate" ? docs.filter((d: any) => !d.deleted && d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < new Date()).reduce((s: number, d: any) => s + balanceOf(d), 0) : 0),
    [docs, type]
  );
  // `payments` (a flat list of Payment rows, each with its own `date`) is what makes this
  // accurate — estimates only carry a running `amountPaid` total, not per-payment dates,
  // so there's no way to know how much of it landed *today* without the payments list.
  const collectedToday = useMemo(() => {
    if (type !== "estimate" || !Array.isArray(payments)) return null;
    const t = today();
    return payments.filter((p: any) => p.date === t && Number(p.amount || 0) > 0).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  }, [payments, type]);

  // ---- "Needs attention" — a small, ranked queue combining three signals that
  // already exist separately (the ledger, credit limits, advance-booking activity)
  // but were never surfaced together. Independent of search/filter/sort below. ----
  const attentionItems = useMemo(() => {
    if (type !== "estimate") return [];
    const now = new Date();
    const rows: any[] = [];

    docs.filter((d: any) => !d.deleted && d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < now).forEach((d: any) => {
      const balance = balanceOf(d);
      const daysOverdue = Math.max(1, Math.floor((now.getTime() - new Date(d.dueDate).getTime()) / 86400000));
      rows.push({ kind: "overdue", doc: d, score: daysOverdue * balance, daysOverdue, balance });
    });

    const balanceByCustomer: Record<string, number> = {};
    docs.filter((d: any) => !d.deleted && d.status !== "Paid").forEach((d: any) => {
      balanceByCustomer[d.customerId] = (balanceByCustomer[d.customerId] || 0) + balanceOf(d);
    });
    customers.forEach((c: any) => {
      if (c.creditLimit == null || Number(c.creditLimit) <= 0) return;
      const outstanding = balanceByCustomer[c.id] || 0;
      const pct = outstanding / Number(c.creditLimit);
      if (pct >= 0.85) {
        const doc = docs.filter((d: any) => !d.deleted && d.customerId === c.id && d.status !== "Paid").sort((a: any, b: any) => Number(b.total || 0) - Number(a.total || 0))[0];
        rows.push({ kind: "credit", customer: c, doc, score: pct * outstanding, pct, outstanding });
      }
    });

    docs.filter((d: any) => !d.deleted && d.isAdvanceBooking && (d.lines || []).length > 0 && !isFullyCollected(d)).forEach((d: any) => {
      const deliveries = d.deliveries || [];
      const lastDate = deliveries.length ? deliveries.reduce((max: string, x: any) => (x.date > max ? x.date : max), deliveries[0].date) : d.date;
      const daysSince = Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000);
      if (daysSince >= 14) rows.push({ kind: "quiet", doc: d, score: daysSince, daysSince });
    });

    return rows.sort((a, b) => b.score - a.score).slice(0, 4);
  }, [docs, customers, type]);

  // docs already arrive newest-first from the API (and stay that way as new ones are prepended locally)
  let visibleDocs = docs;
  let searchedDocs = docs;
  if (type === "estimate") {
    // deleted estimates stay in the array but are hidden from the normal view;
    // the "Show deleted" toggle brings them back into the All tab only
    const base = showDeleted ? docs : docs.filter((d: any) => !d.deleted);
    searchedDocs = base;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      searchedDocs = searchedDocs.filter((d: any) => {
        const cust = customers.find((c: any) => c.id === d.customerId);
        const name = (cust?.name || "").toLowerCase();
        const location = (cust?.location || "").toLowerCase();
        const notes = (d.notes || "").toLowerCase();
        return name.includes(q) || location.includes(q) || notes.includes(q);
      });
    }
    visibleDocs = searchedDocs;
    // deleted estimates are void — they never count toward due/overdue/paid/returned, only "All"
    if (statusFilter === "due") visibleDocs = visibleDocs.filter((d: any) => !d.deleted && d.status !== "Paid");
    else if (statusFilter === "overdue") visibleDocs = visibleDocs.filter((d: any) => !d.deleted && d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < new Date());
    else if (statusFilter === "paid") visibleDocs = visibleDocs.filter((d: any) => !d.deleted && d.status === "Paid");
    else if (statusFilter === "returned") visibleDocs = visibleDocs.filter((d: any) => !d.deleted && (d.returns || []).length > 0);
  }

  const filterCounts: Record<string, number> = {
    all: searchedDocs.length,
    due: searchedDocs.filter((d: any) => !d.deleted && d.status !== "Paid").length,
    overdue: searchedDocs.filter((d: any) => !d.deleted && d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < new Date()).length,
    paid: searchedDocs.filter((d: any) => !d.deleted && d.status === "Paid").length,
    returned: searchedDocs.filter((d: any) => !d.deleted && (d.returns || []).length > 0).length,
  };

  // Date-bucket grouping only makes sense alongside a date-based sort — sorting
  // by amount or customer name while still grouping by calendar week would be
  // incoherent, so those two modes drop the week headers for a flat list instead.
  const useWeekGroups = sortBy === "newest" || sortBy === "oldest";
  let orderedDocs = visibleDocs;
  if (sortBy === "oldest") orderedDocs = [...visibleDocs].reverse();
  else if (sortBy === "amount") orderedDocs = [...visibleDocs].sort((a: any, b: any) => Number(b.total || 0) - Number(a.total || 0));
  else if (sortBy === "customer") orderedDocs = [...visibleDocs].sort((a: any, b: any) => customerName(a.customerId).localeCompare(customerName(b.customerId)));

  const weekGroups: { key: string; docs: any[]; total: number }[] = [];
  if (type === "estimate" && useWeekGroups) {
    const map: Record<string, any[]> = {};
    orderedDocs.forEach((d: any) => {
      const k = weekKey(d.date);
      if (!map[k]) { map[k] = []; weekGroups.push({ key: k, docs: map[k], total: 0 }); }
      map[k].push(d);
    });
    weekGroups.forEach((g) => { g.total = g.docs.reduce((s, d) => s + Number(d.total || 0), 0); });
  }

  // Only challans use this flat path (estimates render via weekGroups/orderedDocs above, which
  // already caps visible rows via the collapsed-by-default week sections).
  const { pageItems: pageDocs, page, setPage, totalPages, total, pageSize } = usePagination(visibleDocs, PAGE_SIZE);

  const renderChallanCard = (d: any) => {
    const totalExp = (d.expenses || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const totalInc = (d.incomes || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    return (
      <Card key={d.id}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-ink truncate">{d.number} · {d.route || "–"}</p>
            <p className="text-xs text-ink/40 truncate">{fmtDate(d.fromDate)} → {fmtDate(d.toDate)}</p>
          </div>
          <Badge status={d.status} />
        </div>
        {(d.byWhom || d.transporter) && (
          <div className="mt-2 flex gap-3 text-xs text-ink/50">
            {d.byWhom && <span><span className="font-semibold text-ink/40">By:</span> {d.byWhom}</span>}
            {d.transporter && <span><span className="font-semibold text-ink/40">Via:</span> {d.transporter}</span>}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {totalExp > 0 && <div className="rounded-xl bg-bad-50 px-2 py-1.5"><p className="text-xs text-bad-400">Expenses</p><p className="text-sm font-bold text-bad-600">{fmtMoney(totalExp, currency)}</p></div>}
          {totalInc > 0 && <div className="rounded-xl bg-good-50 px-2 py-1.5"><p className="text-xs text-good-500">Income</p><p className="text-sm font-bold text-good-700">{fmtMoney(totalInc, currency)}</p></div>}
          {d.deliveryFee > 0 && (
            <div className={`rounded-xl px-2 py-1.5 ${d.feeVerified ? "bg-brand-50" : "bg-warn-50 border border-warn-300"}`}>
              <p className={`text-xs flex items-center justify-center gap-1 ${d.feeVerified ? "text-brand-400" : "text-warn-500"}`}>
                {!d.feeVerified && <AlertTriangle size={10} />}Delivery fee
              </p>
              <p className={`text-sm font-bold ${d.feeVerified ? "text-brand-700" : "text-warn-700"}`}>{fmtMoney(d.deliveryFee, currency)}</p>
              {!d.feeVerified && <p className="text-xs text-warn-500 font-semibold">Unverified</p>}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/70">
            {["Pending", "Delivered"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={15} /></button>
        </div>
      </Card>
    );
  };

  // Swipe-to-reveal is a touch gesture — on a desktop with a mouse it's neither
  // discoverable nor reliable (any tiny cursor drift during a normal click reads
  // as a drag attempt, which is what was blocking clicks and making rows feel
  // stuck). Desktop has the horizontal room to just show the actions instead,
  // so this is a one-time check, not a per-row heuristic.
  const isTouchDevice = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches,
    []
  );

  const renderEstimateRow = (d: any) => {
    const isOverdue = d.status === "Due" && d.dueDate && new Date(d.dueDate) < new Date();
    const displayStatus = isOverdue ? "Overdue" : d.status;
    const msg = `Hi ${customerName(d.customerId)}, here is your estimate ${d.number} for ${fmtMoney(d.total, currency)}.`;
    const palette = avatarPalette(d.customerId || d.id);
    const isExpanded = expandedId === d.id;
    const advanceRows = d.isAdvanceBooking ? bookingLineProgress(d) : [];
    const advancePending = advanceRows.filter((r: any) => r.remaining > 0);
    const canCollect = d.isAdvanceBooking && (d.lines || []).length > 0 && !isFullyCollected(d);

    const front = (
      <div
        className="flex cursor-pointer items-center gap-3 px-5 py-3"
        onClick={() => setExpandedId(isExpanded ? null : d.id)}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${palette.bg} ${palette.text}`}>
          {initials(customerName(d.customerId))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{customerName(d.customerId)}</p>
          <p className="truncate text-xs text-ink/40">
            {d.number} · {fmtDate(d.date)}
            {d.isAdvanceBooking ? " · Advance" : ""}
            {d.notes ? ` · 📝 ${d.notes}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-[15px] font-bold text-ink">{fmtMoney(d.total, currency)}</p>
          {d.deleted
            ? <span className="text-[11px] font-semibold text-bad-600">Deleted</span>
            : <Badge status={displayStatus} />}
        </div>
      </div>
    );

    if (d.deleted) {
      return (
        <SwipeRow key={d.id} actions={[]} isOpen={false} onOpenChange={() => {}}>
          <div className="opacity-60 grayscale-[40%]">{front}</div>
          {isExpanded && (
            <div className="flex items-center gap-2 border-t border-line/70 px-5 pb-3 pt-2">
              <RailButton icon={<Eye size={16} />} label="View" onClick={() => onView(d)} />
              <button
                onClick={() => restoreDoc(d.id)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-pill bg-good-500 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98]"
              >
                <RotateCcw size={13} /> Restore
              </button>
            </div>
          )}
        </SwipeRow>
      );
    }

    const swipeActions: SwipeAction[] = [
      { icon: <Eye size={16} />, label: "View", onClick: () => onView(d), className: "bg-paper text-ink/60" },
    ];
    if (canCollect) {
      swipeActions.push({ icon: <Truck size={16} />, label: "Record collection", onClick: () => onDeliver(d), className: "bg-brand-50 text-brand-700" });
    } else if (d.status !== "Paid") {
      swipeActions.push({ icon: <CheckCircle2 size={16} />, label: "Record payment", onClick: () => recordPayment(d), className: "bg-good-50 text-good-700" });
    }
    swipeActions.push({ icon: <Phone size={16} />, label: "Share estimate", onClick: () => onShareInvoice(d), style: { backgroundColor: WHATSAPP_GREEN, color: "#fff" } });

    const detail = isExpanded && (
      <div className="border-t border-line/70 px-5 pb-3 pt-3">
        {d.isAdvanceBooking && advanceRows.length > 0 && (
          <div className="mb-3 rounded-xl bg-brand-50 px-3 py-2">
            <p className="mb-1 text-xs font-semibold text-brand-700">
              {advancePending.length > 0 ? "Advance booking — collection pending" : "Advance booking — fully collected"}
            </p>
            {advancePending.length > 0 && (
              <div className="space-y-0.5">
                {advancePending.map((r: any) => {
                  const itemName = items?.find?.((it: any) => it.id === r.itemId)?.name || "Item";
                  return (
                    <p key={r.itemId} className="text-xs text-brand-600">
                      {itemName}: {r.remaining} of {r.booked} remaining{r.delivered > 0 ? ` (${r.delivered} collected)` : ""}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {(d.lines || []).length > 0 && <RailButton icon={<RotateCcw size={16} />} label="Return" onClick={() => onReturn(d)} />}
          <RailButton icon={<Printer size={16} />} label="Print" onClick={() => onPrint(d)} />
          {d.isAdvanceBooking && onSharePortalAccess && <RailButton icon={<KeyRound size={16} />} label="Portal" onClick={() => onSharePortalAccess(d.customerId)} />}
          <RailButton icon={<Trash2 size={16} />} label="Delete" onClick={() => removeDoc(d.id)} className="ml-auto text-bad-600" />
        </div>
      </div>
    );

    if (!isTouchDevice) {
      // No drag machinery at all on desktop — actions sit inline, always visible,
      // so a plain click on the row is never at risk of being mistaken for a swipe.
      return (
        <div key={d.id} className="border-b border-line/70 last:border-none">
          <div className="flex items-center">
            <div className="min-w-0 flex-1">{front}</div>
            <div className="flex shrink-0 items-center gap-1.5 pr-4">
              {swipeActions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  title={a.label}
                  onClick={(e) => { e.stopPropagation(); a.onClick(); }}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition hover:brightness-95 ${a.className || "bg-paper text-ink/60"}`}
                  style={a.style}
                >
                  {a.icon}
                </button>
              ))}
            </div>
          </div>
          {detail}
        </div>
      );
    }

    return (
      <SwipeRow key={d.id} actions={swipeActions} isOpen={swipeOpenId === d.id} onOpenChange={(open) => setSwipeOpenId(open ? d.id : null)}>
        {front}
        {detail}
      </SwipeRow>
    );
  };

  const activeCount = type === "estimate" ? docs.filter((d: any) => !d.deleted).length : docs.length;
  const deletedCount = type === "estimate" ? docs.filter((d: any) => d.deleted).length : 0;

  const filterTriggerLabel = statusFilter !== "all" ? STATUS_FILTER_LABELS[statusFilter] : (sortBy !== "newest" ? SORT_LABELS[sortBy] : "Filter");
  const filterActive = statusFilter !== "all" || sortBy !== "newest" || showDeleted;

  if (type !== "estimate") {
    return (
      <div className="space-y-3 px-5 pb-28">
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-ink/40">{activeCount} {labelMap[type].toLowerCase()}{activeCount !== 1 ? "s" : ""}</p>
          <PillButton onClick={() => openModal(type)}><Plus size={16} /> New {labelMap[type]}</PillButton>
        </div>
        {docs.length === 0
          ? <Card><EmptyState text={emptyMap[type]} cta={`New ${labelMap[type]}`} onCta={() => openModal(type)} /></Card>
          : pageDocs.map(renderChallanCard)}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{activeCount} estimate{activeCount !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal(type)}><Plus size={16} /> New Estimate</PillButton>
      </div>

      <div className="flex items-center overflow-hidden rounded-card bg-card">
        <div className="flex-1 py-2.5 text-center">
          <p className="text-[10.5px] text-ink/40">Due</p>
          <p className="font-display text-sm font-bold text-ink">{fmtMoney(dueTotal, currency)}</p>
        </div>
        <div className="h-6 w-px bg-line" />
        <div className="flex-1 py-2.5 text-center">
          <p className="text-[10.5px] text-bad-600">Overdue</p>
          <p className="font-display text-sm font-bold text-bad-600">{fmtMoney(overdueTotal, currency)}</p>
        </div>
        {collectedToday !== null && (
          <>
            <div className="h-6 w-px bg-line" />
            <div className="flex-1 py-2.5 text-center">
              <p className="text-[10.5px] text-good-600">Collected</p>
              <p className="font-display text-sm font-bold text-good-700">{fmtMoney(collectedToday, currency)}</p>
            </div>
          </>
        )}
      </div>

      {attentionItems.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 px-1">
            <Zap size={13} className="text-bad-600" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-bad-600">Needs attention · {attentionItems.length}</p>
          </div>
          <div className="space-y-1.5">
            {attentionItems.map((row: any, i: number) => (
              <AttentionBanner key={i} row={row} customerName={customerName} customerPhone={customerPhone} currency={currency} onView={onView} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, location or notes..."
            className="w-full rounded-xl border-none bg-card py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <button
          onClick={() => setFilterSheetOpen(true)}
          className={`relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${filterActive ? "bg-ink text-white" : "bg-card text-ink/70"}`}
        >
          <SlidersHorizontal size={14} /> {filterTriggerLabel}
        </button>
      </div>

      {filterSheetOpen && (
        <EstimateFilterSheet
          onClose={() => setFilterSheetOpen(false)}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          filterCounts={filterCounts}
          sortBy={sortBy}
          setSortBy={setSortByPersisted}
          showDeleted={showDeleted}
          setShowDeleted={setShowDeleted}
          deletedCount={deletedCount}
        />
      )}

      {docs.length === 0 ? (
        <Card><EmptyState text={emptyMap.estimate} cta="New Estimate" onCta={() => openModal(type)} /></Card>
      ) : visibleDocs.length === 0 ? (
        <Card><p className="text-center text-sm text-ink/40">No estimates match your search/filter.</p></Card>
      ) : useWeekGroups ? (
        weekGroups.map((g, idx) => {
          const isCollapsed = collapsedWeeks[g.key] !== undefined ? collapsedWeeks[g.key] : idx !== 0;
          return (
            <div key={g.key}>
              <button onClick={() => toggleWeek(g.key, isCollapsed)} className="flex w-full items-center justify-between rounded-xl bg-card px-4 py-2.5">
                <span className="text-sm font-bold text-ink/80">{weekLabel(g.key)}</span>
                <span className="flex items-center gap-2 text-xs font-semibold text-ink/50">
                  {g.docs.length} estimate{g.docs.length !== 1 ? "s" : ""}
                  <span className="text-ink/70">{fmtMoney(g.total, currency)}</span>
                  {weekGroups.length > 1 && idx === 0 && (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); persistCollapsedWeeks(Object.fromEntries(weekGroups.map((wg) => [wg.key, false]))); }}
                        title="Expand all"
                        className="rounded-full p-1 hover:bg-paper"
                      ><ChevronsDown size={13} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); persistCollapsedWeeks(Object.fromEntries(weekGroups.map((wg) => [wg.key, true]))); }}
                        title="Collapse all"
                        className="rounded-full p-1 hover:bg-paper"
                      ><ChevronsUp size={13} /></button>
                    </span>
                  )}
                  {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </span>
              </button>
              {!isCollapsed && <div className="mt-2 overflow-hidden rounded-card bg-card">{g.docs.map(renderEstimateRow)}</div>}
            </div>
          );
        })
      ) : (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold text-ink/40">Sorted by {SORT_LABELS[sortBy].toLowerCase()}</p>
          <div className="overflow-hidden rounded-card bg-card">{orderedDocs.map(renderEstimateRow)}</div>
        </div>
      )}
    </div>
  );
}

function RailButton({ icon, label, onClick, className = "" }: any) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 text-ink/60 ${className}`}>
      {icon}
      <span className="text-[9.5px] font-semibold">{label}</span>
    </button>
  );
}

function AttentionBanner({ row, customerName, customerPhone, currency, onView }: any) {
  const name = row.kind === "credit" ? row.customer.name : customerName(row.doc.customerId);
  const phone = row.kind === "credit" ? row.customer.phone : customerPhone(row.doc.customerId);
  const palette = row.kind === "overdue" ? { bar: "bg-bad-500" } : row.kind === "credit" ? { bar: "bg-warn-500" } : { bar: "bg-brand-500" };
  const icon = row.kind === "overdue" ? <AlertTriangle size={13} className="text-bad-600" /> : row.kind === "credit" ? <CreditCard size={13} className="text-warn-600" /> : <Clock size={13} className="text-brand-600" />;
  const detail = row.kind === "overdue"
    ? `${row.daysOverdue} day${row.daysOverdue !== 1 ? "s" : ""} overdue · ${fmtMoney(row.balance, currency)}`
    : row.kind === "credit"
    ? `Credit limit at ${Math.round(row.pct * 100)}% · ${fmtMoney(row.outstanding, currency)} of ${fmtMoney(row.customer.creditLimit, currency)}`
    : `No collection in ${row.daysSince} days`;
  const reminderMsg = `Hi ${name}, this is a reminder${row.doc ? ` about estimate ${row.doc.number}` : ""}${row.kind !== "credit" ? ` for ${fmtMoney(row.balance ?? row.doc?.total, currency)}` : ""}. Please let us know if you have any questions.`;

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2.5">
      <span className={`h-6 w-[3px] shrink-0 rounded-pill ${palette.bar}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-ink"><span className="font-semibold">{name}</span></p>
        <p className="flex items-center gap-1 truncate text-[11px] text-ink/50">{icon} {detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {phone && (
          <a
            href={waLink(phone, reminderMsg)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-[11px] font-bold text-white"
            style={{ backgroundColor: WHATSAPP_GREEN }}
          >
            <Phone size={12} /> Remind
          </a>
        )}
        {row.doc && <button onClick={() => onView(row.doc)} className="rounded-pill bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-ink/60">View</button>}
      </div>
    </div>
  );
}
