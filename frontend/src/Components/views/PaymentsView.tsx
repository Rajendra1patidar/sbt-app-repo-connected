import React, { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { fmtDate, fmtMoney } from "../../lib/format";

/* ---- Payments ---- */

export function PaymentsView({ payments, customers, currency, openModal, removePayment }: any) {
  const [tab, setTab] = useState<"received" | "refunds">("received");
  const [search, setSearch] = useState("");
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";

  const received = payments.filter((p: any) => Number(p.amount) >= 0);
  const refunds = payments.filter((p: any) => Number(p.amount) < 0);
  const list = tab === "received" ? received : refunds;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? list.filter((p: any) => customerName(p.customerId).toLowerCase().includes(q) || (p.invoiceNumber || "").toLowerCase().includes(q))
    : list;

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{payments.length} total</p>
        <PillButton onClick={() => openModal("payment")}><Plus size={16} /> Record Payment</PillButton>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab("received")} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "received" ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>Payments Received ({received.length})</button>
        <button onClick={() => setTab("refunds")} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "refunds" ? "bg-bad-500 text-white" : "bg-paper text-ink/70"}`}>Refunds ({refunds.length})</button>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer or estimate number..."
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
        />
      </div>
      {list.length === 0
        ? <Card><EmptyState text={tab === "received" ? "Record payments you receive." : "Refunds from returned items will show up here."} cta={tab === "received" ? "Record Payment" : undefined} onCta={() => openModal("payment")} /></Card>
        : filtered.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No matches for "{search}".</p></Card>
        : filtered.map((p: any) => (
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
        ))
      }
    </div>
  );
}
