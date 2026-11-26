import React, { useEffect, useRef, useState } from "react";
import { Camera, ImageOff, Images, Loader2, X } from "lucide-react";
import { IconButton } from "../ui/kit";
import { api } from "../../lib/api";

/** Attach / view / remove the vendor's bill photo for one order. A small self-contained control
 *  (its own uploading state and hidden file inputs) so each order manages its upload on its own.
 *
 *  Invoice photos live in a private Telegram chat (see backend), fetched through our own
 *  authenticated API rather than a public URL — a plain <img src> can't send an Authorization
 *  header, so the photo is pulled down as a Blob here and turned into a local object URL.
 *
 *  Two separate hidden file inputs back the "attach" buttons: one with capture="environment" (opens
 *  the camera directly) and one without (opens the gallery / file picker), since a single input can't
 *  reliably offer both choices across mobile browsers. */
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
    // Object URLs only live in this tab's memory — revoke on cleanup so switching orders doesn't leak them.
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
    const label = thumbFailed ? "Couldn't load the bill photo" : thumbUrl ? "View vendor bill" : "Loading the bill photo";
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => thumbUrl && onView(thumbUrl)} disabled={!thumbUrl} aria-label={label} title={label}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-paper">
          {thumbUrl
            ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
            : thumbFailed
            ? <ImageOff size={16} className="text-mute" />
            : <Loader2 size={16} className="animate-spin text-mute" />}
        </button>
        <IconButton label="Remove bill photo" tone="quiet" onClick={() => removeOrderInvoice(order.id)}><X size={16} /></IconButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}
        className="inline-flex h-11 items-center gap-1.5 rounded-control border border-rule bg-card px-3 text-[15px] font-medium text-brand-600 transition active:scale-[0.97] disabled:opacity-50">
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        {uploading ? "Uploading…" : "Take photo"}
      </button>
      <IconButton label="Choose a bill photo from the gallery" variant="outline" onClick={() => galleryInputRef.current?.click()} disabled={uploading}>
        <Images size={18} />
      </IconButton>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
    </div>
  );
}
