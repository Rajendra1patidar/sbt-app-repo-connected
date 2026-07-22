import React, { useState } from "react";
import { MapPin, Printer, Search } from "lucide-react";
import { Badge, Card } from "../common/UIPrimitives";
import { EstimatesMapCard } from "./EstimatesMapCard";
import { fmtDate, fmtMoney, today } from "../../lib/format";

export function ReportsView({ data, currency, settings }: any) {
  const { invoices, payments, expenses, customers, labourSessions, items } = data;
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today());
  const totalInvoiced = invoices.reduce((s: number, i: any) => s + i.total, 0);
  const totalReceived = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const outstanding = invoices.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0);
  const rangeLabour = (labourSessions || []).filter((s: any) => s.date >= fromDate && s.date <= toDate);
  const rangeLabourTotal = rangeLabour.reduce((s: number, x: any) => s + Number(x.total || 0), 0);
  const statusCounts: Record<string, number> = {};
  invoices.forEach((i: any) => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });

  // Real gross margin: revenue minus cost-of-goods-sold, using each item's purchasePrice —
  // distinct from "netProfit" below, which is just cash collected minus overhead expenses
  // and says nothing about what the goods actually cost to buy.
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemStats = new Map<string, { name: string; qtySold: number; revenue: number; cost: number }>();
  const bumpItem = (itemId: string, name: string, qty: number, revenue: number, cost: number) => {
    const key = itemId || "unknown";
    const cur = itemStats.get(key) || { name: name || "Unknown item", qtySold: 0, revenue: 0, cost: 0 };
    cur.qtySold += qty; cur.revenue += revenue; cur.cost += cost;
    if (name) cur.name = name;
    itemStats.set(key, cur);
  };
  for (const inv of invoices) {
    for (const ln of inv.lines || []) {
      const it = itemById(ln.itemId);
      const qty = Number(ln.qty || 0), rate = Number(ln.rate || 0), pp = Number(it?.purchasePrice || 0);
      bumpItem(ln.itemId, it?.name, qty, qty * rate, qty * pp);
    }
    for (const ret of inv.returns || []) {
      const it = itemById(ret.itemId);
      const qty = Number(ret.qty || 0), revBack = Number(ret.amount || qty * Number(ret.rate || 0)), pp = Number(it?.purchasePrice || 0);
      bumpItem(ret.itemId, ret.name || it?.name, -qty, -revBack, -qty * pp);
    }
  }
  const itemProfitability = Array.from(itemStats.entries())
    .map(([itemId, s]) => ({ itemId, ...s, margin: s.revenue - s.cost }))
    .sort((a, b) => b.margin - a.margin);
  const costOfGoodsSold = itemProfitability.reduce((s, i) => s + i.cost, 0);
  const itemRevenue = itemProfitability.reduce((s, i) => s + i.revenue, 0);
  const grossProfit = itemRevenue - costOfGoodsSold;
  const grossMarginPercent = itemRevenue ? (grossProfit / itemRevenue) * 100 : 0;

  const stats = [
    { label: "Total Invoiced", value: totalInvoiced, color: "text-brand-600" },
    { label: "Total Received", value: totalReceived, color: "text-good-600" },
    { label: "Outstanding", value: outstanding, color: "text-warn-600" },
    { label: "Total Expenses", value: totalExpenses, color: "text-bad-600" },
  ];
  const trimmedName = nameQuery.trim().toLowerCase();
  const nameMatchedCustomers = trimmedName ? customers.filter((c: any) => c.name.toLowerCase().includes(trimmedName)) : [];
  const nameMatchedInvoices = trimmedName ? invoices.filter((inv: any) => nameMatchedCustomers.some((c: any) => c.id === inv.customerId)) : [];
  const trimmedLoc = locationQuery.trim().toLowerCase();
  const locationMatchedCustomers = trimmedLoc ? customers.filter((c: any) => c.location && c.location.toLowerCase().includes(trimmedLoc)) : [];

  const printRangeReport = () => {
    const inRange = (d: string) => d && d >= fromDate && d <= toDate;
    const rangeEstimates = invoices.filter((i: any) => inRange(i.date));
    const rangePayments = payments.filter((p: any) => inRange(p.date));
    const rangeExpenses = expenses.filter((e: any) => inRange(e.date));
    const rInvoiced = rangeEstimates.reduce((s: number, i: any) => s + i.total, 0);
    const rReceived = rangePayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    const rExpenses = rangeExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const rowsHtml = rangeEstimates.map((inv: any) => {
      const c = customers.find((cu: any) => cu.id === inv.customerId);
      return `<tr><td>${inv.number}</td><td>${fmtDate(inv.date)}</td><td>${c?.name || ""}</td><td>${inv.status}</td><td style="text-align:right;">${fmtMoney(inv.total, currency)}</td></tr>`;
    }).join("");

    const w = window.open("", "_blank", "width=560,height=760");
    if (!w) { return; }
    w.document.write(`<!doctype html><html><head><title>Report ${fromDate} to ${toDate}</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      .sub { color: #64748b; font-size: 11px; margin-bottom: 10px; }
      .stats { display: flex; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
      .stat { border: 0.3mm solid #e2e8f0; border-radius: 6px; padding: 6px 10px; }
      .stat b { display: block; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 4px 6px; border-bottom: 0.2mm solid #e2e8f0; font-size: 11px; }
      th { color: #64748b; font-weight: 600; }
    </style></head><body>
      <h1>${settings?.orgName || "Business"} — Report</h1>
      <div class="sub">${fmtDate(fromDate)} to ${fmtDate(toDate)}</div>
      <div class="stats">
        <div class="stat">Invoiced<b>${fmtMoney(rInvoiced, currency)}</b></div>
        <div class="stat">Received<b>${fmtMoney(rReceived, currency)}</b></div>
        <div class="stat">Expenses<b>${fmtMoney(rExpenses, currency)}</b></div>
        <div class="stat">Labour<b>${fmtMoney(rangeLabourTotal, currency)}</b></div>
      </div>
      <table><thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Status</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="5">No estimates in this range.</td></tr>`}</tbody></table>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

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
          <button onClick={printRangeReport} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink/80"><Printer size={13} /> Print report</button>
        </div>
        <p className="mt-2 text-xs text-ink/40">Prints estimates, payments received, and expenses between the two dates.</p>
        {rangeLabourTotal > 0 && <p className="mt-1 text-xs font-semibold text-warn-600">Labour cost in this range: {fmtMoney(rangeLabourTotal, currency)} ({rangeLabour.length} session{rangeLabour.length !== 1 ? "s" : ""})</p>}
      </Card>
      <EstimatesMapCard invoices={invoices.filter((i: any) => i.date >= fromDate && i.date <= toDate)} currency={currency} />
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (<Card key={s.label}><p className="text-xs font-semibold text-ink/40">{s.label}</p><p className={`mt-1 font-display text-xl font-bold ${s.color}`}>{fmtMoney(s.value, currency)}</p></Card>))}
      </div>

      <Card className="border border-good-100 bg-good-50/40">
        <p className="text-xs font-semibold text-good-700">Gross Profit (revenue − cost of goods sold)</p>
        <p className="mt-1 text-2xl font-bold text-good-700">{fmtMoney(grossProfit, currency)}</p>
        <p className="mt-1 text-xs text-good-600">{grossMarginPercent.toFixed(2)}% margin · Cost of goods sold: {fmtMoney(costOfGoodsSold, currency)}</p>
        <p className="mt-2 text-xs text-ink/40">This is different from "Total Received − Total Expenses" — it accounts for what your items actually cost to buy, not just cash overhead.</p>
      </Card>

      {itemProfitability.length > 0 && (
        <Card>
          <h3 className="mb-3 font-display text-base font-bold text-ink">Item profitability</h3>
          <div className="space-y-2">
            {itemProfitability.slice(0, 10).map((it) => (
              <div key={it.itemId} className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{it.name}</p>
                  <p className="text-xs text-ink/40">{it.qtySold} sold · Revenue {fmtMoney(it.revenue, currency)}</p>
                </div>
                <p className={`text-sm font-bold ${it.margin >= 0 ? "text-good-600" : "text-bad-600"}`}>{fmtMoney(it.margin, currency)}</p>
              </div>
            ))}
          </div>
          {itemProfitability.length > 10 && <p className="mt-2 text-xs text-ink/40">Showing top 10 of {itemProfitability.length} items.</p>}
        </Card>
      )}

      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">Estimates by status</h3>
        {Object.keys(statusCounts).length === 0 ? <p className="text-sm text-ink/40">No estimates yet.</p>
          : <ul className="space-y-2">{Object.entries(statusCounts).map(([s, c]) => (<li key={s} className="flex items-center justify-between text-sm"><Badge status={s} /><span className="font-semibold text-ink/80">{c}</span></li>))}</ul>}
      </Card>
      <Card><p className="text-xs font-semibold text-ink/40">Total Customers</p><p className="mt-1 font-display text-xl font-bold text-ink">{customers.length}</p></Card>

      {/* Search by name */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-brand-500" /><h3 className="font-display text-base font-bold text-ink">Search estimates by customer name</h3></div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Type customer name..." className="w-full rounded-xl border border-line py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        {trimmedName && (
          <div className="mt-3">
            {nameMatchedInvoices.length === 0
              ? <p className="text-sm text-ink/40">{nameMatchedCustomers.length === 0 ? `No customer matching "${nameQuery}".` : "Customer found but no estimates yet."}</p>
              : <ul className="divide-y divide-line">
                {nameMatchedInvoices.map((inv: any) => {
                  const c = customers.find((cu: any) => cu.id === inv.customerId);
                  return (<li key={inv.id} className="py-3"><div className="flex items-start justify-between"><div className="min-w-0"><p className="font-semibold text-ink truncate">{inv.number}</p><p className="text-xs text-ink/50 truncate">{c?.name} · {fmtDate(inv.date)}</p>{c?.location && <p className="flex items-center gap-1 text-xs text-ink/40 truncate"><MapPin size={10} /> {c.location}</p>}</div><div className="text-right shrink-0"><p className="font-bold text-ink">{fmtMoney(inv.total, currency)}</p><Badge status={inv.status} /></div></div></li>);
                })}
              </ul>
            }
          </div>
        )}
      </Card>

      {/* Search by location */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><MapPin size={16} className="text-advance-500" /><h3 className="font-display text-base font-bold text-ink">Search customers by location</h3></div>
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="Type city, area or address..." className="w-full rounded-xl border border-line py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-advance-400" />
        </div>
        {trimmedLoc && (
          <div className="mt-3">
            {locationMatchedCustomers.length === 0
              ? <p className="text-sm text-ink/40">No customers at "{locationQuery}".</p>
              : <ul className="divide-y divide-line">
                {locationMatchedCustomers.map((c: any) => {
                  const custInvoices = invoices.filter((inv: any) => inv.customerId === c.id);
                  const custTotal = custInvoices.reduce((s: number, inv: any) => s + inv.total, 0);
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="font-semibold text-ink truncate">{c.name}</p><p className="flex items-center gap-1 text-xs text-ink/40 mt-0.5 truncate"><MapPin size={10} /> {c.location}</p>{c.phone && <p className="text-xs text-ink/40 truncate">{c.phone}</p>}</div>
                        <div className="text-right shrink-0"><p className="text-xs text-ink/40">{custInvoices.length} estimate{custInvoices.length !== 1 ? "s" : ""}</p><p className="font-bold text-ink">{fmtMoney(custTotal, currency)}</p></div>
                      </div>
                      {custInvoices.length > 0 && <ul className="mt-2 space-y-1 pl-2 border-l-2 border-line">{custInvoices.map((inv: any) => (<li key={inv.id} className="flex items-center justify-between text-xs text-ink/50"><span>{inv.number} · {fmtDate(inv.date)}</span><span className="flex items-center gap-2">{fmtMoney(inv.total, currency)}<Badge status={inv.status} /></span></li>))}</ul>}
                    </li>
                  );
                })}
              </ul>
            }
          </div>
        )}
      </Card>
    </div>
  );
}
