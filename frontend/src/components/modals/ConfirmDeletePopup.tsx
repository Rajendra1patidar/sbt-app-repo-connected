import { ConfirmSheet } from "../ui/ConfirmSheet";

/**
 * Confirmation gate for deletes that are hard to safely undo in practice —
 * an Item with stock/order history, a Customer with dues, a Payment record.
 * Everything else keeps the fast optimistic-delete + undo-toast flow.
 * Now the same confirm sheet as everywhere else in the app (was a one-off centred card).
 */
export function ConfirmDeletePopup({ label, description, onConfirm, onCancel }: any) {
  return <ConfirmSheet title={`Delete ${label}?`} message={description} confirmLabel="Delete" tone="danger" onConfirm={onConfirm} onCancel={onCancel} />;
}
