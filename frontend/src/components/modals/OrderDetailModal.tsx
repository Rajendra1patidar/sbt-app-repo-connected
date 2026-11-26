import { useState } from "react";
import { DetailRow } from "../ui/blocks";
import { Group, PrimaryButton, Sheet, StatusChip, TextButton, type ChipTone } from "../ui/kit";
import { InvoiceAttachment } from "../views/InvoiceAttachment";
import { ViewImageModal } from "./ViewImageModal";
import { round2 } from "../../lib/format";
import { inr, inrRate, qtyText, shortDate } from "../../lib/money";

/** One order, as a sheet: the figures, the vendor's bill photo, and Pay / Delete.
 *  Opened by tapping an order in the Orders list (and still reached the same way: openModal("orderDetail")). */
export function OrderDetailModal({ order, items, vendors, currency, payOrder, removeOrder, attachOrderInvoice, removeOrderInvoice, onClose }: any) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  if (!order) return null;

  const item = (items || []).find((it: any) => it.id === order.itemId);
  const vendor = order.vendorId ? (vendors || []).find((v: any) => v.id === order.vendorId) : null;
  const remaining = Math.max(0, round2((order.amount || 0) - (order.amountPaid || 0)));
  const received = order.status === "Received";
  const chip: { tone: ChipTone; label: string } = received ? { tone: "paid", label: "Received" }
    : order.paymentStatus === "paid" ? { tone: "paid", label: "Paid" } : order.paymentStatus === "partial" ? { tone: "partial", label: "Part paid" } : { tone: "due", label: "Due" };

  return (
    <>
      <Sheet onClose={onClose} label={`Order for ${item?.name || "an item"}`}
        footer={remaining > 0 ? <PrimaryButton onClick={() => payOrder({ id: order.id, amount: order.amount, amountPaid: order.amountPaid, itemName: item?.name })}>Pay {inr(remaining, currency)}</PrimaryButton> : undefined}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate text-section text-ink">{item?.name || "Unknown item"}</h2>
          <p className="shrink-0 text-section tabular-nums text-ink">{inr(order.amount || 0, currency)}</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
          <p className="min-w-0 truncate text-[15px] text-mute">{vendor?.name || "No vendor set"}</p>
        </div>

        <Group className="mt-4">
          <DetailRow label="Ordered on">{shortDate(order.date)}</DetailRow>
          <DetailRow label="Quantity">{qtyText(order.qty)} at {inrRate(order.rate || 0, currency)}</DetailRow>
          {order.notes && <DetailRow label="Notes">{order.notes}</DetailRow>}
        </Group>
        <Group className="mt-4">
          <DetailRow label="Paid" tone={order.amountPaid > 0 ? "good" : undefined}>{inr(order.amountPaid || 0, currency)}</DetailRow>
          <DetailRow label={remaining > 0 ? "Still to pay" : "Status"} tone={remaining > 0 ? "warn" : "good"}>{remaining > 0 ? inr(remaining, currency) : "Fully paid"}</DetailRow>
        </Group>

        <Group className="mt-4">
          <div className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2">
            <span className="text-[16px] text-mute">Vendor's bill</span>
            <InvoiceAttachment order={order} attachOrderInvoice={attachOrderInvoice} removeOrderInvoice={removeOrderInvoice} onView={setViewingImage} />
          </div>
        </Group>

        <div className="mt-4 flex justify-center">
          <TextButton tone="risk" onClick={() => { removeOrder(order.id); onClose(); }}>Delete order</TextButton>
        </div>
        <div className="h-1" />
      </Sheet>
      {viewingImage && <ViewImageModal title="Vendor bill" url={viewingImage} onClose={() => setViewingImage(null)} />}
    </>
  );
}
