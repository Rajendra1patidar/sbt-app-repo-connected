import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, CheckCircle2, Landmark, Loader2, Scale, Search, XCircle } from "lucide-react";
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
  const [dayBook, setDayBook] = useState<any[]>([]);

  // Day Book controls: account chips, Dr/Cr toggle, narration search, and
  // click-to-sort column headers (spreadsheet-style rather than a dropdown).
  const [dbAccount, setDbAccount] = useState<string>("all");
  const [dbType, setDbType] = useState<"all" | "debit" | "credit">("all");
  const [dbSearch, setDbSearch] = useState("");
  const [dbSortKey, setDbSortKey] = useState<"date" | "amount" | "account">("date");
  const [dbSortDir, setDbSortDir] = useState<"asc" | "desc">("desc");
  const [openingBalance, setOpeningBalance] = useState<number | null>(null);
  const [openingBalanceLoading, setOpeningBalanceLoading] = useState(false);

  const dayBefore = (d: string) => {
    const dt = new Date(`${d}T00:00:00`);
    dt.setDate(dt.getDate() - 1);
    return dt.toISOString().slice(0, 10);
  };

  const handleSort = (key: "date" | "amount" | "account") => {
    if (dbSortKey === key) setDbSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setDbSortKey(key); setDbSortDir(key === "account" ? "asc" : "desc"); }
  };
  const sortIcon = (key: string) =>
    dbSortKey !== key ? <ArrowUpDown size={12} className="opacity-30" /> : dbSortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;

  const dbAccounts = useMemo(() => Array.from(new Set(dayBook.map((e: any) => e.account))).sort(), [dayBook]);

  // A "true" running balance only makes sense once you've isolated one
  // account — it carries forward whatever the account's balance already
  // was the day before "From", rather than pretending it started at zero.
  useEffect(() => {
    if (dbAccount === "all") { setOpeningBalance(null); return; }
    let cancelled = false;
    setOpeningBalanceLoading(true);
    api.ledger.accountBalance(dbAccount, undefined, dayBefore(fromDate))
      .then((r: any) => { if (!cancelled) setOpeningBalance(r?.net ?? 0); })
      .catch(() => { if (!cancelled) setOpeningBalance(0); })
      .finally(() => { if (!cancelled) setOpeningBalanceLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbAccount, fromDate]);

  // Running balance is computed in true chronological order (the API already
  // returns entries sorted by date/batchId) BEFORE any display sort/filter is
  // applied, so the balance column stays a real ledger position even if the
  // visible list is later re-sorted by amount or account.
  const dayBookWithBalance = useMemo(() => {
    if (dbAccount === "all" || openingBalance === null) return dayBook;
    let running = openingBalance;
    return dayBook.map((e: any) => {
      if (e.account !== dbAccount) return e;
      const delta = e.type === "debit" ? e.amount : -e.amount;
      running = Math.round((running + delta) * 100) / 100;
      return { ...e, balance: running };
    });
  }, [dayBook, dbAccount, openingBalance]);

  const displayedDayBook = useMemo(() => {
    let rows = dayBookWithBalance;
    if (dbAccount !== "all") rows = rows.filter((e: any) => e.account === dbAccount);
    if (dbType !== "all") rows = rows.filter((e: any) => e.type === dbType);
    if (dbSearch.trim()) {
      const q = dbSearch.trim().toLowerCase();
      rows = rows.filter((e: any) => (e.narration || "").toLowerCase().includes(q));
    }
    return [...rows].sort((a: any, b: any) => {
      let cmp = 0;
      if (dbSortKey === "date") cmp = String(a.date).localeCompare(String(b.date)) || String(a.batchId || "").localeCompare(String(b.batchId || ""));
      else if (dbSortKey === "amount") cmp = Number(a.amount) - Number(b.amount);
      else cmp = String(a.account).localeCompare(String(b.account));
      return dbSortDir === "asc" ? cmp : -cmp;
    });
  }, [dayBookWithBalance, dbAccount, dbType, dbSearch, dbSortKey, dbSortDir]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [tb, pnl, bs, sv, db] = await Promise.all([
        api.ledger.trialBalance(fromDate, toDate),
        api.ledger.profitAndLoss(fromDate, toDate),
        api.ledger.balanceSheet(toDate),
        api.ledger.stockValuation(),
        api.ledger.dayBook(fromDate, toDate),
      ]);
      setTrialBalance(tb);
      setProfitAndLoss(pnl);
      setBalanceSheet(bs);
      setStockValuation(sv);
      setDayBook(db || []);
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
          Profit & Loss and Day Book cover this date range. Balance Sheet and Stock Valuation are as of the "To" date — a snapshot, not a range.
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
              {!!profitAndLoss?.otherIncome && (
                <div className="flex justify-between"><span className="text-ink/60">Other Income</span><span className="font-semibold text-good-700">+{fmtMoney(profitAndLoss.otherIncome, currency)}</span></div>
              )}
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

          {/* Day Book */}
          <Card>
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-brand-600" />
              <h3 className="font-display text-base font-bold text-ink">Day Book</h3>
              <span className="ml-auto text-xs text-ink/40">{displayedDayBook.length} of {dayBook.length} entries</span>
            </div>

            <div className="relative mt-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
                placeholder="Search narration (customer, estimate number...)"
                className="w-full rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-sm"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button onClick={() => setDbAccount("all")} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dbAccount === "all" ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>All</button>
              {dbAccounts.map((a) => (
                <button key={a} onClick={() => setDbAccount(a)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dbAccount === a ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{a}</button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              {[["all", "All"], ["debit", "Debit only"], ["credit", "Credit only"]].map(([key, label]) => (
                <button key={key} onClick={() => setDbType(key as any)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dbType === key ? "bg-ink text-paper" : "bg-paper text-ink/70"}`}>{label}</button>
              ))}
            </div>

            {dbAccount !== "all" && (
              <p className="mt-2 text-xs text-ink/40">
                {openingBalanceLoading ? "Loading opening balance..." : `Opening balance before ${fromDate}: ${fmtMoney(openingBalance || 0, currency)}`}
              </p>
            )}

            {displayedDayBook.length === 0 ? (
              <p className="mt-3 text-sm text-ink/40">No ledger activity matches this range/filter.</p>
            ) : (
              <div className="mt-3 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-12 gap-2 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40 sticky top-0 bg-card">
                  <button onClick={() => handleSort("date")} className="col-span-3 flex items-center gap-1 text-left">Date {sortIcon("date")}</button>
                  <span className="col-span-4">Narration</span>
                  <button onClick={() => handleSort("account")} className="col-span-2 flex items-center gap-1 text-left">Account {sortIcon("account")}</button>
                  <button onClick={() => handleSort("amount")} className={`flex items-center justify-end gap-1 text-right ${dbAccount !== "all" ? "col-span-1" : "col-span-3"}`}>Amount {sortIcon("amount")}</button>
                  {dbAccount !== "all" && <span className="col-span-2 text-right">Balance</span>}
                </div>
                {displayedDayBook.map((e: any) => (
                  <div key={e._id} className="grid grid-cols-12 items-center gap-2 border-b border-line/60 py-1.5 text-sm last:border-0">
                    <span className="col-span-3 truncate text-xs text-ink/50">{e.date}</span>
                    <span className="col-span-4 truncate text-ink/80">{e.narration}</span>
                    <span className="col-span-2 truncate text-xs text-ink/50">{e.account}</span>
                    <span className={`${dbAccount !== "all" ? "col-span-1" : "col-span-3"} shrink-0 truncate text-right font-mono text-xs font-semibold ${e.type === "debit" ? "text-ink" : "text-good-700"}`}>
                      {e.type === "debit" ? "Dr" : "Cr"} {fmtMoney(e.amount, currency)}
                    </span>
                    {dbAccount !== "all" && (
                      <span className="col-span-2 truncate text-right font-mono text-xs font-semibold text-brand-700">
                        {e.balance !== undefined ? fmtMoney(e.balance, currency) : "—"}
                      </span>
                    )}
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