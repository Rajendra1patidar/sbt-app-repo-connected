import React, { useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { Badge } from "../common/UIPrimitives";
import { fmtMoney, fmtNum } from "../../lib/format";

/* ---- Global Search ---- */

export function GlobalSearchOverlay({ customers, items, estimates, currency, onSelectCustomer, onSelectItem, onSelectEstimate, onClose }: any) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const matchedCustomers = query ? customers.filter((c: any) =>
    c.name.toLowerCase().includes(query) || (c.location || "").toLowerCase().includes(query) || (c.phone || "").includes(query)
  ).slice(0, 6) : [];

  const matchedItems = query ? items.filter((it: any) => it.name.toLowerCase().includes(query)).slice(0, 6) : [];

  const matchedEstimates = query ? estimates.filter((e: any) => {
    const cust = customers.find((c: any) => c.id === e.customerId);
    return (e.number || "").toLowerCase().includes(query)
      || (cust?.name || "").toLowerCase().includes(query)
      || (cust?.location || "").toLowerCase().includes(query)
      || (e.notes || "").toLowerCase().includes(query);
  }).slice(0, 6) : [];

  const noResults = query && matchedCustomers.length === 0 && matchedItems.length === 0 && matchedEstimates.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-ink/40">
      <div className="mx-auto max-w-lg bg-white h-full sm:h-auto sm:mt-16 sm:rounded-3xl sm:shadow-xl overflow-y-auto">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-white p-4">
          <Search size={18} className="text-ink/40 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, items, estimates..."
            className="flex-1 text-sm focus:outline-none"
          />
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-5">
          {!query && <p className="text-sm text-ink/40 text-center py-6">Start typing to search across customers, items and estimates.</p>}

          {matchedCustomers.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/40">Customers</p>
              <div className="space-y-1.5">
                {matchedCustomers.map((c: any) => (
                  <button key={c.id} onClick={() => onSelectCustomer(c.id)} className="w-full flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      {c.location && <p className="text-xs text-ink/40">{c.location}</p>}
                    </div>
                    <ArrowRight size={14} className="text-ink/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedItems.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/40">Items</p>
              <div className="space-y-1.5">
                {matchedItems.map((it: any) => (
                  <button key={it.id} onClick={() => onSelectItem(it.id)} className="w-full flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{it.name}</p>
                      <p className="text-xs text-ink/40">Stock: {fmtNum(it.stock ?? 0)}</p>
                    </div>
                    <ArrowRight size={14} className="text-ink/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedEstimates.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/40">Estimates</p>
              <div className="space-y-1.5">
                {matchedEstimates.map((e: any) => {
                  const cust = customers.find((c: any) => c.id === e.customerId);
                  return (
                    <button key={e.id} onClick={() => onSelectEstimate(e)} className="w-full flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-left">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{e.number} · {cust?.name || "Unknown"}</p>
                        <p className="text-xs text-ink/40">{fmtMoney(e.total, currency)}</p>
                      </div>
                      <Badge status={e.status} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {noResults && <p className="text-sm text-ink/40 text-center py-6">No matches for "{q}".</p>}
        </div>
      </div>
    </div>
  );
}
