import React, { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { GhostButton } from "../common/UIPrimitives";
import { FieldModal } from "./FieldModal";
import { fmtDate, fmtNum } from "../../lib/format";
import { endOfMonth, endOfQuarter, startOfMonth, startOfQuarter } from "../../lib/period";
import { ITEM_CATEGORIES } from "../../lib/constants";

import { IconButton } from "../ui/kit";
/* ---- Points settings: manage category base rates + brand bonus/scheme rules ----
 * A rule with no brand set is a category's base rate. A rule with a brand
 * set is a bonus/penalty added on top of that category's base rate, for
 * that one brand only. Either kind can be permanent (no dates) or a dated
 * scheme that only applies within its window. */

const toDateInput = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function presetRange(kind: "thisMonth" | "nextMonth" | "thisQuarter") {
  const now = new Date();
  if (kind === "nextMonth") {
    const anchor = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { startDate: toDateInput(startOfMonth(anchor)), endDate: toDateInput(endOfMonth(anchor)) };
  }
  if (kind === "thisQuarter") return { startDate: toDateInput(startOfQuarter(now)), endDate: toDateInput(endOfQuarter(now)) };
  return { startDate: toDateInput(startOfMonth(now)), endDate: toDateInput(endOfMonth(now)) };
}

function describeRule(r: any) {
  const scope = r.brand ? `${r.category} / ${r.brand}` : `${r.category} (base rate)`;
  const sign = r.brand && Number(r.pointsPerUnit) >= 0 ? "+" : "";
  const rate = `${sign}${fmtNum(r.pointsPerUnit)} pt${Number(r.pointsPerUnit) === 1 ? "" : "s"}/unit`;
  const window = r.startDate && r.endDate ? `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}` : "Always";
  return { scope, rate, window };
}

export function ScoreRulesModal({ scoreRules, items, onSave, onRemove, onClose }: any) {
  const [editing, setEditing] = useState<any | null>(null); // rule being edited, or {} for a new one
  const [formSeed, setFormSeed] = useState<any>({});

  const brandOptions = Array.from(new Set((items || []).map((i: any) => i.brand).filter(Boolean))) as string[];

  const rules = [...(scoreRules || [])].sort((a: any, b: any) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (!!a.brand !== !!b.brand) return a.brand ? 1 : -1;
    return (a.brand || "").localeCompare(b.brand || "");
  });

  const openAdd = (seed: any = {}) => { setFormSeed(seed); setEditing({}); };
  const openEdit = (r: any) => {
    setFormSeed({
      category: r.category,
      appliesTo: r.brand ? "brand" : "category",
      brand: r.brand || "",
      pointsPerUnit: String(r.pointsPerUnit),
      scheduleType: r.startDate ? "scheme" : "always",
      label: r.label || "",
      startDate: toDateInput(r.startDate),
      endDate: toDateInput(r.endDate),
    });
    setEditing(r);
  };

  const handleFormSave = (v: any) => {
    const isScheme = v.scheduleType === "scheme";
    onSave({
      id: editing?.id,
      category: v.category,
      brand: v.appliesTo === "brand" ? (v.brand || "").trim() : "",
      label: isScheme ? (v.label || "").trim() : "",
      pointsPerUnit: Number(v.pointsPerUnit),
      startDate: isScheme ? v.startDate : null,
      endDate: isScheme ? v.endDate : null,
    });
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--scrim)] p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-sheet sm:rounded-sheet bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-sheet">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-semibold text-ink">Points settings</h3>
          <IconButton label="Close" className="-mr-1.5" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <p className="mb-4 text-xs text-mute">
          Set a category's base points-per-unit, or add a bonus/penalty for a specific brand. Any rule can be permanent or limited to a scheme window — a scheme always wins over the permanent rate while it's active. New rules only affect estimates from today onward.
        </p>

        <div className="mb-4 flex flex-wrap gap-1.5">
          <GhostButton onClick={() => openAdd({ scheduleType: "always" })}><Plus size={14} /> Add rule</GhostButton>
          <button onClick={() => openAdd({ scheduleType: "scheme", ...presetRange("thisMonth") })}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-mute hover:bg-paper">This month scheme</button>
          <button onClick={() => openAdd({ scheduleType: "scheme", ...presetRange("nextMonth") })}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-mute hover:bg-paper">Next month scheme</button>
          <button onClick={() => openAdd({ scheduleType: "scheme", ...presetRange("thisQuarter") })}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-mute hover:bg-paper">This quarter scheme</button>
        </div>

        {rules.length === 0 ? (
          <p className="rounded-xl bg-paper px-3 py-4 text-center text-sm text-faint">
            No custom rules yet — Cement defaults to 1 pt/bag and Saria to 0.1 pt/kg.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((r: any) => {
              const d = describeRule(r);
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{d.scope}</p>
                    <p className="text-xs text-mute">{d.rate} · {d.window}{r.label ? ` · ${r.label}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label="Edit rule" onClick={() => openEdit(r)}><Pencil size={14} className="text-mute" /></IconButton>
                    <IconButton label="Delete rule" tone="danger" onClick={() => onRemove(r.id)}><Trash2 size={14} className="text-bad-600" /></IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <FieldModal
          title={editing.id ? "Edit points rule" : "Add points rule"}
          fields={[
            { key: "category", label: "Category", type: "select", required: true, options: ITEM_CATEGORIES.map((c: string) => ({ value: c, label: c })) },
            { key: "appliesTo", label: "Applies to", type: "toggle", options: [{ value: "category", label: "Whole category" }, { value: "brand", label: "Specific brand" }] },
            { key: "brand", label: "Brand", type: "datalist", options: brandOptions, placeholder: "e.g. Ultratech", showIf: (v: any) => v.appliesTo === "brand", required: true },
            { key: "pointsPerUnit", label: "Points per unit", type: "number", required: true, placeholder: "e.g. 1.5", helpText: "The exact points value per bag/kg — not a multiplier. For a brand rule this is added on top of the category's base rate." },
            { key: "scheduleType", label: "When", type: "toggle", options: [{ value: "always", label: "Always" }, { value: "scheme", label: "Time-limited scheme" }] },
            { key: "label", label: "Scheme name (optional)", type: "text", placeholder: "e.g. October slow-season boost", showIf: (v: any) => v.scheduleType === "scheme" },
            { key: "startDate", label: "From", type: "date", required: true, showIf: (v: any) => v.scheduleType === "scheme" },
            { key: "endDate", label: "To", type: "date", required: true, showIf: (v: any) => v.scheduleType === "scheme" },
          ]}
          initial={{ appliesTo: "category", scheduleType: "always", ...formSeed }}
          onClose={() => setEditing(null)}
          onSave={handleFormSave}
        />
      )}
    </div>
  );
}
