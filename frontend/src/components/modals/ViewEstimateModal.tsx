import { Phone, Printer, X } from "lucide-react";
import { Badge } from "../common/UIPrimitives";
import { fmtDate, fmtMoney, fmtNum } from "../../lib/format";
import { estimatePoints } from "../../lib/points";
import { WHATSAPP_GREEN } from "../../lib/constants";

export function ViewEstimateModal({ doc, customers, items, currency, scoreRules, onClose, onPrint, onShareInvoice }: any) {
  if (!doc) return null;
  const customer = customers.find((c: any) => c.id === doc.customerId);
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const pts = estimatePoints(doc, items, scoreRules);
  const balance = Number(doc.total || 0) - Number(doc.amountPaid || 0);

  // matches the wording/coloring already used on the printed slip and the
  // WhatsApp share image, so the in-app view, the print, and the share image
  // all describe the same estimate the same way
  const isOverdue = doc.status === "Due" && doc.dueDate && new Date(doc.dueDate) < new Date();
  const statusLabel = doc.isAdvanceBooking ? "Advance Booked"
    : doc.status === "Paid" ? "Paid"
    : doc.status === "Partially Paid" ? "Partially Paid"
    : doc.status === "Accepted" ? "Accepted"
    : isOverdue ? "Overdue" : "Due";
  const statusColorClass = doc.status === "Paid" ? "text-good-600"
    : doc.status === "Partially Paid" || doc.isAdvanceBooking || doc.status === "Accepted" ? "text-brand-600"
    : isOverdue ? "text-bad-600" : "text-warn-600";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4 animate-fade-in">
      <div className="animate-sheet-up w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-ink">{doc.number}</h3>
            <p className="text-xs text-ink/40">{fmtDate(doc.date)}{doc.dueDate ? ` · Due ${fmtDate(doc.dueDate)}` : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{customer?.name || "Unknown customer"}</p>
              {customer?.location && <p className="text-xs text-ink/40">{customer.location}</p>}
            </div>
            <Badge status={doc.status} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">TOTAL</p>
              <p className="mt-0.5 font-mono text-base font-bold text-ink">{fmtMoney(doc.total, currency)}</p>
            </div>
            <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">PAID</p>
              <p className="mt-0.5 font-mono text-base font-bold text-good-600">{fmtMoney(doc.amountPaid, currency)}</p>
            </div>
            <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">BALANCE</p>
              <p className={`mt-0.5 font-mono text-base font-bold ${balance > 0 ? "text-bad-600" : "text-good-600"}`}>{fmtMoney(balance, currency)}</p>
            </div>
            <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">DUE DATE</p>
              <p className="mt-0.5 text-sm font-bold text-ink">{doc.dueDate ? fmtDate(doc.dueDate) : "—"}</p>
            </div>
          </div>

          {(doc.contractorName || doc.destination) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {doc.contractorName && <div><p className="text-xs font-semibold text-ink/40">Contractor</p><p className="text-ink/80">{doc.contractorName}</p></div>}
              {doc.destination && <div><p className="text-xs font-semibold text-ink/40">Destination</p><p className="text-ink/80">{doc.destination}</p></div>}
            </div>
          )}

          {doc.contractorName && pts.points > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-brand-50/60 px-3 py-2 text-sm">
              <span className="text-ink/70">
                {pts.cementQty > 0 && `Cement ${fmtNum(pts.cementQty)}`}
                {pts.cementQty > 0 && pts.sariaQty > 0 && " · "}
                {pts.sariaQty > 0 && `Saria ${fmtNum(pts.sariaQty)}kg`}
              </span>
              <span className="font-bold text-brand-700">{fmtNum(pts.points)} pts</span>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold text-ink/50">Bill</p>
            {/* Styled to match the printed slip and WhatsApp share image — same
                header/divider/dotted-row/total layout — so what he sees here is
                what the customer actually gets. */}
            <div className="rounded-2xl border border-dashed border-line bg-paper/40 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-ink">{customer?.name || "Customer"}</span>
                <span className="text-sm font-bold text-ink">{fmtDate(doc.date)}</span>
              </div>
              {customer?.location && <p className="mt-0.5 text-xs text-ink/50">{customer.location}</p>}
              <div className="my-3 border-t-2 border-ink/80" />

              <div className="space-y-1.5">
                {(doc.lines || []).map((ln: any, i: number) => {
                  const it = itemById(ln.itemId);
                  const gross = Number(ln.qty || 0) * Number(ln.rate || 0);
                  const discount = Number(ln.discountAmount || 0);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between border-b border-dotted border-line pb-1.5 text-sm">
                        <span className="text-ink/80">{it?.name || ln.name || "Item"} × {fmtNum(ln.qty)}</span>
                        <span className="font-semibold text-ink">{fmtMoney(gross, currency)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex items-center justify-between border-b border-dotted border-line py-1 text-xs text-ink/40">
                          <span>Discount</span><span>-{fmtMoney(discount, currency)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {Number(doc.freightCost || 0) > 0 && (
                  <div className="flex items-center justify-between border-b border-dotted border-line pb-1.5 text-sm text-ink/70"><span>Freight</span><span>{fmtMoney(doc.freightCost, currency)}</span></div>
                )}
                {Number(doc.labourCost || 0) > 0 && (
                  <div className="flex items-center justify-between border-b border-dotted border-line pb-1.5 text-sm text-ink/70"><span>Labour</span><span>{fmtMoney(doc.labourCost, currency)}</span></div>
                )}
                {Number(doc.previousDue || 0) > 0 && (
                  <div className="flex items-center justify-between border-b border-dotted border-line pb-1.5 text-sm text-ink/70"><span>Previous due</span><span>{fmtMoney(doc.previousDue, currency)}</span></div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t-2 border-ink/80 pt-2">
                <span className="text-sm font-bold text-ink">Total</span>
                <span className="font-display text-lg font-bold text-ink">{fmtMoney(doc.total, currency)}</span>
              </div>

              {Number(doc.amountPaid || 0) > 0 && (
                <>
                  <div className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="text-ink/60">Paid</span>
                    <span className="font-semibold text-good-600">{fmtMoney(doc.amountPaid, currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="font-bold text-ink">Balance due</span>
                    <span className={`font-display text-base font-bold ${balance > 0 ? "text-bad-600" : "text-good-600"}`}>{fmtMoney(balance, currency)}</span>
                  </div>
                </>
              )}

              {doc.notes && <p className="mt-2 text-xs italic text-ink/50">{doc.notes}</p>}
              <p className={`mt-2 text-right text-xs font-bold ${statusColorClass}`}>{statusLabel}</p>
            </div>
          </div>

          {(doc.returns || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/50">Returns</p>
              <div className="space-y-1.5">
                {doc.returns.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-bad-50 px-3 py-2 text-xs text-bad-700">
                    <span>{r.name} × {fmtNum(r.qty)} ({fmtDate(r.date)})</span>
                    <span className="font-semibold">-{fmtMoney(r.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(doc.deliveries || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/50">Collections (advance booking)</p>
              <div className="space-y-1.5">
                {doc.deliveries.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    <span>{d.name} × {fmtNum(d.qty)}</span>
                    <span className="text-brand-500">{fmtDate(d.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(doc.history || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/50">History</p>
              <div className="space-y-2 border-l-2 border-line pl-3">
                {[...doc.history].reverse().map((h: any, i: number) => (
                  <div key={i} className="text-xs">
                    <p className="font-semibold text-ink/80">{h.action}</p>
                    <p className="text-ink/40">{fmtDate(h.date)}{h.note ? ` · ${h.note}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => onShareInvoice && onShareInvoice(doc)}
            disabled={!onShareInvoice}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-xs font-bold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: WHATSAPP_GREEN }}
          >
            <Phone size={14} /> Share
          </button>
          <a
            href={customer?.phone ? `tel:${customer.phone}` : undefined}
            onClick={(e) => !customer?.phone && e.preventDefault()}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-3 text-xs font-bold text-paper transition ${customer?.phone ? "active:scale-[0.97]" : "opacity-40 cursor-not-allowed"}`}
          >
            <Phone size={14} /> Call
          </a>
          {onPrint && (
            <button
              onClick={() => onPrint(doc)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-600 py-3 text-xs font-bold text-white active:scale-[0.97]"
            >
              <Printer size={14} /> Print
            </button>
          )}
        </div>
        <button onClick={onClose} className="mt-2 w-full rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Close</button>
      </div>
    </div>
  );
}
