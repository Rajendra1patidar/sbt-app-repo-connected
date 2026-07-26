import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "../common/UIPrimitives";
import { SearchableSelect } from "../common/SearchableSelect";
import { LABOUR_RATES, SARIA_KG_PER_BUNDLE } from "../../lib/constants";
import { fmtDate, fmtMoney, today } from "../../lib/format";

export function LabourTrackingView({ sessions, knownWorkers, onSave, onRemove, currency, estimates, items, customers }: any) {
  const todayStr = today();
  const [workerCount, setWorkerCount] = useState(1);
  const [names, setNames] = useState<string[]>([""]);
  const [customerId, setCustomerId] = useState("");
  const [cementQty, setCementQty] = useState("");
  const [sariaQty, setSariaQty] = useState("");
  const [baluQty, setBaluQty] = useState("");
  const [otherIncluded, setOtherIncluded] = useState(false);
  const [otherAmount, setOtherAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [importEstimateId, setImportEstimateId] = useState("");

  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(todayStr);

  const itemById = (id: string) => (items || []).find((it: any) => it.id === id);
  const customerById = (id: string) => (customers || []).find((c: any) => c.id === id);
  const customerOptions = (customers || []).map((c: any) => ({ value: c.id, label: c.name }));

  const importedEstimateNumbers = new Set(
    (sessions || [])
      .map((s: any) => (s.note || "").match(/From estimate (\S+)/)?.[1])
      .filter(Boolean)
  );

  const sixtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().slice(0, 10); })();

  // only recent (last 60 days) estimates that carry cement/saria lines and haven't
  // already been pulled into a session are worth offering here
  const estimateOptions = (estimates || [])
    .filter((doc: any) => (doc.date || "") >= sixtyDaysAgo)
    .filter((doc: any) => !importedEstimateNumbers.has(doc.number))
    .filter((doc: any) => (doc.lines || []).some((ln: any) => {
      const cat = itemById(ln.itemId)?.category;
      return cat === "Cement" || cat === "Saria";
    }))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 60)
    .map((doc: any) => ({
      value: doc.id,
      label: `${doc.number}${doc.contractorName ? " · " + doc.contractorName : ""} · ${fmtDate(doc.date)}`,
    }));

  // pulls cement/saria quantities off the picked estimate's lines (matched by item
  // category) into this form. Saria is entered in kg on estimates but paid per bundle
  // here, so it's converted (~81kg/bundle). Balu isn't a tracked item category, so it's
  // left for manual entry either way.
  const importFromEstimate = (estimateId: string) => {
    setImportEstimateId(estimateId);
    const doc = (estimates || []).find((d: any) => d.id === estimateId);
    if (!doc) return;
    if (doc.customerId) setCustomerId(doc.customerId);
    let cementSum = 0;
    let sariaKg = 0;
    (doc.lines || []).forEach((ln: any) => {
      const cat = itemById(ln.itemId)?.category;
      if (cat === "Cement") cementSum += Number(ln.qty || 0);
      if (cat === "Saria") sariaKg += Number(ln.qty || 0);
    });
    const sariaBundles = sariaKg ? Math.round((sariaKg / SARIA_KG_PER_BUNDLE) * 100) / 100 : 0;
    if (cementSum) setCementQty(String(cementSum));
    if (sariaBundles) setSariaQty(String(sariaBundles));
    const noteParts = [`From estimate ${doc.number}`];
    if (sariaKg) noteParts.push(`Saria ${sariaKg}kg ≈ ${sariaBundles} bundles`);
    setNote(noteParts.join(" · "));
  };

  const setWorkerCountSafe = (n: number) => {
    const clamped = Math.max(1, Math.min(20, n));
    setWorkerCount(clamped);
    setNames((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push("");
      return next.slice(0, clamped);
    });
  };

  const cementAmt = Number(cementQty || 0) * LABOUR_RATES.cement;
  const sariaAmt = Number(sariaQty || 0) * LABOUR_RATES.saria;
  const baluAmt = Number(baluQty || 0) * LABOUR_RATES.balu;
  const otherAmt = otherIncluded ? Number(otherAmount || 0) : 0;
  const sessionTotal = cementAmt + sariaAmt + baluAmt + otherAmt;

  const canSave = names.some((n) => n.trim()) && sessionTotal > 0;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        date: todayStr, time: new Date().toISOString(),
        customerId: customerId || undefined,
        workers: names.map((n) => n.trim()).filter(Boolean),
        cementQty: Number(cementQty || 0), sariaQty: Number(sariaQty || 0), baluQty: Number(baluQty || 0),
        otherIncluded, otherAmount: otherIncluded ? Number(otherAmount || 0) : 0,
        total: sessionTotal,
        note: note.trim(),
      });
      setNames((prev) => prev.map(() => "")); setCustomerId(""); setCementQty(""); setSariaQty(""); setBaluQty(""); setOtherIncluded(false); setOtherAmount(""); setNote(""); setImportEstimateId("");
    } finally { setSaving(false); }
  };

  const todaySessions = sessions.filter((s: any) => s.date === todayStr).sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const todayTotal = todaySessions.reduce((s: number, x: any) => s + Number(x.total || 0), 0);

  const rangeSessions = sessions.filter((s: any) => s.date >= fromDate && s.date <= toDate);
  const byDay: Record<string, number> = {};
  rangeSessions.forEach((s: any) => { byDay[s.date] = (byDay[s.date] || 0) + Number(s.total || 0); });
  const dayRows = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">Log a work session</h3>

        {estimateOptions.length > 0 && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-ink/50">Pull materials from a recent estimate (optional)</label>
            <SearchableSelect
              options={estimateOptions}
              value={importEstimateId}
              onChange={importFromEstimate}
              placeholder="Select an estimate…"
            />
            {importEstimateId && (
              <button type="button" onClick={() => setImportEstimateId("")} className="mt-1 text-xs font-semibold text-ink/40">
                Clear selection
              </button>
            )}
          </div>
        )}

        <label className="mb-1 block text-xs font-semibold text-ink/50">Customer (optional)</label>
        <div className="mb-4">
          <SearchableSelect
            options={customerOptions}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Which customer's job is this for…"
          />
        </div>

        <label className="mb-1 block text-xs font-semibold text-ink/50">Number of workers</label>
        <div className="mb-3 flex items-center gap-3">
          <button onClick={() => setWorkerCountSafe(workerCount - 1)} className="h-8 w-8 rounded-lg border border-line bg-paper font-display text-lg font-bold text-ink/70">−</button>
          <span className="w-6 text-center font-display text-base font-bold text-ink">{workerCount}</span>
          <button onClick={() => setWorkerCountSafe(workerCount + 1)} className="h-8 w-8 rounded-lg border border-line bg-paper font-display text-lg font-bold text-ink/70">+</button>
        </div>

        <datalist id="labour-worker-names">
          {(knownWorkers || []).map((n: string) => <option key={n} value={n} />)}
        </datalist>
        <div className="mb-4 space-y-2">
          {names.map((n, i) => (
            <input key={i} list="labour-worker-names" value={n} onChange={(e) => setNames((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))}
              placeholder={`Worker ${i + 1} name`} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
          ))}
        </div>

        <label className="mb-2 block text-xs font-semibold text-ink/50">Materials moved (shared by the group)</label>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-ink/80">Cement</span>
          <span className="w-16 text-xs text-ink/40">₹{LABOUR_RATES.cement}/unit</span>
          <input type="number" min="0" value={cementQty} onChange={(e) => setCementQty(e.target.value)} className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(cementAmt, currency)}</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-ink/80">Saria</span>
          <span className="w-16 text-xs text-ink/40">₹{LABOUR_RATES.saria}/bundle</span>
          <input type="number" min="0" value={sariaQty} onChange={(e) => setSariaQty(e.target.value)} className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(sariaAmt, currency)}</span>
        </div>
        <p className="-mt-1.5 mb-3 pl-[4.75rem] text-[10px] text-ink/35">Bundles, not kg — 1 bundle ≈ {SARIA_KG_PER_BUNDLE}kg</p>
        <div className="mb-3 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-ink/80">Balu</span>
          <span className="w-16 text-xs text-ink/40">₹{LABOUR_RATES.balu}/unit</span>
          <input type="number" min="0" value={baluQty} onChange={(e) => setBaluQty(e.target.value)} className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(baluAmt, currency)}</span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink/50">Include "Other" work?</span>
          <button type="button" onClick={() => setOtherIncluded((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${otherIncluded ? "bg-warn-500" : "bg-paper"}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${otherIncluded ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {otherIncluded && (
          <div className="mb-3 flex items-center gap-2">
            <span className="w-16 text-sm font-semibold text-ink/80">Other</span>
            <span className="w-16 text-xs text-ink/40">your rate</span>
            <input type="number" min="0" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="₹" className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
            <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(otherAmt, currency)}</span>
          </div>
        )}

        <label className="mb-1 block text-xs font-semibold text-ink/50">Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add any notes about this session..." className="mb-3 w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />

        <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-brand-700">This session</span>
          <span className="font-display text-lg font-bold text-brand-700">{fmtMoney(sessionTotal, currency)}</span>
        </div>
        <button disabled={!canSave || saving} onClick={save} className="mt-3 w-full rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "Saving…" : "+ Save session"}
        </button>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-ink">Today's sessions</h3>
          <span className="text-xs font-semibold text-ink/40">{todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""}</span>
        </div>
        {todaySessions.length === 0 ? (
          <p className="text-sm text-ink/40">No sessions logged yet today.</p>
        ) : (
          <div>
            {todaySessions.map((s: any) => (
              <div key={s.id} className="flex items-start justify-between border-b border-line py-2.5 last:border-none">
                <div className="flex gap-3">
                  <span className="w-16 shrink-0 text-xs font-bold text-ink/40">{new Date(s.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{(s.workers || []).join(", ") || "—"}</p>
                    {s.customerId && <p className="text-xs font-semibold text-brand-600">{customerById(s.customerId)?.name || "Unknown customer"}</p>}
                    {s.note && <p className="text-xs italic text-ink/60">{s.note}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.cementQty > 0 && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Cement {fmtMoney(s.cementQty * LABOUR_RATES.cement, currency)}</span>}
                      {s.sariaQty > 0 && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Saria {fmtMoney(s.sariaQty * LABOUR_RATES.saria, currency)}</span>}
                      {s.baluQty > 0 && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Balu {fmtMoney(s.baluQty * LABOUR_RATES.balu, currency)}</span>}
                      {s.otherIncluded && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Other {fmtMoney(s.otherAmount, currency)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink">{fmtMoney(s.total, currency)}</span>
                  <button onClick={() => onRemove(s.id)} className="rounded-full p-1 text-bad-400 hover:bg-bad-50"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between rounded-xl bg-good-50 px-4 py-3">
              <span className="text-sm font-semibold text-good-700">Today's total ({todaySessions.length})</span>
              <span className="font-display text-base font-bold text-good-700">{fmtMoney(todayTotal, currency)}</span>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">History</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-ink/50">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          <label className="text-xs font-semibold text-ink/50">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
        </div>
        {dayRows.length === 0 ? <p className="text-sm text-ink/40">No sessions in this range.</p> : (
          <div>
            {dayRows.map((d) => (
              <div key={d} className="flex items-center justify-between border-b border-line py-2 last:border-none">
                <span className="text-sm text-ink/70">{fmtDate(d)}</span>
                <span className="text-sm font-bold text-ink">{fmtMoney(byDay[d], currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
