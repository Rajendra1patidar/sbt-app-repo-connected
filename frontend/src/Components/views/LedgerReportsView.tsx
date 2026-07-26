import React, { useEffect, useState } from "react";
import { CheckCircle2, Landmark, Loader2, Scale, XCircle } from "lucide-react";
import { Card } from "../common/UIPrimitives";
import { fmtMoney, today } from "../../lib/format";
import { api } from "../../lib/api";

/* ---- Ledger & Accounts ---- */
/*
 * Everything on this screen is derived live from LedgerEntry — nothing here
 * is stored separately, so it can never drift out of sync with the estimates,
 * payments, expenses, and purchases you've already entered elsewhere in the app.
 */

export function LedgerReportsView({ currency }: any) {
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [profitAndLoss, setProfitAndLoss] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [stockValuation, setStockValuation] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [tb, pnl, bs, sv] = await Promise.all([
        api.ledger.trialBalance(fromDate, toDate),
        api.ledger.profitAndLoss(fromDate, toDate),
        api.ledger.balanceSheet(toDate),
        api.ledger.stockValuation(),
      ]);
      setTrialBalance(tb);
      setProfitAndLoss(pnl);
      setBalanceSheet(bs);
      setStockValuation(sv);
    } catch (err: any) {
      setError(err?.message || "Failed to load ledger reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-ink/50">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-ink/50">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          </div>
          <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white">
            Refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-ink/40">
          Profit & Loss covers this date range. Balance Sheet and Stock Valuation are as of the "To" date — a snapshot, not a range.
        </p>
      </Card>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-10 text-ink/40">
          <Loader2 size={18} className="animate-spin" /> Loading ledger...
        </Card>
      ) : error ? (
        <Card><p className="text-center text-sm text-bad-600">{error}</p></Card>
      ) : (
        <>
          {/* Trial Balance self-check */}
          <Card className={trialBalance?.balanced ? "border border-good-100 bg-good-50/40" : "border border-bad-200 bg-bad-50/40"}>
            <div className="flex items-center gap-2">
              <Scale size={16} className={trialBalance?.balanced ? "text-good-600" : "text-bad-600"} />
              <h3 className="font-display text-base font-bold text-ink">Trial Balance</h3>
              {trialBalance?.balanced ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-good-700"><CheckCircle2 size={14} /> Balanced</span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-bad-700"><XCircle size={14} /> Not balanced</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink/50">
              Total Debits {fmtMoney(trialBalance?.totalDebit || 0, currency)} · Total Credits {fmtMoney(trialBalance?.totalCredit || 0, currency)}
            </p>
            {!trialBalance?.balanced && (
              <p className="mt-1 text-xs text-bad-600">
                Debits and credits don't match — something posted incorrectly. Don't fully trust the reports below until this is fixed.
              </p>
            )}
            <div className="mt-3 space-y-1.5">
              {(trialBalance?.accounts || []).map((a: any) => (
                <div key={a.account} className="flex items-center justify-between text-sm">
                  <span className="text-ink/70">{a.account}</span>
                  <span className="font-mono text-xs text-ink/50">Dr {fmtMoney(a.debit, currency)} · Cr {fmtMoney(a.credit, currency)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Profit & Loss */}
          <Card>
            <h3 className="font-display text-base font-bold text-ink">Profit & Loss</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink/60">Sales</span><span className="font-semibold text-ink">{fmtMoney(profitAndLoss?.sales || 0, currency)}</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Cost of Goods Sold</span><span className="font-semibold text-bad-600">-{fmtMoney(profitAndLoss?.cogs || 0, currency)}</span></div>
              <div className="flex justify-between border-t border-line pt-2"><span className="font-semibold text-ink">Gross Profit</span><span className="font-bold text-good-700">{fmtMoney(profitAndLoss?.grossProfit || 0, currency)}</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Freight</span><span className="text-bad-600">-{fmtMoney(profitAndLoss?.expenses?.freight || 0, currency)}</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Labour</span><span className="text-bad-600">-{fmtMoney(profitAndLoss?.expenses?.labour || 0, currency)}</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Other Expenses</span><span className="text-bad-600">-{fmtMoney(profitAndLoss?.expenses?.other || 0, currency)}</span></div>
              <div className="flex justify-between border-t border-line pt-2"><span className="font-bold text-ink">Net Profit</span><span className={`font-bold text-lg ${(profitAndLoss?.netProfit || 0) >= 0 ? "text-good-700" : "text-bad-600"}`}>{fmtMoney(profitAndLoss?.netProfit || 0, currency)}</span></div>
            </div>
          </Card>

          {/* Balance Sheet */}
          <Card>
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-brand-600" />
              <h3 className="font-display text-base font-bold text-ink">Balance Sheet</h3>
              {balanceSheet?.balanced ? (
                <span className="ml-auto text-xs font-semibold text-good-700">Balanced ✓</span>
              ) : (
                <span className="ml-auto text-xs font-semibold text-bad-700">Not balanced</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-ink/50">Assets</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-ink/60">Funds</span><span>{fmtMoney(balanceSheet?.assets?.funds || 0, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-ink/60">Receivable</span><span>{fmtMoney(balanceSheet?.assets?.accountsReceivable || 0, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-ink/60">Stock</span><span>{fmtMoney(balanceSheet?.assets?.stock || 0, currency)}</span></div>
                  <div className="flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{fmtMoney(balanceSheet?.assets?.total || 0, currency)}</span></div>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-ink/50">Liabilities + Capital</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-ink/60">Vendor Payable</span><span>{fmtMoney(balanceSheet?.liabilities?.vendorPayable || 0, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-ink/60">Capital (incl. retained profit)</span><span>{fmtMoney(balanceSheet?.capital?.total || 0, currency)}</span></div>
                  <div className="flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{fmtMoney((balanceSheet?.liabilities?.total || 0) + (balanceSheet?.capital?.total || 0), currency)}</span></div>
                </div>
              </div>
            </div>
          </Card>

          {/* Stock Valuation */}
          <Card>
            <h3 className="font-display text-base font-bold text-ink">Stock Valuation</h3>
            <p className="mt-1 text-xs text-ink/40">Current inventory value: {fmtMoney(stockValuation?.totalValue || 0, currency)}</p>
            {(stockValuation?.rows || []).filter((r: any) => r.stock > 0).length > 0 && (
              <div className="mt-3 space-y-1.5">
                {stockValuation.rows.filter((r: any) => r.stock > 0).slice(0, 15).map((r: any) => (
                  <div key={r.itemId} className="flex items-center justify-between text-sm">
                    <span className="text-ink/70 truncate">{r.name}</span>
                    <span className="text-xs text-ink/50">{r.stock} @ {fmtMoney(r.avgCost, currency)} = <b className="text-ink">{fmtMoney(r.value, currency)}</b></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
