import React, { useState } from "react";
import { PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton, Badge } from "../common/UIPrimitives";
import { fmtDate, fmtMoney, fmtNum } from "../../lib/format";

/* ---- Purchases ---- */

export function PurchasesView({ purchases, vendors, items, currency, openModal, removePurchase }: any) {
  const [search, setSearch] = useState("");

  const vendorName = (id: string) => vendors.find((v: any) => v.id === id)?.name || "Unknown vendor";
  const itemName = (id: string) => items.find((i: any) => i.id === id)?.name || "Unknown item";

  const q = search.trim().toLowerCase();
  const filtered = !q
    ? purchases
    : purchases.filter((p: any) => vendorName(p.vendorId).toLowerCase().includes(q) || itemName(p.itemId).toLowerCase().includes(q));

  const statusBadge = (status: string) => (status === "paid" ? "Paid" : status === "partial" ? "Partially Paid" : "Due");

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{purchases.length} purchase{purchases.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("purchase")}><Plus size={16} /> New Purchase</PillButton>
      </div>
      {purchases.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vendor or item..."
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {purchases.length === 0 ? (
        <Card>
          <EmptyState
            text="Record what you pay suppliers — this is what keeps your item cost and profit numbers accurate."
            cta="New Purchase"
            onCta={() => openModal("purchase")}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card><p className="text-center text-sm text-ink/40">No purchases match your search.</p></Card>
      ) : (
        filtered.map((p: any) => (
          <Card key={p.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><PackagePlus size={18} /></div>
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{itemName(p.itemId)}</p>
                <p className="text-xs text-ink/40 truncate">{vendorName(p.vendorId)} · {fmtNum(p.qty)} @ {fmtMoney(p.rate, currency)} · {fmtDate(p.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="font-bold text-ink">{fmtMoney(p.amount, currency)}</p>
                <Badge status={statusBadge(p.paymentStatus)} />
              </div>
              <button onClick={() => removePurchase(p.id)} className="rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={16} /></button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
