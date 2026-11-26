import { useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "../ui/kit";
import { useSheetBehavior } from "../ui/useSheetBehavior";

/** Full-screen preview for a single photo — currently just the vendor bill attached to an order,
 *  but deliberately generic (title + url) so any "tap a thumbnail to see it full-size" can reuse it.
 *  It is a lightbox, not a sheet, but it behaves like one for the keyboard: focus moves in and stays
 *  in, Escape closes it (and only it, when it is open over a sheet), and focus goes back after. */
export function ViewImageModal({ title, url, onClose }: { title?: string; url: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useSheetBehavior(panelRef, onClose);
  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title || "Photo"} tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4 outline-none animate-fade-in" onClick={onClose}>
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex h-11 items-center rounded-full bg-white/10 px-4 text-[14px] font-medium text-white hover:bg-white/20">
          Open original
        </a>
        <IconButton label="Close" tone="inverse" onClick={onClose}><X size={18} /></IconButton>
      </div>
      {title && <p className="absolute left-4 top-5 text-[15px] font-medium text-white/80">{title}</p>}
      <img src={url} alt={title || "Photo"} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-sheet" />
    </div>
  );
}
