import { CheckCircle2, MessageSquare, Phone, Send } from "lucide-react";
import { Card } from "../common/UIPrimitives";
import { fmtDate, fmtNum, today } from "../../lib/format";

/* ---- Share Report ---- */

export function ShareReportView({ invoices, items, customers, currency, settings }: any) {
  const todayStr = today();

  const todayInvoices = invoices.filter((inv: any) => inv.date === todayStr);

  // Aggregate qty + amount per item across today's invoices
  const itemMap: Record<string, { name: string; qty: number; amount: number }> = {};
  todayInvoices.forEach((inv: any) => {
    (inv.lines || []).forEach((ln: any) => {
      const it = items.find((x: any) => x.id === ln.itemId);
      if (!it) return;
      if (!itemMap[it.id]) itemMap[it.id] = { name: it.name, qty: 0, amount: 0 };
      const qty = Number(ln.qty) || 0;
      itemMap[it.id].qty += qty;
      itemMap[it.id].amount += qty * (ln.rate ?? it.sellingPrice ?? it.price ?? 0);
    });
  });

  const rows = Object.values(itemMap);
  const totalSales = todayInvoices.reduce((s: number, inv: any) => s + (inv.total || 0), 0);
  const totalInvoices = todayInvoices.length;

  const buildReport = () => {
    const lines = [
      `📊 *Daily Sales Report — ${fmtDate(todayStr)}*`,
      `🏢 ${settings.orgName}`,
      ``,
      `📦 *Items Sold Today:*`,
      ...rows.map((r) => `  • ${r.name}: ${fmtNum(r.qty)} unit(s) — ${currency}${r.amount.toFixed(2)}`),
      ``,
      `🧾 Estimates raised: ${totalInvoices}`,
      `💰 *Total Sales: ${currency}${totalSales.toFixed(2)}*`,
    ];
    return lines.join("\n");
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(buildReport());
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareSMS = () => {
    const text = encodeURIComponent(buildReport());
    window.open(`sms:?body=${text}`, "_blank");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(buildReport()).then(() => {}).catch(() => {});
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center"><Send size={18} className="text-brand-600" /></div>
          <div>
            <h3 className="font-bold text-ink">Daily Sales Report</h3>
            <p className="text-xs text-ink/40">{fmtDate(todayStr)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl bg-paper px-4 py-6 text-center">
            <p className="text-sm text-ink/40">No estimates created today yet.</p>
            <p className="text-xs text-ink/30 mt-1">Create an estimate and it will appear here.</p>
          </div>
        ) : (
          <>
            {/* Item breakdown table */}
            <div className="rounded-xl overflow-hidden border border-line">
              <div className="grid grid-cols-3 bg-paper px-4 py-2 text-xs font-semibold text-ink/50">
                <span>Item</span><span className="text-center">Qty</span><span className="text-right">Amount</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className={`grid grid-cols-3 px-4 py-2.5 text-sm ${i % 2 === 0 ? "bg-white" : "bg-paper"}`}>
                  <span className="font-medium text-ink truncate">{r.name}</span>
                  <span className="text-center text-ink/70">{fmtNum(r.qty)}</span>
                  <span className="text-right font-semibold text-ink">{currency}{r.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-3 flex justify-between items-center rounded-xl bg-brand-600 px-4 py-3">
              <div>
                <p className="text-xs text-ink/40">{totalInvoices} invoice{totalInvoices !== 1 ? "s" : ""} today</p>
                <p className="text-sm font-bold text-white">Total Sales</p>
              </div>
              <p className="font-display text-xl font-bold text-good-400">{currency}{totalSales.toFixed(2)}</p>
            </div>
          </>
        )}
      </Card>

      {/* Share buttons */}
      <Card>
        <h3 className="text-sm font-bold text-ink/80 mb-3">Share this report</h3>
        <div className="flex flex-col gap-2">
          <button onClick={shareWhatsApp}
            className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition"
            style={{ backgroundColor: "#25D366" }}>
            <Phone size={18} />Share via WhatsApp
          </button>
          <button onClick={shareSMS}
            className="flex items-center gap-3 w-full rounded-xl bg-advance-500 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
            <MessageSquare size={18} />Share via SMS
          </button>
          <button onClick={copyToClipboard}
            className="flex items-center gap-3 w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink/80 hover:bg-paper active:scale-[0.98] transition">
            <CheckCircle2 size={18} className="text-ink/40" />Copy to Clipboard
          </button>
        </div>
      </Card>
    </div>
  );
}
