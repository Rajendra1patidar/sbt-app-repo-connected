import { MessageSquare, Printer } from "lucide-react";

export function ContractorSharePopup({ title, onFormat, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg font-bold text-ink">Share {title}</h3>
        <p className="mt-1 text-sm text-ink/50">Choose what to include, then how to send it.</p>
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink/40">Points + totals only</p>
            <div className="flex gap-2">
              <button onClick={() => onFormat("summary", "whatsapp")} className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-good-500 py-2.5 text-sm font-bold text-white active:scale-[0.98]"><MessageSquare size={15} /> WhatsApp</button>
              <button onClick={() => onFormat("summary", "print")} className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-sm font-semibold text-ink/70 active:scale-[0.98]"><Printer size={15} /> Print</button>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink/40">Full breakdown (cement, saria, items)</p>
            <div className="flex gap-2">
              <button onClick={() => onFormat("full", "whatsapp")} className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-good-500 py-2.5 text-sm font-bold text-white active:scale-[0.98]"><MessageSquare size={15} /> WhatsApp</button>
              <button onClick={() => onFormat("full", "print")} className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-sm font-semibold text-ink/70 active:scale-[0.98]"><Printer size={15} /> Print</button>
            </div>
          </div>
          <button onClick={onCancel} className="w-full rounded-full border border-line py-2.5 text-sm font-semibold text-ink/50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
