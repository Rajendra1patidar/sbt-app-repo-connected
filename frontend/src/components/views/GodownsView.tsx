import React from "react";
import { ArrowLeftRight, MapPin, Pencil, Plus, Star, Trash2, User as UserIcon, Warehouse } from "lucide-react";
import { Card, EmptyState, GhostButton, PillButton } from "../common/UIPrimitives";
import { GodownsMapCard } from "./GodownsMapCard";

/* ---- Godowns ---- */

export function GodownsView({ godowns, items, openModal, removeGodown, saveGodown, setDefaultGodown }: any) {
  const stockCountFor = (godownId: string) =>
    (items || []).filter((it: any) =>
      (it.stockByGodown || []).some((g: any) => String(g.godownId) === String(godownId) && (g.stock > 0 || g.stockKg > 0))
    ).length;

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
          return (
            <Card key={g.id} className="!p-0 overflow-hidden">
              <div className="flex items-start gap-3 justify-between p-4">
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
                    <p className="mt-1 text-xs text-ink/40">{itemCount} item{itemCount !== 1 ? "s" : ""} stocked here</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
              </div>
            </Card>
          );
        })}
        </>
      )}
    </div>
  );
}
