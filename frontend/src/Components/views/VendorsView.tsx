import React, { useState } from "react";
import { Building2, ChevronDown, IndianRupee, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { fmtDate, fmtMoney } from "../../lib/format";
import { api } from "../../lib/api";

/* ---- Vendors ---- */

export function VendorsView({ vendors, purchases, currency, openModal, removeVendor }: any) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statements, setStatements] = useState<Record<string, any>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = !q
    ? vendors
    : vendors.filter((v: any) => (v.name || "").toLowerCase().includes(q) || (v.phone || "").toLowerCase().includes(q));

  const owedTo = (vendorId: string) =>
    (purchases || [])
      .filter((p: any) => String(p.vendorId) === String(vendorId))
      .reduce((s: number, p: any) => s + (Number(p.amount || 0) - Number(p.amountPaid || 0)), 0);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!statements[id]) {
      setLoadingId(id);
      try {
        const statement = await api.vendors.statement(id);
        setStatements((s) => ({ ...s, [id]: statement }));
      } catch {
        /* toast already shown by caller-level error handling if desired */
      } finally {
        setLoadingId(null);
      }
    }
  };

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("vendor")}><Plus size={16} /> New Vendor</PillButton>
      </div>
      {vendors.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {vendors.length === 0 ? (
        <Card><EmptyState text="Add your suppliers to start tracking what you owe them." cta="New Vendor" onCta={() => openModal("vendor")} /></Card>
      ) : filtered.length === 0 ? (
        <Card><p className="text-center text-sm text-ink/40">No vendors match your search.</p></Card>
      ) : (
        filtered.map((v: any) => {
          const owed = owedTo(v.id);
          const isOpen = expandedId === v.id;
          const statement = statements[v.id];
          return (
            <Card key={v.id} className="!p-0 overflow-hidden">
              <div className="flex items-center gap-3 justify-between p-4 cursor-pointer" onClick={() => toggleExpand(v.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-advance-50 text-advance-600"><Building2 size={18} /></div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{v.name}</p>
                    <p className="text-xs text-ink/40 truncate">{v.phone || "No phone"}{v.location ? ` · ${v.location}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-ink/40">You owe</p>
                    <p className={`font-bold ${owed > 0 ? "text-warn-600" : "text-good-600"}`}>{fmtMoney(owed, currency)}</p>
                  </div>
                  <ChevronDown size={16} className={`text-ink/30 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-line bg-paper/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink/50">Vendor statement</p>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openModal("vendorPayment", { vendorId: v.id, vendorName: v.name, amount: owed > 0 ? owed : undefined }); }}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <IndianRupee size={12} /> Record Payment
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeVendor(v.id); }}
                        className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {loadingId === v.id ? (
                    <p className="text-sm text-ink/40">Loading...</p>
                  ) : !statement || statement.rows.length === 0 ? (
                    <p className="text-sm text-ink/40">No transactions with this vendor yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {statement.rows.map((row: any, idx: number) => (
                        <li key={idx} className="flex items-center justify-between border-b border-line/70 pb-2 last:border-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-sm text-ink/80 truncate">{row.narration}</p>
                            <p className="text-xs text-ink/40">{fmtDate(row.date)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-semibold ${row.type === "credit" ? "text-warn-600" : "text-good-600"}`}>
                              {row.type === "credit" ? "+" : "-"}{fmtMoney(row.amount, currency)}
                            </p>
                            <p className="text-xs text-ink/40">Bal: {fmtMoney(row.balance, currency)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
