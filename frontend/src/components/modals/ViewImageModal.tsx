import React from "react";
import { X } from "lucide-react";

/** Full-screen preview for a single photo — currently just the vendor
 *  invoice image attached to an order, but deliberately generic (title +
 *  url) so any other "tap a thumbnail to see it full-size" need can reuse it. */
export function ViewImageModal({ title, url, onClose }: { title?: string; url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
        >
          Open original
        </a>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
          <X size={18} />
        </button>
      </div>
      {title && <p className="absolute top-5 left-4 text-sm font-semibold text-white/80">{title}</p>}
      <img
        src={url}
        alt={title || "Invoice"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
      />
    </div>
  );
}
