import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Confirmation gate for deletes that are hard to safely undo in practice —
 * an Item with stock/order history, a Customer with dues, a Payment record.
 * Everything else keeps the fast optimistic-delete + undo-toast flow.
 */
export function ConfirmDeletePopup({ label, description, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bad-50 text-bad-500">
            <AlertTriangle size={18} />
          </span>
          <h3 className="font-display text-lg font-bold text-ink">Delete {label}?</h3>
        </div>
        {description && <p className="mt-3 text-sm text-ink/60">{description}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/50">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-full bg-bad-500 py-3 text-sm font-bold text-white active:scale-[0.98]">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
