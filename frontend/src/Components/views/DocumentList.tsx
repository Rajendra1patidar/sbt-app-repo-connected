import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Eye, Phone, Plus, Printer, RotateCcw, Search, Trash2, Truck } from "lucide-react";
import { Badge, Card, EmptyState, GhostButton, PillButton, WhatsAppButton } from "../common/UIPrimitives";
import { bookingLineProgress, isFullyCollected } from "../../lib/bookingLogic";
import { WHATSAPP_GREEN } from "../../lib/constants";
import { fmtDate, fmtMoney } from "../../lib/format";

/* ---- DocumentList ---- */

export function DocumentList({ type, docs, customers, items, currency, openModal, removeDoc, updateStatus, recordPayment, onShareInvoice, onPrint, onView, onReturn, onDeliver }: any) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | due | paid | returned
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";
  const customerPhone = (id: string) => customers.find((c: any) => c.id === id)?.phone;
  const labelMap: any = { estimate: "Estimate", challan: "Challan" };
  const emptyMap: any = {
    estimate: "Create estimates to send price quotes and invoices to customers.",
    challan: "Create delivery challans to track goods sent.",
  };
  const monthKey = (d?: string) => (d || "").slice(0, 7) || "unknown";
  const monthLabel = (key: string) => {
    if (key === "unknown") return "No date";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };
  const toggleMonth = (k: string) => setCollapsedMonths((s) => ({ ...s, [k]: !s[k] }));

  // docs already arrive newest-first from the API (and stay that way as new ones are prepended locally)
  let visibleDocs = docs;
  let searchedDocs = docs;
  if (type === "estimate") {
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
    if (statusFilter === "due") visibleDocs = visibleDocs.filter((d: any) => d.status !== "Paid");
    else if (statusFilter === "paid") visibleDocs = visibleDocs.filter((d: any) => d.status === "Paid");
    else if (statusFilter === "returned") visibleDocs = visibleDocs.filter((d: any) => (d.returns || []).length > 0);
  }

  const filterCounts: Record<string, number> = {
    all: searchedDocs.length,
    due: searchedDocs.filter((d: any) => d.status !== "Paid").length,
    paid: searchedDocs.filter((d: any) => d.status === "Paid").length,
    returned: searchedDocs.filter((d: any) => (d.returns || []).length > 0).length,
  };

  const monthGroups: { key: string; docs: any[] }[] = [];
  if (type === "estimate") {
    const map: Record<string, any[]> = {};
    visibleDocs.forEach((d: any) => {
      const k = monthKey(d.date);
      if (!map[k]) { map[k] = []; monthGroups.push({ key: k, docs: map[k] }); }
      map[k].push(d);
    });
  }

  const renderCard = (d: any) => {
    const isOverdue = type === "estimate" && d.status === "Due" && d.dueDate && new Date(d.dueDate) < new Date();
    const displayStatus = isOverdue ? "Overdue" : d.status;
    const msg = `Hi ${customerName(d.customerId)}, here is your ${labelMap[type].toLowerCase()} ${d.number} for ${fmtMoney(d.total, currency)}.`;
    if (type === "challan") {
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
              {["Pending","Delivered"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={15} /></button>
          </div>
        </Card>
      );
    }

    return (
      <Card key={d.id}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-ink truncate">{d.number}</p>
            <p className="text-xs text-ink/40 truncate">{customerName(d.customerId)} · {fmtDate(d.date)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge status={displayStatus} />
            {type === "estimate" && d.isAdvanceBooking && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Advance Booking</span>
            )}
          </div>
        </div>
        <p className="mt-3 font-display text-lg font-bold text-ink">{fmtMoney(d.total, currency)}</p>
        {type === "estimate" && d.status !== "Due" && Number(d.amountPaid || 0) > 0 && (
          <p className="mt-0.5 text-xs text-ink/50">
            Paid {fmtMoney(d.amountPaid, currency)}
            {d.status !== "Paid" && <span className="text-warn-600 font-semibold"> · {fmtMoney(Number(d.total || 0) - Number(d.amountPaid || 0), currency)} due</span>}
          </p>
        )}
        {type === "estimate" && d.notes && <p className="mt-1 text-xs text-ink/40 line-clamp-2">📝 {d.notes}</p>}
        {type === "estimate" && d.isAdvanceBooking && (() => {
          const rows = bookingLineProgress(d);
          const pending = rows.filter((r: any) => r.remaining > 0);
          if (rows.length === 0) return null;
          const itemName = (id: string) => items?.find?.((it: any) => it.id === id)?.name;
          return (
            <div className="mt-2 rounded-xl bg-brand-50 px-3 py-2">
              <p className="text-xs font-semibold text-brand-700 mb-1">{pending.length > 0 ? "Advance booking — collection pending" : "Advance booking — fully collected"}</p>
              {pending.length > 0 && (
                <div className="space-y-0.5">
                  {pending.map((r: any) => (
                    <p key={r.itemId} className="text-xs text-brand-600">
                      {itemName(r.itemId) || "Item"}: {r.remaining} of {r.booked} remaining{r.delivered > 0 ? ` (${r.delivered} collected)` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {type !== "challan" && (
            <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/70">
              {["Accepted","Due","Partially Paid","Paid"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {type === "estimate" && <GhostButton onClick={() => onView(d)}><Eye size={13} /> View</GhostButton>}
          {type === "estimate" && d.status !== "Paid" && <GhostButton onClick={() => recordPayment(d)}><CheckCircle2 size={13} /> Record payment</GhostButton>}
          {type === "estimate" && d.isAdvanceBooking && (d.lines || []).length > 0 && !isFullyCollected(d) && <GhostButton onClick={() => onDeliver(d)}><Truck size={13} /> Record collection</GhostButton>}
          {type === "estimate" && (d.lines || []).length > 0 && <GhostButton onClick={() => onReturn(d)}><RotateCcw size={13} /> Return items</GhostButton>}
          {type === "estimate" && <GhostButton onClick={() => onPrint(d)}><Printer size={13} /> Print</GhostButton>}
          {type === "estimate"
            ? <button onClick={() => onShareInvoice(d)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98]" style={{ backgroundColor: WHATSAPP_GREEN }}><Phone size={13} /> Share estimate</button>
            : <WhatsAppButton phone={customerPhone(d.customerId)} message={msg} label="Send" />
          }
          <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={15} /></button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{docs.length} {labelMap[type].toLowerCase()}{docs.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal(type)}><Plus size={16} /> New {labelMap[type]}</PillButton>
      </div>
      {type === "estimate" && (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, location or notes..."
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[["all", "All"], ["due", "Due"], ["paid", "Paid"], ["returned", "Returned items"]].map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusFilter === key ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${statusFilter === key ? "bg-white/25" : "bg-ink/10"}`}>{filterCounts[key]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {docs.length === 0
        ? <Card><EmptyState text={emptyMap[type]} cta={`New ${labelMap[type]}`} onCta={() => openModal(type)} /></Card>
        : type === "estimate"
        ? (visibleDocs.length === 0
          ? <Card><p className="text-center text-sm text-ink/40">No estimates match your search/filter.</p></Card>
          : monthGroups.map((g, idx) => {
            const isCollapsed = collapsedMonths[g.key] !== undefined ? collapsedMonths[g.key] : idx !== 0;
            return (
              <div key={g.key}>
                <button onClick={() => toggleMonth(g.key)} className="flex w-full items-center justify-between rounded-xl bg-paper px-4 py-2.5">
                  <span className="text-sm font-bold text-ink/80">{monthLabel(g.key)}</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink/50">
                    {g.docs.length} estimate{g.docs.length !== 1 ? "s" : ""}
                    {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                  </span>
                </button>
                {!isCollapsed && <div className="mt-2 space-y-3">{g.docs.map(renderCard)}</div>}
              </div>
            );
          }))
        : visibleDocs.map(renderCard)
      }
    </div>
  );
}
