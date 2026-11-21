import { useSyncExternalStore, type ReactNode } from "react";
import { currentConfirm, settleConfirm, subscribeConfirm } from "../../lib/confirm";
import { PrimaryButton, SecondaryButton, Sheet } from "./kit";

/**
 * The app's one confirmation: a small sheet with a short question, an optional line of detail,
 * and one or two buttons. Replaces the browser's confirm/alert pop-ups and the old centred
 * "Delete?" card. Swipe down, Escape and tapping outside all mean Cancel.
 */
export function ConfirmSheet({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "action", onConfirm, onCancel, z = 80 }: {
  title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string | null; tone?: "action" | "danger";
  onConfirm: () => void; onCancel: () => void; z?: number;
}) {
  // For a delete, focus starts on Cancel. For anything else it starts on the main button.
  const focusCancel = tone === "danger" && cancelLabel !== null;
  return (
    <Sheet z={z} onClose={onCancel}
      // The heading wraps (a 28 px title would be cut off on a phone) and is a size smaller than a form's.
      title={<span className="block whitespace-normal text-[22px] leading-7">{title}</span>}
      footer={
        <div className="flex flex-col gap-2">
          <PrimaryButton tone={tone} onClick={onConfirm} autoFocus={!focusCancel}>{confirmLabel}</PrimaryButton>
          {cancelLabel !== null && <SecondaryButton size="lg" onClick={onCancel} autoFocus={focusCancel}>{cancelLabel}</SecondaryButton>}
        </div>
      }>
      {message ? <p className="whitespace-pre-line pb-3 text-[16px] leading-6 text-mute">{message}</p> : <div className="h-1" />}
    </Sheet>
  );
}

/** Draws whatever `confirm()` / `notice()` asked for. Mounted once, in App.tsx. */
export function ConfirmHost() {
  const pending = useSyncExternalStore(subscribeConfirm, currentConfirm, currentConfirm);
  if (!pending) return null;
  return (
    <ConfirmSheet key={pending.id} title={pending.title} message={pending.message}
      confirmLabel={pending.confirmLabel} cancelLabel={pending.cancelLabel} tone={pending.tone}
      onConfirm={() => settleConfirm(true)} onCancel={() => settleConfirm(false)} />
  );
}
