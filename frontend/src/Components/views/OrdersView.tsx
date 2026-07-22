import React, { useState } from "react";
import { PackageCheck, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { ITEM_CATEGORIES } from "../../lib/constants";
import { fmtDate, fmtNum } from "../../lib/format";

/* ---- Orders ---- */

export function OrdersView({ orders, items, openModal, markOrderReceived, removeOrder }: any) {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const itemName = (id: string) => items.find((it: any) => it.id === id)?.name || "Unknown item";
  const itemCategory = (id: string) => items.find((it: any) => it.id === id)?.category || "Others";
  const q = search.trim().toLowerCase();
  const categoryFiltered = orders
    .filter((o: any) => category === "All" || itemCategory(o.itemId) === category)
    .filter((o: any) => !q || itemName(o.itemId).toLowerCase().includes(q) || (o.notes || "").toLowerCase().includes(q));
  const pending = categoryFiltered.filter((o: any) => o.status === "Pending");
  const received = categoryFiltered.filter((o: any) => o.status === "Received");

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("order")}><Plus size={16} /> New Order</PillButton>
      </div>
      {orders.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders by item or note..."
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {["All", ...ITEM_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
        ))}
      </div>

      {orders.length === 0
        ? <Card><EmptyState text="Place orders to restock your inventory. Marking an order as Received will automatically update the item's stock." cta="New Order" onCta={() => openModal("order")} /></Card>
        : pending.length === 0 && received.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No orders match this category.</p></Card>
        : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-ink/40">Pending ({pending.length})</p>
                {pending.map((o: any) => (
                  <Card key={o.id} className="mb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{itemName(o.itemId)}</p>
                        <p className="text-xs text-ink/40 truncate">Qty: {fmtNum(o.qty)} · {fmtDate(o.date)}{o.notes ? ` · ${o.notes}` : ""}</p>
                      </div>
                      <Badge status="Pending" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => markOrderReceived(o.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-good-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.98]">
                        <PackageCheck size={13} /> Mark Received
                      </button>
                      <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {received.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-ink/40">Received ({received.length})</p>
                {received.map((o: any) => (
                  <Card key={o.id} className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{itemName(o.itemId)}</p>
                      <p className="text-xs text-ink/40 truncate">Qty: {fmtNum(o.qty)} · {fmtDate(o.date)}{o.notes ? ` · ${o.notes}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge status="Received" />
                      <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )
      }
    </div>
  );
}
