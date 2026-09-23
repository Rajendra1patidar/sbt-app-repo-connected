import React, { useState } from "react";
import { IndianRupee, Trash2, X } from "lucide-react";
import { Badge } from "../common/UIPrimitives";
import { InvoiceAttachment } from "../views/OrdersView";
import { ViewImageModal } from "./ViewImageModal";
import { fmtDate, fmtMoney, fmtNum, round2 } from "../../lib/format";

/** Full detail view for a single order — opened by tapping its card in
 *  OrdersView. Shows everything the compact card leaves out (full date,
 *  vendor, notes, per-line breakdown) and carries over the same pay /
 *  attach-bill / remove actions so nothing is lost by drilling in. */
export function OrderDetailModal({ order, items, vendors, currency, payOrder, removeOrder, attachOrderInvoice, removeOrderInvoice, onClose }: any) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  if (!order) return null;

  const item = items.find((it: any) => it.id === order.itemId);
  const vendor = order.vendorId ? vendors.find((v: any) => v.id === order.vendorId) : null;
  const statusBadge = order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "partial" ? "Partially Paid" : "Due";
  const remaining = round2((order.amount || 0) - (order.amountPaid || 0));

  const handleRemove = () => {
    removeOrder(order.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4 animate-fade-in">
      <div className="animate-sheet-up w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-ink truncate">{item?.name || "Unknown item"}</h3>
            <p className="text-xs text-ink/40">{fmtDate(order.date)}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{vendor?.name || "No vendor set"}</p>
              <p className="text-xs text-ink/40">Qty: {fmtNum(order.qty)} @ {fmtMoney(order.rate || 0, currency)}</p>
            </div>
            <Badge status={order.status === "Received" ? "Received" : statusBadge} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">AMOUNT</p>
              <p className="mt-0.5 font-mono text-base font-bold text-ink">{fmtMoney(order.amount || 0, currency)}</p>
            </div>
            <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">PAID</p>
              <p className="mt-0.5 font-mono text-base font-bold text-good-600">{fmtMoney(order.amountPaid || 0, currency)}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-line bg-card px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold text-ink/40">REMAINING</p>
              <p className={`mt-0.5 font-mono text-base font-bold ${remaining > 0 ? "text-bad-600" : "text-good-600"}`}>
                {remaining > 0 ? fmtMoney(remaining, currency) : "Fully paid"}
              </p>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-xl border border-line bg-paper/60 px-4 py-3">
              <p className="text-[10.5px] font-bold text-ink/40">NOTES</p>
              <p className="mt-0.5 text-sm text-ink">{order.notes}</p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-line bg-paper/60 px-4 py-3">
            <p className="text-sm font-semibold text-ink/70">Vendor bill</p>
            <InvoiceAttachment
              order={order}
              attachOrderInvoice={attachOrderInvoice}
              removeOrderInvoice={removeOrderInvoice}
              onView={setViewingImage}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={handleRemove} className="rounded-full border border-line p-3 text-bad-500 hover:bg-bad-50"><Trash2 size={16} /></button>
          {remaining > 0 && (
            <button
              onClick={() => payOrder({ id: order.id, amount: order.amount, amountPaid: order.amountPaid, itemName: item?.name })}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              <IndianRupee size={15} /> Pay {fmtMoney(remaining, currency)}
            </button>
          )}
        </div>
      </div>

      {viewingImage && <ViewImageModal title="Vendor invoice" url={viewingImage} onClose={() => setViewingImage(null)} />}
    </div>
  );
}
