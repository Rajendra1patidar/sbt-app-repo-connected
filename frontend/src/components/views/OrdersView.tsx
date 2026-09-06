import React, { useEffect, useRef, useState } from "react";
import { Camera, IndianRupee, ImageOff, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Badge, Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { ViewImageModal } from "../modals/ViewImageModal";
import { ITEM_CATEGORIES } from "../../lib/constants";
import { fmtDate, fmtMoney, fmtNum } from "../../lib/format";
import { api } from "../../lib/api";

/* ---- Orders ---- */

/** Attach/view/remove the vendor's bill photo for one pending order. Kept as
 *  a small self-contained control (its own uploading state, its own hidden
 *  file input) so each card manages its own upload independently of the rest
 *  of the list.
 *
 *  Invoice photos live in a private Telegram chat (see backend), fetched
 *  through our own authenticated API rather than a public URL — a plain
 *  <img src> can't send an Authorization header, so the photo is pulled down
 *  as a Blob here and turned into a local object URL for display. */
function InvoiceAttachment({ order, attachOrderInvoice, removeOrderInvoice, onView }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const fileId = order.invoiceImage?.fileId;

  useEffect(() => {
    if (!fileId) { setThumbUrl(null); setThumbFailed(false); return; }
    let cancelled = false;
    let objectUrl: string | null = null;
    setThumbFailed(false);
    api.orders.getInvoiceImage(order.id)
      .then((blob: Blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setThumbFailed(true); });
    // Object URLs are only valid in this tab's memory — revoke on cleanup so
    // switching orders (or unmounting) doesn't leak them.
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileId, order.id]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the exact same file again re-trigger onChange
    if (!file) return;
    setUploading(true);
    try {
      await attachOrderInvoice(order.id, file);
    } finally {
      setUploading(false);
    }
  };

  if (fileId) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => thumbUrl && onView(thumbUrl)}
          disabled={!thumbUrl}
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper"
          title={thumbFailed ? "Couldn't load invoice photo" : "View vendor invoice"}
        >
          {thumbUrl
            ? <img src={thumbUrl} alt="Invoice" className="h-full w-full object-cover" />
            : thumbFailed
            ? <ImageOff size={14} className="text-ink/30" />
            : <Loader2 size={14} className="animate-spin text-ink/30" />}
        </button>
        <button
          onClick={() => removeOrderInvoice(order.id)}
          className="rounded-full p-1.5 text-ink/30 hover:bg-bad-50 hover:text-bad-500"
          title="Remove invoice photo"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        {uploading ? "Uploading…" : "Attach bill"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />
    </>
  );
}

export function OrdersView({ orders, items, vendors, categories, currency, openModal, payOrder, removeOrder, attachOrderInvoice, removeOrderInvoice }: any) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const cats = categories?.length ? categories : ITEM_CATEGORIES;
  const itemName = (id: string) => items.find((it: any) => it.id === id)?.name || "Unknown item";
  const itemCategory = (id: string) => items.find((it: any) => it.id === id)?.category || "Others";
  const vendorName = (id?: string) => (id ? vendors.find((v: any) => v.id === id)?.name : null);
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const statusBadge = (status: string) => (status === "paid" ? "Paid" : status === "partial" ? "Partially Paid" : "Due");
  const q = search.trim().toLowerCase();
  const categoryFiltered = orders
    .filter((o: any) => category === "All" || itemCategory(o.itemId) === category)
    .filter((o: any) => !q || itemName(o.itemId).toLowerCase().includes(q) || (o.notes || "").toLowerCase().includes(q));
  const pending = categoryFiltered.filter((o: any) => o.status === "Pending");
  const received = categoryFiltered.filter((o: any) => o.status === "Received");

  return (
    <>
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("order")}><Plus size={16} /> New Order</PillButton>
      </div>
      {orders.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders by item or note..."
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {["All", ...cats].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
        ))}
      </div>

      {orders.length === 0
        ? <Card><EmptyState text="Place orders to restock your inventory. Paying an order off in full automatically updates the item's stock." cta="New Order" onCta={() => openModal("order")} /></Card>
        : pending.length === 0 && received.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No orders match this category.</p></Card>
        : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-ink/40">Pending ({pending.length})</p>
                {pending.map((o: any) => (
                  <Card key={o.id} className="mb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{itemName(o.itemId)}</p>
                        <p className="text-xs text-ink/40 truncate">Qty: {fmtNum(o.qty)} @ {fmtMoney(o.rate || 0, currency)} · {fmtDate(o.date)}{vendorName(o.vendorId) ? ` · ${vendorName(o.vendorId)}` : ""}{o.notes ? ` · ${o.notes}` : ""}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-ink">{fmtMoney(o.amount || 0, currency)}</p>
                        <Badge status={statusBadge(o.paymentStatus)} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-xs text-ink/40">{round2((o.amount || 0) - (o.amountPaid || 0)) > 0 ? `${fmtMoney(round2((o.amount || 0) - (o.amountPaid || 0)), currency)} remaining` : "Fully paid"}</p>
                      <div className="flex items-center gap-2">
                        <InvoiceAttachment
                          order={o}
                          attachOrderInvoice={attachOrderInvoice}
                          removeOrderInvoice={removeOrderInvoice}
                          onView={setViewingImage}
                        />
                        <button
                          onClick={() => payOrder({ id: o.id, amount: o.amount, amountPaid: o.amountPaid, itemName: itemName(o.itemId) })}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white active:scale-[0.98]"
                        >
                          <IndianRupee size={12} /> Pay
                        </button>
                        <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {received.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-ink/40">Received ({received.length})</p>
                {received.map((o: any) => (
                  <Card key={o.id} className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{itemName(o.itemId)}</p>
                      <p className="text-xs text-ink/40 truncate">Qty: {fmtNum(o.qty)} @ {fmtMoney(o.rate || 0, currency)} · {fmtDate(o.date)}{vendorName(o.vendorId) ? ` · ${vendorName(o.vendorId)}` : ""}{o.notes ? ` · ${o.notes}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-ink">{fmtMoney(o.amount || 0, currency)}</p>
                      <div className="flex items-center gap-2">
                        <InvoiceAttachment
                          order={o}
                          attachOrderInvoice={attachOrderInvoice}
                          removeOrderInvoice={removeOrderInvoice}
                          onView={setViewingImage}
                        />
                        <Badge status="Received" />
                        <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )
      }
    </div>
    {viewingImage && <ViewImageModal title="Vendor invoice" url={viewingImage} onClose={() => setViewingImage(null)} />}
    </>
  );
}
