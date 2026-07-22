import React, { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Phone, Search, Send, Star } from "lucide-react";
import { Card, GhostButton } from "../common/UIPrimitives";
import { ContractorSharePopup } from "../modals/ContractorSharePopup";
import { FieldModal } from "../modals/FieldModal";
import { waLink } from "../../lib/contactLinks";
import { buildContractorListMessage, buildContractorMessage, capForWhatsApp, printContractorReport } from "../../lib/contractorMessages";
import { fmtDate, fmtMoney, fmtNum } from "../../lib/format";
import { PeriodPreset, getPeriodRange } from "../../lib/period";
import { estimatePoints, isCementItemName, isSariaItemName, sariaToPoints } from "../../lib/points";

/* ---- To-Do Tracking (inventory focus, replaces Time Tracking) ---- */

export function ContractorScorecardView({ estimates, items, currency, contractors, onSavePhone, showToast }: any) {
  const [openContractor, setOpenContractor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sharePopup, setSharePopup] = useState<{ scope: "single" | "all"; name?: string } | null>(null);
  const [editingPhoneFor, setEditingPhoneFor] = useState<string | null>(null);

  const phoneByName: Record<string, string> = {};
  (contractors || []).forEach((c: any) => { phoneByName[c.name.trim().toLowerCase()] = c.phone || ""; });
  const phoneFor = (name: string) => phoneByName[name.trim().toLowerCase()] || "";

  const range = getPeriodRange(preset, anchor, customFrom, customTo);
  const shiftPeriod = (dir: number) => {
    setAnchor((a) => {
      const next = new Date(a);
      if (preset === "week") next.setDate(next.getDate() + dir * 7);
      else if (preset === "year") next.setFullYear(next.getFullYear() + dir);
      else next.setMonth(next.getMonth() + dir);
      return next;
    });
  };

  const filteredEstimates = (estimates || []).filter((est: any) => {
    if (!est.date) return false;
    if (!range.from || !range.to) return true;
    const d = new Date(est.date);
    return d >= range.from && d <= range.to;
  });

  const byContractor: Record<string, {
    total: number; count: number; cementQty: number; sariaQty: number;
    itemMap: Record<string, { name: string; qty: number; amount: number }>;
    estimatesList: { id: string; number: string; date: string; total: number; cementQty: number; sariaQty: number; points: number }[];
  }> = {};
  // Maps lowercased name -> the canonical (first-seen) display casing, so
  // "Ramesh" and "ramesh" typed on different estimates land in the same
  // bucket instead of fragmenting into two contractors with split points —
  // matching the case-insensitive nameKey lookup used for phone numbers.
  const canonicalCaseByLower: Record<string, string> = {};
  filteredEstimates.forEach((est: any) => {
    const raw = (est.contractorName || "").trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (!canonicalCaseByLower[lower]) canonicalCaseByLower[lower] = raw;
    const name = canonicalCaseByLower[lower];
    if (!byContractor[name]) byContractor[name] = { total: 0, count: 0, cementQty: 0, sariaQty: 0, itemMap: {}, estimatesList: [] };
    byContractor[name].total += Number(est.total || 0);
    byContractor[name].count += 1;
    (est.lines || []).forEach((ln: any) => {
      const it = items.find((i: any) => i.id === ln.itemId);
      const itemName = it?.name || "Unknown item";
      const qty = Number(ln.qty || 0);
      const amount = qty * Number(ln.rate ?? it?.price ?? 0);
      if (!byContractor[name].itemMap[itemName]) byContractor[name].itemMap[itemName] = { name: itemName, qty: 0, amount: 0 };
      byContractor[name].itemMap[itemName].qty += qty;
      byContractor[name].itemMap[itemName].amount += amount;
      const category = it?.category || "";
      const isCement = category ? category === "Cement" : isCementItemName(itemName);
      const isSaria = category ? category === "Saria" : isSariaItemName(itemName);
      if (isCement) byContractor[name].cementQty += qty;
      if (isSaria) byContractor[name].sariaQty += qty;
    });
    const estPts = estimatePoints(est, items);
    byContractor[name].estimatesList.push({
      id: est.id, number: est.number || "", date: est.date || "",
      total: Number(est.total || 0), cementQty: estPts.cementQty, sariaQty: estPts.sariaQty, points: estPts.points,
    });
  });
  Object.values(byContractor).forEach((c) => c.estimatesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

  const q = search.trim().toLowerCase();
  const contractorNames = Object.keys(byContractor)
    .filter((name) => !q || name.toLowerCase().includes(q))
    .sort((a, b) => byContractor[b].total - byContractor[a].total);

  const overallPoints = Object.values(byContractor).reduce((s, c) => s + c.cementQty + sariaToPoints(c.sariaQty), 0);
  const overallCementQty = Object.values(byContractor).reduce((s, c) => s + c.cementQty, 0);
  const overallSariaQty = Object.values(byContractor).reduce((s, c) => s + c.sariaQty, 0);

  const handleShareChoice = (mode: "summary" | "full", channel: "whatsapp" | "print") => {
    if (!sharePopup) return;
    if (sharePopup.scope === "single") {
      const name = sharePopup.name!;
      const c = byContractor[name];
      if (channel === "whatsapp") {
        if (!phoneFor(name)) {
          showToast?.("No phone saved for this contractor — add one first");
          setSharePopup(null);
          return;
        }
        window.open(waLink(phoneFor(name), capForWhatsApp(buildContractorMessage(name, c, currency, range.label, mode))), "_blank");
      } else {
        printContractorReport([{ name, c }], range.label, mode, currency, `${name} — Contractor Report`);
      }
    } else {
      if (channel === "whatsapp") {
        window.open(waLink("", capForWhatsApp(buildContractorListMessage(contractorNames, byContractor, currency, range.label, mode))), "_blank");
      } else {
        printContractorReport(contractorNames.map((name) => ({ name, c: byContractor[name] })), range.label, mode, currency, "Contractor Points Report");
      }
    }
    setSharePopup(null);
  };

  return (
    <div className="space-y-3 px-5 pb-28">
      {/* Period filter */}
      <div className="mt-1 rounded-card border border-line bg-white p-3">
        <div className="flex gap-1.5">
          {(["week", "month", "year", "custom"] as PeriodPreset[]).map((p) => (
            <button key={p} onClick={() => setPreset(p)}
              className={`flex-1 rounded-full py-1.5 text-xs font-semibold capitalize ${preset === p ? "bg-brand-500 text-white" : "bg-paper text-ink/50"}`}>
              {p}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="mt-2.5 flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line px-2.5 py-2 text-xs" />
            <span className="text-ink/30">–</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line px-2.5 py-2 text-xs" />
          </div>
        ) : (
          <div className="mt-2.5 flex items-center justify-between">
            <button onClick={() => shiftPeriod(-1)} className="rounded-full p-1.5 hover:bg-paper"><ChevronLeft size={16} className="text-ink/50" /></button>
            <span className="text-sm font-semibold text-ink">{range.label}</span>
            <button onClick={() => shiftPeriod(1)} className="rounded-full p-1.5 hover:bg-paper"><ChevronRight size={16} className="text-ink/50" /></button>
          </div>
        )}
      </div>

      {overallPoints > 0 && (
        <div className="relative overflow-hidden rounded-card bg-brand-700 p-5 text-white">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/40" />
          <div className="relative">
            <p className="text-xs font-semibold text-white/70">Total contractor points · {range.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold">{fmtNum(overallPoints)}</p>
            <p className="mt-1 text-xs font-semibold text-white/70">1 cement bag = 1 point · 10kg saria = 1 point</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><p className="text-[11px] text-white/60">Cement</p><p className="font-mono text-sm font-semibold">{fmtNum(overallCementQty)} bags</p></div>
              <div><p className="text-[11px] text-white/60">Saria</p><p className="font-mono text-sm font-semibold">{fmtNum(overallSariaQty)} kg</p></div>
            </div>
          </div>
        </div>
      )}

      {Object.keys(byContractor).length > 0 && (
        <>
          <div className="relative pt-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contractors..."
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          <GhostButton className="w-full justify-center" onClick={() => setSharePopup({ scope: "all" })}><Send size={14} /> Share or print this list</GhostButton>
        </>
      )}

      {contractorNames.length === 0 ? (
        <Card><p className="text-sm text-ink/40">{q ? "No contractors match your search." : "No estimates with a contractor name fall in this period."}</p></Card>
      ) : contractorNames.map((name) => {
        const c = byContractor[name];
        const itemRows = Object.values(c.itemMap).sort((a, b) => b.amount - a.amount);
        const points = c.cementQty + sariaToPoints(c.sariaQty);
        const isOpen = openContractor === name;
        return (
          <Card key={name}>
            <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpenContractor(isOpen ? null : name)}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">{name}</p>
                <p className="mt-0.5 text-xs text-ink/40 truncate">{c.count} estimate{c.count !== 1 ? "s" : ""} · {fmtMoney(c.total, currency)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {points > 0 && (
                  <span className="flex items-center gap-1 rounded-pill bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
                    <Star size={13} /> {fmtNum(points)}
                  </span>
                )}
                {isOpen ? <ChevronUp size={18} className="text-ink/40" /> : <ChevronDown size={18} className="text-ink/40" />}
              </div>
            </button>
            {isOpen && (
              <div className="mt-3 border-t border-line pt-3">
                <button onClick={() => setEditingPhoneFor(name)} className="mb-3 flex w-full items-center justify-between rounded-xl bg-paper px-3 py-2 text-left">
                  <span className="flex items-center gap-1.5 text-xs text-ink/60">
                    <Phone size={13} className="text-ink/40" />
                    {phoneFor(name) || "No phone number saved"}
                  </span>
                  <span className="text-xs font-semibold text-brand-600">{phoneFor(name) ? "Edit" : "Add"}</span>
                </button>
                {(c.cementQty > 0 || c.sariaQty > 0) ? (
                  <div className="mb-3 space-y-1.5 rounded-xl bg-brand-50/60 px-3 py-2.5">
                    {c.cementQty > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/70">Cement — {fmtNum(c.cementQty)} bag{c.cementQty !== 1 ? "s" : ""}</span>
                        <span className="font-semibold text-ink">{fmtNum(c.cementQty)} pts</span>
                      </div>
                    )}
                    {c.sariaQty > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/70">Saria — {fmtNum(c.sariaQty)} kg</span>
                        <span className="font-semibold text-ink">{fmtNum(sariaToPoints(c.sariaQty))} pts</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-brand-200 pt-1.5 text-sm">
                      <span className="font-bold text-brand-700">Total points</span>
                      <span className="font-bold text-brand-700">{fmtNum(points)} pts</span>
                    </div>
                  </div>
                ) : (
                  <p className="mb-3 text-sm text-ink/40">No cement or saria on this contractor's estimates in this period.</p>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-ink/40">Estimates in this period</p>
                  {c.estimatesList.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{e.number || "Estimate"}</p>
                        <p className="text-xs text-ink/40">{fmtDate(e.date)} · {fmtMoney(e.total, currency)}</p>
                      </div>
                      {e.points > 0 ? (
                        <span className="shrink-0 text-xs font-bold text-brand-700">{fmtNum(e.points)} pts</span>
                      ) : (
                        <span className="shrink-0 text-xs text-ink/30">0 pts</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-line pt-3">
                  <GhostButton className="w-full justify-center" onClick={() => setSharePopup({ scope: "single", name })}><Send size={14} /> Share or print</GhostButton>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {editingPhoneFor && (
        <FieldModal
          title={`${editingPhoneFor} — phone number`}
          fields={[{ key: "phone", label: "Phone number", type: "tel", placeholder: "e.g. 9876543210" }]}
          initial={{ phone: phoneFor(editingPhoneFor) }}
          onClose={() => setEditingPhoneFor(null)}
          onSave={(v: any) => { onSavePhone(editingPhoneFor, v.phone || ""); setEditingPhoneFor(null); }}
        />
      )}

      {sharePopup && (
        <ContractorSharePopup
          title={sharePopup.scope === "single" ? sharePopup.name : `${contractorNames.length} contractors`}
          onFormat={handleShareChoice}
          onCancel={() => setSharePopup(null)}
        />
      )}
    </div>
  );
}
