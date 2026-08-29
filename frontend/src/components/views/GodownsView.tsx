import React, { useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp, MapPin, Pencil, Plus, Star, Trash2, User as UserIcon, Warehouse } from "lucide-react";
import { Card, EmptyState, GhostButton, PillButton } from "../common/UIPrimitives";
import { fmtMoney, fmtNum } from "../../lib/format";
import { GodownsMapCard } from "./GodownsMapCard";

/* ---- Godowns ---- */

export function GodownsView({ godowns, items, openModal, removeGodown, saveGodown, setDefaultGodown, settings }: any) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllFor, setShowAllFor] = useState<string | null>(null);

  // Same cost-basis valuation the backend uses elsewhere (purchasePrice ×
  // qty on hand — kg for weight-tracked items, pieces otherwise), just
  // narrowed to what's sitting in one specific godown.
  const itemsAt = (godownId: string) =>
    (items || [])
      .map((it: any) => {
        const entry = (it.stockByGodown || []).find((g: any) => String(g.godownId) === String(godownId));
        if (!entry) return null;
        const qty = it.trackingMode === "weight" ? (entry.stockKg ?? 0) : (entry.stock ?? 0);
        if (qty <= 0) return null;
        return { id: it.id, name: it.name, unit: it.unit, qty, value: qty * (it.purchasePrice ?? 0) };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.value - a.value);

  const stockCountFor = (godownId: string) => itemsAt(godownId).length;
  const valueFor = (godownId: string) => itemsAt(godownId).reduce((sum: number, i: any) => sum + i.value, 0);
  const totalValue = (godowns || []).reduce((sum: number, g: any) => sum + valueFor(g.id), 0);

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{godowns.length} godown{godowns.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          {godowns.length > 1 && (
            <GhostButton onClick={() => openModal("stockTransfer")}>
              <ArrowLeftRight size={14} /> Transfer
            </GhostButton>
          )}
          <PillButton onClick={() => openModal("godown")}><Plus size={16} /> New Godown</PillButton>
        </div>
      </div>

      {godowns.length > 0 && (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-ink/40">Total value</p>
              <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(totalValue, settings?.currency)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink/40">Godowns</p>
              <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtNum(godowns.length)}</p>
            </div>
          </div>
        </Card>
      )}

      {godowns.length === 0 ? (
        <Card>
          <EmptyState
            text="Add your warehouses and storage locations to start tracking stock by location."
            cta="New Godown"
            onCta={() => openModal("godown")}
          />
        </Card>
      ) : (
        <>
          <GodownsMapCard godowns={godowns} />
        {godowns.map((g: any) => {
          const itemCount = stockCountFor(g.id);
          const value = valueFor(g.id);
          const isExpanded = expandedId === g.id;
          const breakdown = isExpanded ? itemsAt(g.id) : [];
          const showAll = showAllFor === g.id;
          const visibleBreakdown = showAll ? breakdown : breakdown.slice(0, 5);
          return (
            <Card key={g.id} className="!p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => { setExpandedId(isExpanded ? null : g.id); setShowAllFor(null); }}
                className="flex w-full items-start gap-3 justify-between p-4 text-left"
                disabled={itemCount === 0}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Warehouse size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-ink truncate">{g.name}</p>
                      {g.isDefault && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
                          <Star size={9} fill="currentColor" /> Default
                        </span>
                      )}
                    </div>
                    {g.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/40 truncate"><MapPin size={11} /> {g.location}</p>
                    )}
                    {g.manager && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/40 truncate"><UserIcon size={11} /> {g.manager}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="font-display text-base font-bold text-ink">{fmtMoney(value, settings?.currency)}</p>
                    <p className="text-xs text-ink/40">{itemCount} item{itemCount !== 1 ? "s" : ""}</p>
                  </div>
                  {itemCount > 0 && (isExpanded ? <ChevronUp size={16} className="text-ink/30" /> : <ChevronDown size={16} className="text-ink/30" />)}
                </div>
              </button>

              {isExpanded && breakdown.length > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <p className="mb-2 text-xs font-semibold text-ink/40">{showAll ? "All items" : "Top items by value"}</p>
                  <ul className="space-y-1.5">
                    {visibleBreakdown.map((it: any) => (
                      <li key={it.id} className="flex items-center justify-between text-sm">
                        <span className="min-w-0 truncate text-ink/80">{it.name}</span>
                        <span className="shrink-0 pl-2 font-mono text-xs text-ink/50">{fmtMoney(it.value, settings?.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  {!showAll && breakdown.length > 5 && (
                    <button onClick={() => setShowAllFor(g.id)} className="mt-2.5 w-full rounded-full border border-line py-2 text-xs font-semibold text-ink/60">
                      View all {breakdown.length} items
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-1 border-t border-line px-4 py-2">
                {!g.isDefault && (
                  <button onClick={() => setDefaultGodown(g.id)} title="Make default" className="rounded-full p-1.5 text-ink/30 hover:bg-paper hover:text-brand-500">
                    <Star size={15} />
                  </button>
                )}
                <button onClick={() => openModal("godown", { editingGodown: g })} title="Edit" className="rounded-full p-1.5 text-ink/30 hover:bg-paper hover:text-ink/60">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeGodown(g.id)} title="Archive" className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          );
        })}
        </>
      )}
    </div>
  );
}
