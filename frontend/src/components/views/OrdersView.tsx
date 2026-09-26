import React, { useEffect, useRef, useState } from "react";
import { Camera, IndianRupee, ImageOff, Images, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Badge, Card, EmptyState, PillButton, Row, SectionDivider } from "../common/UIPrimitives";
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
 *  as a Blob here and turned into a local object URL for display.
 *
 *  Two separate hidden file inputs back the "attach" buttons: one with
 *  capture="environment" (opens the camera directly) and one without (opens
 *  the photo gallery/file picker), since a single input can't reliably offer
 *  both choices across mobile browsers. */
export function InvoiceAttachment({ order, attachOrderInvoice, removeOrderInvoice, onView }: any) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
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
        onClick={() => cameraInputRef.current?.click()}
        disabled={uploading}
        title="Take a photo"
        className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        {uploading ? "Uploading…" : "Attach bill"}
      </button>
      <button
        onClick={() => galleryInputRef.current?.click()}
        disabled={uploading}
        title="Choose from gallery"
        className="inline-flex items-center justify-center rounded-full border border-line p-1.5 text-ink/60 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
      >
        <Images size={14} />
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
      />
    </>
  );
}

type GroupBy = "item" | "vendor";

/** Buckets a list of orders/purchases by item or by vendor, sorted with the
 * highest-value group first, so "which vendor am I most exposed to" or
 * "how much of this item have I ordered" is a glance rather than a scan. */
function groupRecords(records: any[], groupBy: GroupBy, labelFor: (r: any) => string, keyFor: (r: any) => string) {
  const map = new Map<string, { key: string; label: string; records: any[] }>();
  for (const r of records) {
    const key = keyFor(r);
    if (!map.has(key)) map.set(key, { key, label: labelFor(r), records: [] });
    map.get(key)!.records.push(r);
  }
  return [...map.values()].sort(
    (a, b) => b.records.reduce((s, r) => s + (r.amount || 0), 0) - a.records.reduce((s, r) => s + (r.amount || 0), 0)
  );
}

export function OrdersView({ orders, items, vendors, categories, currency, openModal, payOrder, removeOrder, attachOrderInvoice, removeOrderInvoice }: any) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("item");
  const cats = categories?.length ? categories : ITEM_CATEGORIES;
  const itemName = (id: string) => items.find((it: any) => it.id === id)?.name || "Unknown item";
  const itemCategory = (id: string) => items.find((it: any) => it.id === id)?.category || "Others";
  const vendorName = (id?: string) => (id ? vendors.find((v: any) => v.id === id)?.name : null);
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const statusBadge = (status: string) => (status === "paid" ? "Paid" : status === "partial" ? "Partially Paid" : "Due");
  const q = search.trim().toLowerCase();
  const categoryFiltered = orders
    .filter((o: any) => category === "All" || itemCategory(o.itemId) === category)
    .filter((o: any) => !q || itemName(o.itemId).toLowerCase().includes(q) || (vendorName(o.vendorId) || "").toLowerCase().includes(q) || (o.notes || "").toLowerCase().includes(q));
  const pending = categoryFiltered.filter((o: any) => o.status === "Pending");
  const received = categoryFiltered.filter((o: any) => o.status === "Received");

  const groupsOf = (list: any[]) => groupBy === "vendor"
    ? groupRecords(list, "vendor", (o) => vendorName(o.vendorId) || "No vendor", (o) => o.vendorId || "__none__")
    : groupRecords(list, "item", (o) => itemName(o.itemId), (o) => o.itemId);

  const orderMeta = (o: any) => `Qty: ${fmtNum(o.qty)} @ ${fmtMoney(o.rate || 0, currency)} · ${fmtDate(o.date)}${groupBy === "vendor" ? "" : vendorName(o.vendorId) ? ` · ${vendorName(o.vendorId)}` : ""}${o.notes ? ` · ${o.notes}` : ""}`;

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
            placeholder="Search orders by item, vendor, or note..."
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {orders.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button" onClick={() => setGroupBy("item")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold ${groupBy === "item" ? "bg-ink text-white" : "border border-line/70 text-ink/60"}`}
          >
            By item
          </button>
          <button
            type="button" onClick={() => setGroupBy("vendor")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold ${groupBy === "vendor" ? "bg-ink text-white" : "border border-line/70 text-ink/60"}`}
          >
            By vendor
          </button>
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
        ? <p className="text-center text-sm text-ink/40 py-6">No orders match this category.</p>
        : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="mb-1 px-1 text-xs font-bold uppercase text-ink/40">Pending ({pending.length})</p>
                {groupsOf(pending).map((group) => (
                  <div key={group.key} className="mb-3">
                    {groupBy === "vendor" && (
                      <div className="flex items-center justify-between px-1 pb-1 pt-2">
                        <span className="text-sm font-semibold text-ink">{group.label}</span>
                        <span className="text-xs text-ink/40">{fmtMoney(group.records.reduce((s, r) => s + (r.amount || 0), 0), currency)} total</span>
                      </div>
                    )}
                    {group.records.map((o: any) => (
                      <Row key={o.id} onClick={() => openModal("orderDetail", { order: o })}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{itemName(o.itemId)}</p>
                            <p className="text-xs text-ink/40">{orderMeta(o)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-ink">{fmtMoney(o.amount || 0, currency)}</p>
                            <Badge status={statusBadge(o.paymentStatus)} />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <p className="text-xs text-ink/40">{round2((o.amount || 0) - (o.amountPaid || 0)) > 0 ? `${fmtMoney(round2((o.amount || 0) - (o.amountPaid || 0)), currency)} remaining` : "Fully paid"}</p>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                      </Row>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {pending.length > 0 && received.length > 0 && <SectionDivider className="my-1" />}
            {received.length > 0 && (
              <div>
                <p className="mb-1 px-1 text-xs font-bold uppercase text-ink/40">Received ({received.length})</p>
                {groupsOf(received).map((group) => (
                  <div key={group.key} className="mb-3">
                    {groupBy === "vendor" && (
                      <div className="flex items-center justify-between px-1 pb-1 pt-2">
                        <span className="text-sm font-semibold text-ink">{group.label}</span>
                        <span className="text-xs text-ink/40">{fmtMoney(group.records.reduce((s, r) => s + (r.amount || 0), 0), currency)} total</span>
                      </div>
                    )}
                    {group.records.map((o: any) => (
                      <Row key={o.id} className="flex items-center justify-between gap-2" onClick={() => openModal("orderDetail", { order: o })}>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{itemName(o.itemId)}</p>
                          <p className="text-xs text-ink/40">{orderMeta(o)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-ink">{fmtMoney(o.amount || 0, currency)}</p>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                      </Row>
                    ))}
                  </div>
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
