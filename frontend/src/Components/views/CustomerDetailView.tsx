import { useEffect, useState } from "react";
import { ChevronLeft, MapPin, Receipt } from "lucide-react";
import { Badge, Card, EmptyState, SmsButton, WhatsAppButton } from "../common/UIPrimitives";
import { fmtDate, fmtMoney } from "../../lib/format";
import { api } from "../../lib/api";

/* ---- Customer Ledger / Detail ---- */

export function CustomerDetailView({ customer, estimates, payments, items, currency, openModal, onBack }: any){
  const [statement, setStatement] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    if (!customer?.id) return;
    setStatementLoading(true);
    api.ledger.customerStatement(customer.id)
      .then((s: any) => setStatement(s))
      .catch(() => setStatement(null))
      .finally(() => setStatementLoading(false));
  }, [customer?.id]);

  if (!customer) {
    return (
      <div className="px-5 pb-28 pt-1">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-ink/50"><ChevronLeft size={16} /> Back</button>
        <Card className="mt-3"><EmptyState text="Customer not found." /></Card>
      </div>
    );
  }

  const custEstimates = (estimates || [])
    .filter((e: any) => String(e.customerId) === String(customer.id))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
  const custPayments = (payments || [])
    .filter((p: any) => String(p.customerId) === String(customer.id))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));

  const balance = custEstimates.reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);
  const overdueEstimates = custEstimates.filter((e: any) => e.status !== "Paid" && e.dueDate && new Date(e.dueDate) < new Date());

  return (
    <div className="space-y-4 px-5 pb-28 pt-1">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-ink/50"><ChevronLeft size={16} /> Back</button>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-ink truncate">{customer.name}</p>
            <p className="text-xs text-ink/40 truncate">{customer.email || "No email"}{customer.phone ? ` · ${customer.phone}` : ""}</p>
            {customer.location && (
              <a
                href={customer.lat && customer.lng ? `https://www.google.com/maps/search/?api=1&query=${customer.lat},${customer.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.location)}`}
                target="_blank" rel="noreferrer"
                className="mt-1 flex items-center gap-1 text-xs text-ink/40 hover:text-brand-500 hover:underline"
              >
                <MapPin size={11} /> {customer.location}
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <WhatsAppButton compact phone={customer.phone} message={`Hi ${customer.name}, reaching out from ${customer.name}'s account.`} />
            <SmsButton compact phone={customer.phone} message={`Hi ${customer.name}, reaching out from ${customer.name}'s account.`} />
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-ink/40">Balance due</p>
        <p className={`mt-1 text-2xl font-bold ${balance > 0 ? "text-bad-600" : "text-good-600"}`}>{fmtMoney(balance, currency)}</p>
        {overdueEstimates.length > 0 && (
          <p className="mt-1 text-xs font-semibold text-warn-600">{overdueEstimates.length} overdue estimate{overdueEstimates.length !== 1 ? "s" : ""}</p>
        )}
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink/80">Estimates ({custEstimates.length})</h3>
        {custEstimates.length === 0 ? (
          <Card><EmptyState text="No estimates yet." /></Card>
        ) : (
          <div className="space-y-2">
            {custEstimates.map((e: any) => {
              const overdue = e.status !== "Paid" && e.dueDate && new Date(e.dueDate) < new Date();
              return (
                <Card key={e.id} onClick={() => openModal("viewEstimate", { doc: e })} className="flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{e.number}</p>
                    <p className="text-xs text-ink/40 truncate">{fmtDate(e.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-ink">{fmtMoney(e.total, currency)}</p>
                    <Badge status={overdue ? "Overdue" : e.status} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink/80">Payments ({custPayments.length})</h3>
        {custPayments.length === 0 ? (
          <Card><EmptyState text="No payments yet." /></Card>
        ) : (
          <div className="space-y-2">
            {custPayments.map((p: any) => (
              <Card key={p.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{p.invoiceNumber || "—"}</p>
                  <p className="text-xs text-ink/40 truncate">{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ""}</p>
                </div>
                <p className={`font-bold shrink-0 ${Number(p.amount) < 0 ? "text-bad-600" : "text-good-600"}`}>{fmtMoney(p.amount, currency)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Receipt size={14} className="text-brand-600" />
          <h3 className="text-sm font-bold text-ink/80">Ledger Statement</h3>
        </div>
        {statementLoading ? (
          <Card><p className="text-center text-sm text-ink/40">Loading statement...</p></Card>
        ) : !statement || statement.rows.length === 0 ? (
          <Card><EmptyState text="No ledger activity yet." /></Card>
        ) : (
          <Card>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {statement.rows.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-ink/80">{r.narration}</p>
                    <p className="text-xs text-ink/40">{fmtDate(r.date)} · {r.account}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono text-xs font-semibold ${r.type === "debit" ? "text-ink" : "text-good-700"}`}>
                      {r.type === "debit" ? "Dr" : "Cr"} {fmtMoney(r.amount, currency)}
                    </p>
                    <p className="text-xs text-ink/40">Bal: {fmtMoney(r.balance, currency)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
              <span className="text-sm font-bold text-ink">Closing Balance</span>
              <span className={`text-lg font-bold ${statement.closingBalance > 0 ? "text-bad-600" : "text-good-600"}`}>
                {fmtMoney(statement.closingBalance, currency)}
              </span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
