import React, { useEffect, useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, Lock, Plus } from "lucide-react";
import { Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { fmtDate, fmtMoney } from "../../lib/format";
import { api } from "../../lib/api";

/* ---- Financial Years ---- */
/*
 * Closing a year snapshots every ledger account's balance (plus total stock
 * value) as of that year's end date into openingBalances — this is what the
 * NEXT financial year reads as its starting point. It does not delete or lock
 * out old ledger entries; it just freezes a carry-forward snapshot.
 */

export function FinancialYearView({ currency }: any) {
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(3, 1); if (d > new Date()) d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setMonth(3, 1); d.setDate(d.getDate() - 1); if (d < new Date(startDate)) d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); });
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.financialYears.list();
      setYears(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load financial years");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? "" : t)), 3000); };

  const createYear = async () => {
    try {
      const doc = await api.financialYears.create({ startDate, endDate });
      setYears((c) => [doc, ...c]);
      setCreating(false);
      showToast("Financial year opened");
    } catch (err: any) {
      showToast(err?.message || "Failed to open financial year");
    }
  };

  const closeYear = async (id: string) => {
    setClosing(true);
    try {
      const doc = await api.financialYears.close(id);
      setYears((c) => c.map((y) => (y.id === id ? doc : y)));
      setConfirmCloseId(null);
      showToast("Financial year closed");
    } catch (err: any) {
      showToast(err?.message || "Failed to close financial year");
    } finally {
      setClosing(false);
    }
  };

  const confirmYear = years.find((y) => y.id === confirmCloseId);

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="border border-advance-100 bg-advance-50/40">
        <div className="flex items-start gap-2">
          <CalendarRange size={16} className="mt-0.5 shrink-0 text-advance-600" />
          <p className="text-xs text-advance-700">
            Closing a financial year snapshots your Funds, Receivable, Vendor Payable, Stock, and Capital balances as of the end date.
            It does not delete or hide any past ledger entries — it just gives the next year a starting point to carry forward from.
            Most businesses only need to do this once a year, or not at all if you're happy reading reports as one continuous history.
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/40">{years.length} financial year{years.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => setCreating(true)}><Plus size={16} /> Open Financial Year</PillButton>
      </div>

      {toast && <div className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white">{toast}</div>}

      {creating && (
        <Card className="border border-brand-100">
          <h3 className="mb-3 font-display text-base font-bold text-ink">Open a new financial year</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button onClick={() => setCreating(false)} className="flex-1 rounded-full border border-line py-2.5 text-sm font-semibold text-ink/70">Cancel</button>
            <button onClick={createYear} className="flex-1 rounded-full bg-brand-600 py-2.5 text-sm font-semibold text-white">Open</button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-center text-sm text-ink/40">Loading...</p></Card>
      ) : error ? (
        <Card><p className="text-center text-sm text-bad-600">{error}</p></Card>
      ) : years.length === 0 ? (
        <Card><EmptyState text="No financial years opened yet — this is optional, and only useful once you're ready to lock in a year-end snapshot." cta="Open Financial Year" onCta={() => setCreating(true)} /></Card>
      ) : (
        years.map((y) => (
          <Card key={y.id} className={y.closed ? "border border-good-100 bg-good-50/30" : ""}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-ink">{fmtDate(y.startDate)} — {fmtDate(y.endDate)}</p>
                {y.closed ? (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-good-700"><CheckCircle2 size={13} /> Closed {y.closedAt ? `on ${fmtDate(y.closedAt.slice(0, 10))}` : ""}</p>
                ) : (
                  <p className="mt-0.5 text-xs font-semibold text-warn-600">Open</p>
                )}
              </div>
              {!y.closed && (
                <button onClick={() => setConfirmCloseId(y.id)} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                  <Lock size={12} /> Close Year
                </button>
              )}
            </div>
            {y.closed && y.openingBalances && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                <div className="flex justify-between"><span className="text-ink/50">Funds</span><span className="font-semibold text-ink">{fmtMoney(y.openingBalances.funds, currency)}</span></div>
                <div className="flex justify-between"><span className="text-ink/50">Receivable</span><span className="font-semibold text-ink">{fmtMoney(y.openingBalances.accountsReceivable, currency)}</span></div>
                <div className="flex justify-between"><span className="text-ink/50">Vendor Payable</span><span className="font-semibold text-ink">{fmtMoney(y.openingBalances.vendorPayable, currency)}</span></div>
                <div className="flex justify-between"><span className="text-ink/50">Stock Value</span><span className="font-semibold text-ink">{fmtMoney(y.openingBalances.stockValue, currency)}</span></div>
                <div className="col-span-2 flex justify-between"><span className="text-ink/50">Capital (incl. retained profit)</span><span className="font-semibold text-ink">{fmtMoney(y.openingBalances.capital, currency)}</span></div>
              </div>
            )}
          </Card>
        ))
      )}

      {confirmYear && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-bad-600">
              <AlertTriangle size={18} />
              <h3 className="font-display text-lg font-bold text-ink">Close this financial year?</h3>
            </div>
            <p className="text-sm text-ink/60">
              This snapshots your balances as of {fmtDate(confirmYear.endDate)} for carrying forward. It does not delete anything and can't easily be undone. Are you sure?
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirmCloseId(null)} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
              <button disabled={closing} onClick={() => closeYear(confirmYear.id)} className="flex-1 rounded-full bg-bad-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
                {closing ? "Closing..." : "Close Year"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
