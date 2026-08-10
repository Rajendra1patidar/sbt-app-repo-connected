import React, { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { Pagination } from "../common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { PAGE_SIZE } from "../../lib/constants";
import { fmtDate, fmtMoney } from "../../lib/format";

/* ---- Payments ---- */

type TabKey = "advance" | "partial" | "full" | "refund";

export function PaymentsView({ payments, customers, currency, openModal, removePayment, estimates = [] }: any) {
  const [tab, setTab] = useState<TabKey>("advance");
  const [search, setSearch] = useState("");
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";

  const estimatesById = useMemo(() => {
    return Object.fromEntries((estimates || []).map((estimate: any) => [estimate.id, estimate]));
  }, [estimates]);

  const classify = (payment: any, lookup: Record<string, any>): TabKey => {
    if (payment.type) return payment.type as TabKey;

    const amount = Number(payment.amount || 0);
    if (amount < 0) return "refund";
    if (!payment.invoiceId) return "advance";

    const linkedId = typeof payment.invoiceId === "string" ? payment.invoiceId : payment.invoiceId?.id;
    const linkedEstimate = linkedId ? lookup[linkedId] : null;
    return linkedEstimate?.status === "Paid" ? "full" : "partial";
  };

  const groupedPayments = useMemo(() => {
    const groups: Record<TabKey, any[]> = { advance: [], partial: [], full: [], refund: [] };

    (payments || []).forEach((payment: any) => {
      const category = classify(payment, estimatesById);
      groups[category].push(payment);
    });

    return groups;
  }, [payments, estimatesById]);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "advance", label: "Advance / Booking" },
    { key: "partial", label: "Partial Payment" },
    { key: "full", label: "Payment Received" },
    { key: "refund", label: "Refunds" },
  ];

  const activeList = groupedPayments[tab] || [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? activeList.filter((p: any) => customerName(p.customerId).toLowerCase().includes(q) || (p.invoiceNumber || "").toLowerCase().includes(q))
    : activeList;
  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filtered, PAGE_SIZE);

  const emptyStateText: Record<TabKey, string> = {
    advance: "Advance bookings and deposits will show up here.",
    partial: "Partial payments will show up here.",
    full: "Completed payments will show up here.",
    refund: "Refunds from returned items will show up here.",
  };

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{payments.length} total</p>
        <PillButton onClick={() => openModal("payment")}><Plus size={16} /> Record Payment</PillButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => {
          const isActive = tab === item.key;
          const count = groupedPayments[item.key].length;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${isActive ? (item.key === "refund" ? "bg-bad-500 text-white" : "bg-brand-500 text-white") : "bg-paper text-ink/70"}`}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer or estimate number..."
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
        />
      </div>
      {activeList.length === 0
        ? <Card><EmptyState text={emptyStateText[tab]} cta={tab === "refund" ? undefined : "Record Payment"} onCta={() => openModal("payment")} /></Card>
        : filtered.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No matches for "{search}".</p></Card>
        : <>
          {pageItems.map((p: any) => (
            <Card key={p.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{customerName(p.customerId)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink/40">{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ""}</span>
                  {p.invoiceNumber
                    ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">{p.invoiceNumber}</span>
                    : <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink/40">No estimate linked</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-bold ${Number(p.amount) < 0 ? "text-bad-600" : "text-good-600"}`}>{Number(p.amount) < 0 ? "−" : "+"}{fmtMoney(Math.abs(p.amount), currency)}</span>
                <button onClick={() => removePayment(p.id)} className="rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={16} /></button>
              </div>
            </Card>
          ))}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
        </>
      }
    </div>
  );
}
